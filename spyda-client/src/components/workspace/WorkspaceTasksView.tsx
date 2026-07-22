import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  AtSign,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  ExternalLink,
  Gift,
  Loader2,
  Repeat2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import {
  WELCOME_REWARD_CREDITS,
  WELCOME_TASKS,
  completedWelcomeTaskCount,
  getWelcomeRewardClaim,
  isValidXHandle,
  normalizeXHandle,
  saveWelcomeRewardTask,
  submitWelcomeRewardClaim,
  type WelcomeRewardClaim,
  type WelcomeTaskId,
} from '../../lib/rewards'
import { listCommunityTasks, submitCommunityTaskClaim, type CommunityTask } from '../../lib/community-tasks'

const taskIcons = {
  follow_spyda: AtSign,
  repost_pinned: Repeat2,
  follow_vice: AtSign,
} satisfies Record<WelcomeTaskId, typeof AtSign>

function taskErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '')
    if (code === 'PGRST202') {
      return 'The Spyda rewards service is being connected. Please try again shortly.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return fallback
}

export function WelcomeRewardPrompt({
  onOpenTasks,
  onDismiss,
}: {
  onOpenTasks: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-reward-title" className="relative w-full max-w-[520px] overflow-hidden rounded-xl border border-primary/25 bg-[#080b09] shadow-[0_30px_100px_rgba(0,0,0,.65)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#9dfab0,#8bd3ff,#ffffff)]" />
        <div className="absolute right-0 top-0 h-44 w-44 bg-primary/[0.08] blur-[70px]" />
        <button type="button" onClick={onDismiss} aria-label="Dismiss reward" className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-black/20 text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Welcome reward</p>
              <p className="mt-1 text-xs text-muted-foreground">Available to new and existing accounts</p>
            </div>
          </div>

          <h2 id="welcome-reward-title" className="mt-7 max-w-[420px] font-heading text-3xl font-semibold leading-tight sm:text-[38px]">
            Get <span className="text-gradient-green">60 free Spyda Credits.</span>
          </h2>
          <p className="mt-3 max-w-[440px] text-sm leading-6 text-muted-foreground">
            Complete three quick community tasks, submit your X handle, and Spyda Admin will verify your reward.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {WELCOME_TASKS.map((task, index) => (
              <div key={task.id} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
                <span className="text-[10px] font-semibold text-primary">0{index + 1}</span>
                <p className="mt-2 text-xs font-medium leading-5">{task.title}</p>
              </div>
            ))}
          </div>

          <button type="button" onClick={onOpenTasks} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Start tasks <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">One reward per Spyda account. Approval is completed manually by Spyda Admin.</p>
        </div>
      </div>
    </div>
  )
}

export function TasksView({
  onClaimChange,
}: {
  onClaimChange?: (claim: WelcomeRewardClaim | null) => void
}) {
  const [claim, setClaim] = useState<WelcomeRewardClaim | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingTask, setSavingTask] = useState<WelcomeTaskId | null>(null)
  const [xHandle, setXHandle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const onClaimChangeRef = useRef(onClaimChange)

  useEffect(() => {
    onClaimChangeRef.current = onClaimChange
  }, [onClaimChange])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextClaim = await getWelcomeRewardClaim()
      setClaim(nextClaim)
      setXHandle(nextClaim?.x_handle || '')
      onClaimChangeRef.current?.(nextClaim)
    } catch (loadError) {
      setError(taskErrorMessage(loadError, 'Spyda could not load your tasks.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const completedCount = completedWelcomeTaskCount(claim)
  const progress = Math.round((completedCount / WELCOME_TASKS.length) * 100)
  const locked = claim?.status === 'pending' || claim?.status === 'approved'
  const readyToSubmit = completedCount === WELCOME_TASKS.length && !locked

  const toggleTask = async (task: WelcomeTaskId) => {
    if (locked || savingTask) return
    const completed = Boolean(claim?.[task])
    setSavingTask(task)
    setError('')
    try {
      const nextClaim = await saveWelcomeRewardTask(task, !completed)
      setClaim(nextClaim)
      onClaimChangeRef.current?.(nextClaim)
    } catch (taskError) {
      setError(taskErrorMessage(taskError, 'Spyda could not save this task.'))
    } finally {
      setSavingTask(null)
    }
  }

  const submitClaim = async (event: FormEvent) => {
    event.preventDefault()
    if (!readyToSubmit || submitting) return
    if (!isValidXHandle(xHandle)) {
      setError('Enter a valid X handle, for example @spydadesign.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const nextClaim = await submitWelcomeRewardClaim(xHandle)
      setClaim(nextClaim)
      setXHandle(nextClaim.x_handle || normalizeXHandle(xHandle))
      onClaimChangeRef.current?.(nextClaim)
    } catch (submitError) {
      setError(taskErrorMessage(submitError, 'Spyda could not submit your claim.'))
    } finally {
      setSubmitting(false)
    }
  }

  const statusContent = useMemo(() => {
    if (claim?.status === 'approved') {
      return {
        icon: CircleCheck,
        title: 'Reward approved',
        detail: `${WELCOME_REWARD_CREDITS} Spyda Credits have been added to your wallet.`,
        className: 'border-primary/25 bg-primary/[0.055] text-primary',
      }
    }
    if (claim?.status === 'pending') {
      return {
        icon: Clock3,
        title: 'Verification in progress',
        detail: `Spyda Admin is reviewing @${claim.x_handle}. Your credits will arrive automatically after approval.`,
        className: 'border-[#8bd3ff]/25 bg-[#8bd3ff]/[0.05] text-[#8bd3ff]',
      }
    }
    if (claim?.status === 'rejected') {
      return {
        icon: CircleX,
        title: 'Verification needs attention',
        detail: claim.admin_note || 'Review the tasks, confirm your X activity, and submit again.',
        className: 'border-amber-500/25 bg-amber-500/[0.05] text-amber-300',
      }
    }
    return null
  }, [claim])

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.02]">
        <div className="relative border-b border-white/[0.07] px-5 py-7 sm:px-8 sm:py-9">
          <div className="absolute right-0 top-0 h-56 w-56 bg-primary/[0.07] blur-[90px]" />
          <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" /> Welcome campaign</div>
              <h2 className="mt-4 max-w-[620px] font-heading text-3xl font-semibold leading-tight sm:text-[42px]">Complete three tasks. Earn <span className="text-gradient-green">60 Spyda Credits.</span></h2>
              <p className="mt-3 max-w-[620px] text-sm leading-6 text-muted-foreground">Support Spyda on X, submit your handle once, and receive credits after a quick admin verification.</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Progress</p><p className="mt-1 font-heading text-2xl font-semibold">{completedCount}/{WELCOME_TASKS.length}</p></div><span className="text-sm font-semibold text-primary">{progress}%</span></div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {statusContent && (
            <div className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${statusContent.className}`}>
              <statusContent.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="text-sm font-semibold">{statusContent.title}</p><p className="mt-1 text-xs leading-5 text-current opacity-75">{statusContent.detail}</p></div>
            </div>
          )}

          {error && <p role="alert" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

          <div className="grid gap-3">
            {WELCOME_TASKS.map((task, index) => {
              const completed = Boolean(claim?.[task.id])
              const TaskIcon = taskIcons[task.id]
              return (
                <article key={task.id} className={`grid gap-4 rounded-lg border p-4 transition-colors sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${completed ? 'border-primary/25 bg-primary/[0.035]' : 'border-white/[0.08] bg-white/[0.018]'}`}>
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border ${completed ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/[0.09] bg-white/[0.025] text-muted-foreground'}`}>
                    {completed ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <TaskIcon className="h-5 w-5" />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-muted-foreground">0{index + 1}</span><h3 className="font-heading text-base font-semibold">{task.title}</h3></div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p>
                    <p className="mt-2 text-xs font-semibold text-primary">{task.account}</p>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <a href={task.url} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold transition-colors hover:bg-white/[0.05] sm:flex-none">
                      Open X <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button type="button" onClick={() => void toggleTask(task.id)} disabled={locked || savingTask !== null} className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[132px] sm:flex-none ${completed ? 'border border-primary/25 bg-primary/10 text-primary' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                      {savingTask === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : completed ? <Check className="h-3.5 w-3.5" /> : null}
                      {completed ? 'Completed' : 'Mark complete'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {readyToSubmit && (
            <form onSubmit={submitClaim} className="mt-6 rounded-lg border border-primary/20 bg-primary/[0.035] p-5 sm:p-6">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-heading text-base font-semibold">Submit for verification</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Enter your own X handle used to complete the tasks, not @spydadesign or @viceonchain. Your reward is paid to this signed-in Spyda account, not to the X handle.</p></div></div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={xHandle} onChange={event => { setXHandle(event.target.value); setError('') }} autoComplete="off" placeholder="yourhandle" className="h-12 w-full rounded-lg border border-white/[0.1] bg-background/70 pl-10 pr-4 text-sm outline-none focus:border-primary/50" />
                </div>
                <button type="submit" disabled={submitting} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {submitting ? 'Submitting...' : 'Submit X handle'}
                </button>
              </div>
            </form>
          )}

          {!readyToSubmit && !locked && (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.018] p-4 text-xs leading-5 text-muted-foreground">
              <Gift className="h-4 w-4 shrink-0 text-primary" /> Complete all three tasks to unlock X-handle submission.
            </div>
          )}
        </div>
      </section>
      <CommunityTasksSection />
    </div>
  )
}

function CommunityTasksSection() {
  const [tasks, setTasks] = useState<CommunityTask[]>([])
  const [proofs, setProofs] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await listCommunityTasks()
      setTasks(next)
      setProofs(Object.fromEntries(next.map(task => [task.id, task.proof || ''])))
      setError('')
    } catch (loadError) {
      setError(taskErrorMessage(loadError, 'Spyda could not load new tasks.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (task: CommunityTask) => {
    const proof = proofs[task.id] || ''
    if (proof.trim().length < 2) {
      setError(`Add your proof for ${task.title} before submitting.`)
      return
    }
    setBusyId(task.id)
    try {
      await submitCommunityTaskClaim(task.id, proof)
      window.dispatchEvent(new CustomEvent('spyda-community-tasks-updated'))
      await load()
    } catch (submitError) {
      setError(taskErrorMessage(submitError, 'Spyda could not submit this task.'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return null
  if (!tasks.length && !error) return null

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.02]">
      <div className="border-b border-white/[0.07] px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">New opportunities</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold">Earn while you build with Spyda.</h2>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center rounded-lg border border-white/[0.1] px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Refresh</button>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        {!tasks.length ? <p className="py-5 text-sm text-muted-foreground">There are no new tasks right now.</p> : <div className="grid gap-4 md:grid-cols-2">
          {tasks.map(task => {
            const complete = task.claim_status === 'approved'
            const pending = task.claim_status === 'pending'
            return <article key={task.id} className={`rounded-xl border p-5 ${complete ? 'border-primary/25 bg-primary/[0.035]' : 'border-white/[0.08] bg-black/10'}`}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-base font-semibold">{task.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{task.description}</p></div><span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">+{task.reward_credits} credits</span></div>
              {task.action_url && <a href={task.action_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold hover:bg-white/[0.05]">{task.action_label}<ExternalLink className="h-3.5 w-3.5" /></a>}
              {complete ? <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary"><Check className="h-4 w-4" /> {task.credits_awarded} credits awarded</p> : pending ? <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#8bd3ff]"><Clock3 className="h-4 w-4" /> Proof submitted for review</p> : <div className="mt-4"><label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proof of completion</label><p className="mt-1 text-xs leading-5 text-muted-foreground">{task.verification_hint}</p><div className="mt-3 flex gap-2"><input value={proofs[task.id] || ''} onChange={event => setProofs(current => ({ ...current, [task.id]: event.target.value }))} placeholder="Link, @handle, or short proof" className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-background/70 px-3 text-xs outline-none focus:border-primary/50" /><button type="button" onClick={() => void submit(task)} disabled={busyId === task.id} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busyId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Submit</button></div></div>}
              {task.claim_status === 'rejected' && task.admin_note && <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200">{task.admin_note}</p>}
            </article>
          })}
        </div>}
      </div>
    </section>
  )
}
