import { supabase } from './supabase'

export const WELCOME_REWARD_CREDITS = 60
export const SPYDA_PINNED_POST_URL = 'https://x.com/i/status/2078473548688216257'

export type WelcomeTaskId = 'follow_spyda' | 'repost_pinned' | 'follow_vice'
export type WelcomeRewardStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type WelcomeRewardClaim = {
  user_id: string
  follow_spyda: boolean
  repost_pinned: boolean
  follow_vice: boolean
  x_handle: string | null
  status: WelcomeRewardStatus
  admin_note: string | null
  credits_awarded: number
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type AdminWelcomeRewardClaim = WelcomeRewardClaim & {
  email: string
  spyda_id: string
  wallet_balance: number | null
  payout_id: string | null
}

export type WelcomeRewardReviewResult = {
  status: 'approved' | 'rejected'
  user_balance: number
  admin_balance: number
  recipient_email: string
  spyda_id: string
  x_handle: string
  payout_id: string | null
}

export const WELCOME_TASKS: Array<{
  id: WelcomeTaskId
  title: string
  description: string
  account: string
  url: string
}> = [
  {
    id: 'follow_spyda',
    title: 'Follow Spyda on X',
    description: 'Follow Spyda for product releases, design intelligence, and community updates.',
    account: '@spydadesign',
    url: 'https://x.com/spydadesign',
  },
  {
    id: 'repost_pinned',
    title: "Repost Spyda's pinned post",
    description: 'Share the pinned Spyda post with your creative community.',
    account: 'Pinned post',
    url: SPYDA_PINNED_POST_URL,
  },
  {
    id: 'follow_vice',
    title: 'Follow Vice on X',
    description: 'Follow the builder behind Spyda and the wider product journey.',
    account: '@viceonchain',
    url: 'https://x.com/viceonchain',
  },
]

export function normalizeXHandle(value: string): string {
  return value.trim().replace(/^@+/, '')
}

export function isValidXHandle(value: string): boolean {
  return /^[A-Za-z0-9_]{1,30}$/.test(normalizeXHandle(value))
}

export function completedWelcomeTaskCount(claim?: WelcomeRewardClaim | null): number {
  if (!claim) return 0
  return Number(claim.follow_spyda) + Number(claim.repost_pinned) + Number(claim.follow_vice)
}

function parseClaim(value: unknown): WelcomeRewardClaim | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return null
  const claim = row as Record<string, unknown>
  return {
    user_id: String(claim.user_id || ''),
    follow_spyda: Boolean(claim.follow_spyda),
    repost_pinned: Boolean(claim.repost_pinned),
    follow_vice: Boolean(claim.follow_vice),
    x_handle: claim.x_handle ? String(claim.x_handle) : null,
    status: String(claim.status || 'draft') as WelcomeRewardStatus,
    admin_note: claim.admin_note ? String(claim.admin_note) : null,
    credits_awarded: Number(claim.credits_awarded || 0),
    submitted_at: claim.submitted_at ? String(claim.submitted_at) : null,
    reviewed_at: claim.reviewed_at ? String(claim.reviewed_at) : null,
    created_at: String(claim.created_at || ''),
    updated_at: String(claim.updated_at || ''),
  }
}

export async function getWelcomeRewardClaim(): Promise<WelcomeRewardClaim | null> {
  const { data, error } = await supabase.rpc('get_welcome_reward_claim')
  if (error) throw error
  return parseClaim(data)
}

export async function saveWelcomeRewardTask(task: WelcomeTaskId, completed: boolean): Promise<WelcomeRewardClaim> {
  const { data, error } = await supabase.rpc('save_welcome_reward_task', {
    p_task: task,
    p_completed: completed,
  })
  if (error) throw error
  const claim = parseClaim(data)
  if (!claim) throw new Error('Spyda could not save this task.')
  return claim
}

export async function submitWelcomeRewardClaim(handle: string): Promise<WelcomeRewardClaim> {
  const { data, error } = await supabase.rpc('submit_welcome_reward_claim', {
    p_x_handle: normalizeXHandle(handle),
  })
  if (error) throw error
  const claim = parseClaim(data)
  if (!claim) throw new Error('Spyda could not submit this task claim.')
  return claim
}

export async function adminListWelcomeRewardClaims(status?: WelcomeRewardStatus): Promise<AdminWelcomeRewardClaim[]> {
  const { data, error } = await supabase.rpc('admin_list_welcome_reward_claims', {
    p_status: status || null,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...parseClaim(row)!,
    email: String(row.email || ''),
    spyda_id: String(row.spyda_id || ''),
    wallet_balance: row.wallet_balance === null || row.wallet_balance === undefined
      ? null
      : Number(row.wallet_balance),
    payout_id: row.payout_id ? String(row.payout_id) : null,
  }))
}

export async function adminReviewWelcomeRewardClaim(
  userId: string,
  approved: boolean,
  note?: string,
): Promise<WelcomeRewardReviewResult> {
  const { data, error } = await supabase.rpc('admin_review_welcome_reward_claim', {
    p_user_id: userId,
    p_approved: approved,
    p_note: note?.trim() || null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Spyda could not complete this task review.')
  return {
    status: String(row.status) as WelcomeRewardReviewResult['status'],
    user_balance: Number(row.user_balance),
    admin_balance: Number(row.admin_balance),
    recipient_email: String(row.recipient_email || ''),
    spyda_id: String(row.spyda_id || ''),
    x_handle: String(row.x_handle || ''),
    payout_id: row.payout_id ? String(row.payout_id) : null,
  }
}
