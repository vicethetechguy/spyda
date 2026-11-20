import { supabase } from './supabase'

/**
 * Keys, prices and the wallet charge, shared by the chat and the classic
 * generation flow so both bill the same way.
 */

export const SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS = 20
export const SPYDA_GPT_IMAGE_ONLY_ROUND_CREDITS = 30
export const SPYDA_BYOK_ROUND_CREDITS = 5
/** Every 1,000 eligible credits used accrues 1 pre-launch SPYDA. */
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

// The database decides the amount from the selected model, rather than trusting
// a browser-provided price. It also awards SPYDA tokens at the 1,000-credit mark.
export async function chargeGenerationCredits(
  userId: string | undefined,
  provider: string,
  byok: boolean,
): Promise<number | null> {
  if (!userId) return 0
  const { data, error } = await supabase.rpc('charge_generation_credits', {
    p_model_mode: provider,
    p_byok: byok,
  })
  if (error) {
    console.error('Error charging Spyda credits:', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return Number(row?.tokens_awarded ?? 0)
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
