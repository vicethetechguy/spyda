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
  transfer_id: string | null
  target_user_id: string
  recipient_email: string
  spyda_id: string
  previous_balance: number
  new_balance: number
  sender_balance: number | null
}

export type AdminWalletRecipient = {
  user_id: string
  email: string
  spyda_id: string
  current_balance: number
}

export type OverviewStats = {
  total_users: number
  total_credits: number
  coupons_active: number
  coupons_redeemed: number
  credits_from_coupons: number
}

export type AdminNotification = {
  id: string
  event_type: string
  title: string
  message: string
  actor_user_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

function supabaseError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return new Error(message)
  }
  return new Error(fallback)
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export function parseAdminCreditTransfer(value: unknown, amount: number): AdminCreditTransfer {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') {
    throw new Error('The transfer did not return a recipient wallet.')
  }

  const receipt = row as Record<string, unknown>
  const senderBalance = Number(receipt.sender_balance)
  const newBalance = Number(receipt.new_balance)
  if (!Number.isFinite(newBalance)) {
    throw new Error('The database did not return a verified recipient balance.')
  }

  return {
    transfer_id: receipt.transfer_id ? String(receipt.transfer_id) : null,
    target_user_id: String(receipt.target_user_id),
    recipient_email: String(receipt.recipient_email || ''),
    spyda_id: String(receipt.spyda_id),
    previous_balance: Number.isFinite(Number(receipt.previous_balance))
      ? Number(receipt.previous_balance)
      : newBalance - amount,
    new_balance: newBalance,
    sender_balance: Number.isFinite(senderBalance) ? senderBalance : null,
  }
}

export async function generateCoupon(amount: number): Promise<Coupon> {
  const { data, error } = await supabase.rpc('generate_coupon', {
    p_credit_amount: amount,
    p_code: null,
  })
  if (error) throw supabaseError(error, 'Could not generate a coupon.')
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

  return parseAdminCreditTransfer(data, amount)
}

export async function lookupSpydaWallet(spydaId: string): Promise<AdminWalletRecipient> {
  const { data, error } = await supabase.rpc('admin_lookup_spyda_wallet', {
    p_spyda_id: spydaId,
  })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('No Spyda wallet was found for that ID.')

  return {
    user_id: String(row.user_id),
    email: String(row.email || ''),
    spyda_id: String(row.spyda_id),
    current_balance: Number(row.current_balance || 0),
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

export async function listAdminNotifications(limit = 30): Promise<AdminNotification[]> {
  const { data, error } = await supabase.rpc('admin_list_notifications', {
    p_limit: Math.max(1, Math.min(100, Math.round(limit))),
  })
  if (error) throw supabaseError(error, 'Could not load admin notifications.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    event_type: String(row.event_type || 'activity'),
    title: String(row.title || 'Spyda activity'),
    message: String(row.message || ''),
    actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {},
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at || ''),
  }))
}

export async function markAdminNotificationsRead(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc('admin_mark_notifications_read', {
    p_ids: ids?.length ? ids : null,
  })
  if (error) throw supabaseError(error, 'Could not update admin notifications.')
}
