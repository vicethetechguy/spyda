/**
 * Who is calling and whether they can pay, decided on the server.
 *
 * Every endpoint that spends the OpenAI key needs a Supabase access token
 * (`Authorization: Bearer <jwt>`). Image generation also reserves its credits
 * in the database before the image model runs, and refunds them if it fails,
 * so an image costs credits exactly once whatever the browser does afterwards.
 */
import { createClient } from '@supabase/supabase-js';

declare const process: {
  env: Record<string, string | undefined>;
};

export type BillingUser = { id: string };

export type GenerationCharge = {
  chargeId: string;
  creditsCharged: number;
  tokensAwarded: number;
  walletBalance: number;
};

/** The parts of a Supabase client this module uses, so tests can stand in for it. */
export type BillingDb = {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let cachedDb: BillingDb | null = null;
let dbOverride: BillingDb | null = null;

/** Tests swap the database in; pass null to go back to the real one. */
export function setBillingDb(db: BillingDb | null) {
  dbOverride = db;
}

export function billingDb(): BillingDb {
  if (dbOverride) return dbOverride;
  if (cachedDb) return cachedDb;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new HttpError(500, 'Spyda billing is not configured on the server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
  }
  cachedDb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as BillingDb;
  return cachedDb;
}

export function bearerToken(req: any): string {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/** The signed-in caller, or a 401. */
export async function requireUser(req: any): Promise<BillingUser> {
  const jwt = bearerToken(req);
  if (!jwt) throw new HttpError(401, 'Sign in to use Spyda.');
  const { data, error } = await billingDb().auth.getUser(jwt);
  const id = data?.user?.id;
  if (error || !id) throw new HttpError(401, 'Your session has expired. Sign in again.');
  return { id };
}

/** 'groq' (Groq + GPT-Image 2), 'openai' (GPT-Image 2 only) or 'groq-only' (Groq alone, no images), as the app sends it. */
export function readModelMode(req: any, fallback?: unknown): string {
  const value = String(req?.headers?.['x-spyda-model-mode'] || fallback || '').trim().toLowerCase();
  if (value === 'groq-only') return 'groq-only';
  return value === 'groq' ? 'groq' : 'openai';
}

/** Groq has no image model, so "Groq only" cannot make a new image. */
export const GROQ_ONLY_NO_IMAGES = 'Groq only can chat and edit in Canvas mode, but it cannot make new images. Switch the AI model to GPT-Image 2 or Groq + GPT-Image 2 to generate a version.';

/** The caller pays with their own OpenAI key when they send one. */
export function isByok(req: any): boolean {
  return Boolean(String(req?.headers?.['x-spyda-openai-key'] || '').trim());
}

/** Takes the credits now; the database decides the price and awards SPYDA. */
export async function reserveGenerationCredits(userId: string, modelMode: string, byok: boolean): Promise<GenerationCharge> {
  const { data, error } = await billingDb().rpc('reserve_generation_credits', {
    p_user_id: userId,
    p_model_mode: modelMode,
    p_byok: byok,
  });
  if (error) {
    const message = String(error.message || '');
    if (error.code === 'P0001' || /not enough/i.test(message)) {
      throw new HttpError(402, 'Not enough Spyda credits for this generation. Top up your wallet and try again.');
    }
    if (error.code === '22023') throw new HttpError(400, 'Unknown generation model.');
    if (error.code === 'P0002') throw new HttpError(402, 'No Spyda wallet was found for this account.');
    throw new HttpError(500, 'Spyda could not charge credits for this generation.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.charge_id) throw new HttpError(500, 'Spyda could not charge credits for this generation.');
  return {
    chargeId: String(row.charge_id),
    creditsCharged: Number(row.credits_charged || 0),
    tokensAwarded: Number(row.tokens_awarded || 0),
    walletBalance: Number(row.wallet_balance || 0),
  };
}

/** Gives the credits back. Never throws: a failed refund must not hide the original error. */
export async function refundGenerationCredits(chargeId: string): Promise<boolean> {
  try {
    const { data, error } = await billingDb().rpc('refund_generation_credits', { p_charge_id: chargeId });
    if (error) {
      console.error('Spyda could not refund generation charge', chargeId, error);
      return false;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return Boolean(row?.refunded);
  } catch (error) {
    console.error('Spyda could not refund generation charge', chargeId, error);
    return false;
  }
}

/**
 * Charges first, runs the generation, refunds if it throws or produced nothing.
 * The charge details come back so the app can show the SPYDA award.
 */
export async function withGenerationCharge<T>(
  userId: string,
  modelMode: string,
  byok: boolean,
  run: () => Promise<T>,
  succeeded: (result: T) => boolean = () => true,
): Promise<{ result: T; charge: GenerationCharge }> {
  if (modelMode === 'groq-only') throw new HttpError(400, GROQ_ONLY_NO_IMAGES);
  const charge = await reserveGenerationCredits(userId, modelMode, byok);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await refundGenerationCredits(charge.chargeId);
    throw error;
  }
  if (!succeeded(result)) {
    await refundGenerationCredits(charge.chargeId);
    throw new HttpError(502, 'The image model returned no picture. Your credits were refunded.');
  }
  return { result, charge };
}

export function billingSummary(charge: GenerationCharge) {
  return {
    creditsCharged: charge.creditsCharged,
    tokensAwarded: charge.tokensAwarded,
    walletBalance: charge.walletBalance,
  };
}

export function sendError(res: any, error: any, fallback: string) {
  if (error instanceof HttpError) return res.status(error.status).json({ ok: false, error: error.message });
  return res.status(500).json({ ok: false, error: String(error?.message || fallback) });
}
