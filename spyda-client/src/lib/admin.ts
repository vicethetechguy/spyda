import { supabase } from './supabase'

// The single Spyda administrator. Must match is_spyda_admin() in the
// coupons + admin SQL migration.
export const ADMIN_EMAIL = 'admin@spydadesigns.xyz'

export function isAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === ADMIN_EMAIL
}

// Quick-pick coupon denominations. Admins can also enter any whole amount
// between 1 and 10,000,000 credits.
export const COUPON_AMOUNTS = [500, 1000, 2800] as const

export type Coupon = {
  id: string
  code: string
  credit_amount: number
  status: 'active' | 'redeemed' | 'void'
  redeemed_by: string | null
  redeemed_email: string | null
  redeemed_at: string | null
  created_at: string
}

export type AdminUser = {
  id: string
  email: string
  spyda_id: string
  wallet_balance: number
  is_admin: boolean
  created_at: string
}

export type AdminCreditTransfer = {
  target_user_id: string
  spyda_id: string
  new_balance: number
  sender_balance: number
}

export type OverviewStats = {
  total_users: number
  total_credits: number
  coupons_active: number
  coupons_redeemed: number
  credits_from_coupons: number
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export async function generateCoupon(amount: number): Promise<Coupon> {
  const { data, error } = await supabase.rpc('generate_coupon', { p_credit_amount: amount })
  if (error) throw error
  return data as Coupon
}

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.rpc('admin_list_coupons')
  if (error) throw error
  return (data ?? []) as Coupon[]
}

// Redeem a coupon on the current user's wallet. Returns the credited amount and
// the wallet's new balance. Any signed-in user may call this.
export async function redeemCoupon(code: string): Promise<{ credit_amount: number; new_balance: number }> {
  const { data, error } = await supabase.rpc('redeem_coupon', { p_code: code })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('That coupon code is not valid.')
  return { credit_amount: Number(row.credit_amount), new_balance: Number(row.new_balance) }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return (data ?? []) as AdminUser[]
}

export async function adjustCredits(userId: string, delta: number): Promise<number> {
  const { data, error } = await supabase.rpc('admin_adjust_credits', { p_user_id: userId, p_delta: delta })
  if (error) throw error
  return Number(data)
}

export async function sendCreditsBySpydaId(
  spydaId: string,
  amount: number,
  note?: string,
): Promise<AdminCreditTransfer> {
  const { data, error } = await supabase.rpc('admin_send_credits_by_spyda_id', {
    p_spyda_id: spydaId,
    p_amount: amount,
    p_note: note?.trim() || null,
  })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The transfer did not return a recipient wallet.')

  return {
    target_user_id: String(row.target_user_id),
    spyda_id: String(row.spyda_id),
    new_balance: Number(row.new_balance),
    sender_balance: Number(row.sender_balance),
  }
}

// ── Overview ─────────────────────────────────────────────────────────────────

export async function overviewStats(): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc('admin_overview_stats')
  if (error) throw error
  const s = (data ?? {}) as Record<string, number>
  return {
    total_users: Number(s.total_users ?? 0),
    total_credits: Number(s.total_credits ?? 0),
    coupons_active: Number(s.coupons_active ?? 0),
    coupons_redeemed: Number(s.coupons_redeemed ?? 0),
    credits_from_coupons: Number(s.credits_from_coupons ?? 0),
  }
}
