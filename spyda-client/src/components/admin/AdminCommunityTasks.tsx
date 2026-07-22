import { useCallback, useEffect, useState } from 'react'
import { Check, CircleCheck, Gift, Loader2, Pause, Play, Plus, RefreshCw, XCircle } from 'lucide-react'
import {
  adminCreateCommunityTask,
  adminListCommunityTaskClaims,
  adminListCommunityTasks,
  adminReviewCommunityTaskClaim,
  adminSetCommunityTaskActive,
  type AdminCommunityTask,
  type AdminCommunityTaskClaim,
} from '../../lib/community-tasks'

const emptyDraft = { title: '', description: '', actionUrl: '', actionLabel: 'Open task', verificationHint: 'Paste the link or handle that proves you completed this task.', rewardCredits: '60' }

function taskLoadError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null
  if (value?.code === 'PGRST202') return 'The task database update has not been applied yet. Run the latest Spyda Supabase migration, then refresh this page.'
  if (typeof value?.message === 'string' && value.message.trim()) return value.message
  return 'Could not load community tasks.'
}

export function AdminCommunityTasks() {
  const [tasks, setTasks] = useState<AdminCommunityTask[]>([])
  const [claims, setClaims] = useState<AdminCommunityTaskClaim[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextTasks, nextClaims] = await Promise.all([adminListCommunityTasks(), adminListCommunityTaskClaims('pending')])
      setTasks(nextTasks)
      setClaims(nextClaims)
      setError('')
    } catch (loadError) {
      setError(taskLoadError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    const reward = Number(draft.rewardCredits)
    if (!draft.title.trim() || !draft.description.trim() || !Number.isInteger(reward) || reward < 1) {
      setError('Add a task title, description, and a whole-number credit reward.')
      return
    }
    setCreating(true); setError(''); setNotice('')
    try {
      await adminCreateCommunityTask({ ...draft, rewardCredits: reward })
      setDraft(emptyDraft)
      setNotice('Task published. It is now visible in every eligible user workspace.')
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the task.')
    } finally { setCreating(false) }
  }

  const toggle = async (task: AdminCommunityTask) => {
    setBusyId(task.id); setError(''); setNotice('')
    try {
      await adminSetCommunityTaskActive(task.id, !task.is_active)
      setNotice(task.is_active ? 'Task paused. Existing participants can still see their claim status.' : 'Task reactivated.')
      await load()
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : 'Could not update this task.') }
    finally { setBusyId(null) }
  }

  const review = async (claim: AdminCommunityTaskClaim, approved: boolean) => {
    setBusyId(claim.claim_id); setError(''); setNotice('')
    try {
      const result = await adminReviewCommunityTaskClaim(claim.claim_id, approved, notes[claim.claim_id])
      setNotice(approved ? `${result?.credits_awarded || claim.reward_credits} Spyda Credits awarded to ${result?.recipient_email || claim.email} (${result?.spyda_id || claim.spyda_id}).` : `Task proof returned to ${claim.email} for correction.`)
      await load()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : 'Could not review this participant.') }
    finally { setBusyId(null) }
  }

  return <div>
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary"><Gift className="h-3.5 w-3.5" /> Community rewards</div><h2 className="mt-2 font-heading text-xl font-semibold">Tasks & participant awards</h2><p className="mt-1 text-sm text-muted-foreground">Publish a task, review proof, then release credits directly from the admin wallet.</p></div><button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
    {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm text-primary"><CircleCheck className="h-4 w-4" />{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

    <form onSubmit={create} className="mb-6 rounded-xl border border-white/[0.09] bg-white/[0.018] p-5"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h3 className="font-heading text-base font-semibold">Create a task</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Task title</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="Follow Spyda on Instagram" className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" /></label><label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reward</span><input type="number" min="1" max="1000000" value={draft.rewardCredits} onChange={event => setDraft(current => ({ ...current, rewardCredits: event.target.value }))} className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" /></label></div><label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What should participants do?</span><textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} maxLength={600} rows={3} placeholder="Tell participants exactly what to do." className="w-full resize-y rounded-lg border border-white/[0.1] bg-background/60 p-3 text-sm outline-none focus:border-primary/50" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Task link (optional)</span><input value={draft.actionUrl} onChange={event => setDraft(current => ({ ...current, actionUrl: event.target.value }))} placeholder="https://..." className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" /></label><label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Button label</span><input value={draft.actionLabel} onChange={event => setDraft(current => ({ ...current, actionLabel: event.target.value }))} maxLength={40} className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" /></label></div><label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proof instruction</span><input value={draft.verificationHint} onChange={event => setDraft(current => ({ ...current, verificationHint: event.target.value }))} maxLength={500} className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" /></label><button type="submit" disabled={creating} className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Publish task</button></form>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"><section className="rounded-xl border border-white/[0.09] bg-white/[0.018]"><div className="border-b border-white/[0.07] px-5 py-4"><h3 className="font-heading text-base font-semibold">Published tasks</h3></div><div className="divide-y divide-white/[0.07]">{loading ? <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !tasks.length ? <p className="p-5 text-sm text-muted-foreground">No campaign tasks have been created.</p> : tasks.map(task => <div key={task.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{task.title}</h4><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${task.is_active ? 'bg-primary/10 text-primary' : 'bg-white/[0.07] text-muted-foreground'}`}>{task.is_active ? 'Live' : 'Paused'}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p><p className="mt-2 text-[11px] text-muted-foreground">{task.participant_count} participants / {task.pending_count} waiting / {task.approved_count} rewarded</p></div><span className="shrink-0 text-sm font-semibold text-primary">+{task.reward_credits}</span></div><button type="button" onClick={() => void toggle(task)} disabled={busyId === task.id} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">{busyId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : task.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{task.is_active ? 'Pause task' : 'Reactivate'}</button></div>)}</div></section>
      <section className="rounded-xl border border-white/[0.09] bg-white/[0.018]"><div className="border-b border-white/[0.07] px-5 py-4"><h3 className="font-heading text-base font-semibold">Proof waiting for review</h3></div><div className="divide-y divide-white/[0.07]">{loading ? <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !claims.length ? <p className="p-5 text-sm text-muted-foreground">No participant proof is waiting.</p> : claims.map(claim => <article key={claim.claim_id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{claim.task_title}</h4><p className="mt-1 text-xs text-muted-foreground">{claim.email} / <span className="font-mono text-primary/80">{claim.spyda_id}</span></p><p className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-3 text-xs leading-5 text-foreground/85">{claim.proof}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">+{claim.reward_credits}</span></div><label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review note</span><input value={notes[claim.claim_id] || ''} onChange={event => setNotes(current => ({ ...current, [claim.claim_id]: event.target.value }))} placeholder="Optional on approval; recommended when rejecting" className="h-10 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-xs outline-none focus:border-primary/50" /></label><div className="mt-3 flex gap-2"><button type="button" onClick={() => void review(claim, false)} disabled={busyId === claim.claim_id} className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 text-xs font-semibold text-destructive disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Return</button><button type="button" onClick={() => void review(claim, true)} disabled={busyId === claim.claim_id} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busyId === claim.claim_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve + award</button></div></article>)}</div></section></div>
  </div>
}
