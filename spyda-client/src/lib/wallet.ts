import { supabase } from './supabase'

export type WalletTransaction = {
  id: string
  activity_type: 'funded' | 'spent' | 'earned' | 'adjustment'
  source: string
  description: string
  amount: number
  balance_after: number
  read_at: string | null
  created_at: string
}

export function parseWalletTransaction(value: unknown): WalletTransaction {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    id: String(row.id || ''),
    activity_type: String(row.activity_type || 'adjustment') as WalletTransaction['activity_type'],
    source: String(row.source || 'wallet'),
    description: String(row.description || 'Spyda credit activity'),
    amount: Number(row.amount || 0),
    balance_after: Number(row.balance_after || 0),
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at || ''),
  }
}

export async function listWalletNotifications(userId: string, limit = 25): Promise<WalletTransaction[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)))
  const fullSelect = 'id, activity_type, source, description, amount, balance_after, read_at, created_at'
  const legacySelect = 'id, activity_type, source, description, amount, balance_after, created_at'

  const result = await supabase
    .from('credit_transactions')
    .select(fullSelect)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (!result.error) return (result.data ?? []).map(parseWalletTransaction)

  // Keeps the feed useful while the read-state migration is being deployed.
  if (result.error.code === '42703' || /read_at/i.test(result.error.message)) {
    const legacy = await supabase
      .from('credit_transactions')
      .select(legacySelect)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)
    if (legacy.error) throw legacy.error
    return (legacy.data ?? []).map(row => ({ ...parseWalletTransaction(row), read_at: null }))
  }

  throw result.error
}

export async function markWalletNotificationsRead(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_wallet_notifications_read', {
    p_ids: ids?.length ? ids : null,
  })
  if (error) throw error
}
