import { supabase } from './supabase'

/**
 * Keys, prices and request headers, shared by the chat and the classic
 * generation flow so both bill the same way. The charge itself happens on the
 * server (api/_billing.ts).
 */

export const SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS = 20
export const SPYDA_GPT_IMAGE_ONLY_ROUND_CREDITS = 30
export const SPYDA_BYOK_ROUND_CREDITS = 5
/** One Claude Opus 5.5 motion design. Priced in the database; shown before sending. */
export const SPYDA_MOTION_CREDITS = 50
/** SPYDA rates are quoted per 1,000 eligible credits used; the rate itself depends on signup order (see SPYDA_TIERS in rewards.ts). */
export const CREDITS_PER_SPYDA = 1000

export function getManagedGenerationCredits(provider: string): number {
  return provider === 'openai'
    ? SPYDA_GPT_IMAGE_ONLY_ROUND_CREDITS
    : SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS
}

/** What one generated image costs this person, shown before they confirm. */
export function generationCreditCost(provider: string, byok: boolean) {
  return byok ? SPYDA_BYOK_ROUND_CREDITS : getManagedGenerationCredits(provider)
}

export type SpydaApiKeys = { openai: string; groq: string }

export async function loadSpydaApiKeys(userId?: string): Promise<SpydaApiKeys> {
  if (!userId) return { openai: '', groq: '' }
  const { data, error } = await supabase
    .from('profiles')
    .select('openai_key, groq_key')
    .eq('id', userId)
    .single()
  if (error) return { openai: '', groq: '' }
  return {
    openai: String(data?.openai_key || '').trim(),
    groq: String(data?.groq_key || '').trim(),
  }
}

export function apiKeyRequestHeaders(keys: SpydaApiKeys): Record<string, string> {
  return {
    ...(keys.openai ? { 'x-spyda-openai-key': keys.openai } : {}),
    ...(keys.groq ? { 'x-spyda-groq-key': keys.groq } : {}),
  }
}

/**
 * Headers every Spyda API call needs: the signed-in session's access token,
 * the selected model (the server prices the generation from it) and any
 * personal keys. The server charges credits itself before an image is
 * generated, so the browser never charges.
 */
export async function spydaRequestHeaders(keys: SpydaApiKeys, modelMode?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(modelMode ? { 'x-spyda-model-mode': modelMode } : {}),
    ...apiKeyRequestHeaders(keys),
  }
}

export type RewardStanding = {
  credits: number
  spyda: number
  creditsSpent: number
  /** Credits still to use before the next SPYDA accrues. */
  toNextSpyda: number
}

export function rewardStandingFrom(row: { wallet_balance?: unknown; spyda_token_balance?: unknown; credits_spent_total?: unknown } | null): RewardStanding {
  const creditsSpent = Math.max(0, Number(row?.credits_spent_total || 0))
  return {
    credits: Math.max(0, Number(row?.wallet_balance || 0)),
    spyda: Math.max(0, Number(row?.spyda_token_balance || 0)),
    creditsSpent,
    toNextSpyda: CREDITS_PER_SPYDA - (creditsSpent % CREDITS_PER_SPYDA),
  }
}

export async function loadRewardStanding(userId?: string): Promise<RewardStanding | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet_balance, spyda_token_balance, credits_spent_total')
    .eq('id', userId)
    .maybeSingle()
  return error ? null : rewardStandingFrom(data)
}
