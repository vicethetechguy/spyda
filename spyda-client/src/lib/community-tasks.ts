import { supabase } from './supabase'

export type CommunityTaskStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type CommunityTask = {
  id: string
  title: string
  description: string
  action_url: string | null
  action_label: string
  verification_hint: string
  reward_credits: number
  is_active: boolean
  created_at: string
  claim_id: string | null
  claim_status: CommunityTaskStatus | null
  proof: string | null
  admin_note: string | null
  credits_awarded: number
  submitted_at: string | null
  reviewed_at: string | null
}

export type AdminCommunityTask = Omit<CommunityTask, 'claim_id' | 'claim_status' | 'proof' | 'admin_note' | 'credits_awarded' | 'submitted_at' | 'reviewed_at'> & {
  participant_count: number
  pending_count: number
  approved_count: number
}

export type AdminCommunityTaskClaim = {
  claim_id: string
  task_id: string
  task_title: string
  reward_credits: number
  user_id: string
  email: string
  spyda_id: string
  proof: string | null
  status: CommunityTaskStatus
  admin_note: string | null
  credits_awarded: number
  submitted_at: string | null
  reviewed_at: string | null
}

const parseTask = (row: Record<string, unknown>): CommunityTask => ({
  id: String(row.id || ''), title: String(row.title || ''), description: String(row.description || ''),
  action_url: row.action_url ? String(row.action_url) : null, action_label: String(row.action_label || 'Open task'),
  verification_hint: String(row.verification_hint || ''), reward_credits: Number(row.reward_credits || 0),
  is_active: Boolean(row.is_active), created_at: String(row.created_at || ''), claim_id: row.claim_id ? String(row.claim_id) : null,
  claim_status: row.claim_status ? String(row.claim_status) as CommunityTaskStatus : null, proof: row.proof ? String(row.proof) : null,
  admin_note: row.admin_note ? String(row.admin_note) : null, credits_awarded: Number(row.credits_awarded || 0),
  submitted_at: row.submitted_at ? String(row.submitted_at) : null, reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
})

export async function listCommunityTasks(): Promise<CommunityTask[]> {
  const { data, error } = await supabase.rpc('list_community_tasks')
  if (error) throw error
  return (data ?? []).map((row: unknown) => parseTask(row as Record<string, unknown>))
}

export async function getCommunityTaskBadgeCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_community_task_badge_count')
  if (error) throw error
  return Number(data || 0)
}

export async function submitCommunityTaskClaim(taskId: string, proof: string): Promise<void> {
  const { error } = await supabase.rpc('submit_community_task_claim', { p_task_id: taskId, p_proof: proof.trim() })
  if (error) throw error
}

export async function adminListCommunityTasks(): Promise<AdminCommunityTask[]> {
  const { data, error } = await supabase.rpc('admin_list_community_tasks')
  if (error) throw error
  return (data ?? []).map((row: unknown) => ({ ...parseTask(row as Record<string, unknown>), participant_count: Number((row as Record<string, unknown>).participant_count || 0), pending_count: Number((row as Record<string, unknown>).pending_count || 0), approved_count: Number((row as Record<string, unknown>).approved_count || 0) }))
}

export async function adminCreateCommunityTask(input: { title: string; description: string; actionUrl: string; actionLabel: string; verificationHint: string; rewardCredits: number }): Promise<void> {
  const { error } = await supabase.rpc('admin_create_community_task', { p_title: input.title.trim(), p_description: input.description.trim(), p_action_url: input.actionUrl.trim(), p_action_label: input.actionLabel.trim(), p_verification_hint: input.verificationHint.trim(), p_reward_credits: input.rewardCredits })
  if (error) throw error
}

export async function adminSetCommunityTaskActive(taskId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_community_task_active', { p_task_id: taskId, p_is_active: active })
  if (error) throw error
}

export async function adminListCommunityTaskClaims(status: CommunityTaskStatus | null = 'pending'): Promise<AdminCommunityTaskClaim[]> {
  const { data, error } = await supabase.rpc('admin_list_community_task_claims', { p_status: status })
  if (error) throw error
  return (data ?? []).map((row: unknown) => {
    const value = row as Record<string, unknown>
    return { claim_id: String(value.claim_id || ''), task_id: String(value.task_id || ''), task_title: String(value.task_title || ''), reward_credits: Number(value.reward_credits || 0), user_id: String(value.user_id || ''), email: String(value.email || ''), spyda_id: String(value.spyda_id || ''), proof: value.proof ? String(value.proof) : null, status: String(value.status || 'draft') as CommunityTaskStatus, admin_note: value.admin_note ? String(value.admin_note) : null, credits_awarded: Number(value.credits_awarded || 0), submitted_at: value.submitted_at ? String(value.submitted_at) : null, reviewed_at: value.reviewed_at ? String(value.reviewed_at) : null }
  })
}

export async function adminReviewCommunityTaskClaim(claimId: string, approved: boolean, note?: string) {
  const { data, error } = await supabase.rpc('admin_review_community_task_claim', { p_claim_id: claimId, p_approved: approved, p_note: note?.trim() || null })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as { user_balance: number; recipient_email: string; spyda_id: string; credits_awarded: number } | null
}
