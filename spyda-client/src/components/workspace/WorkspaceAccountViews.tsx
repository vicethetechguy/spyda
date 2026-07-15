import { useEffect, useMemo, useState } from 'react'
import { usePaystackPayment } from 'react-paystack'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Monitor,
  Shield,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

type SubscriptionPlanId = 'free' | 'creator' | 'studio'

type BillingEntry = {
  id: string
  plan: SubscriptionPlanId
  amount: number
  date: string
  reference: string
}

type SubscriptionRecord = {
  planId: SubscriptionPlanId
  status: 'active' | 'cancelled'
  startedAt: string
  expiresAt: string | null
  billingHistory: BillingEntry[]
}

type SubscriptionPlan = {
  id: SubscriptionPlanId
  name: string
  price: number
  credits: string
  description: string
  features: string[]
}

const PLANS: SubscriptionPlan[] = [
  { id: 'free', name: 'Free', price: 0, credits: 'Starter access', description: 'Explore the Spyda workflow.', features: ['3 saved projects', 'Basic design analysis', 'Community templates'] },
  { id: 'creator', name: 'Creator', price: 12000, credits: '1,200 credits per access period', description: 'For creators producing campaigns regularly.', features: ['Unlimited saved projects', 'Premium analysis', 'Brand asset library', 'Priority generation'] },
  { id: 'studio', name: 'Studio', price: 30000, credits: '3,500 credits per access period', description: 'For teams and high-volume design work.', features: ['Everything in Creator', 'Shared project capacity', 'Faster processing queue', 'Advanced brand controls'] },
]

function subscriptionStorageKey(userId?: string) {
  return `spyda.subscription.v1:${userId || 'guest'}`
}

function defaultSubscription(): SubscriptionRecord {
  return { planId: 'free', status: 'active', startedAt: new Date().toISOString(), expiresAt: null, billingHistory: [] }
}

function readSubscription(userId?: string, metadata?: Record<string, unknown>): SubscriptionRecord {
  const remote = metadata?.spyda_subscription
  if (remote && typeof remote === 'object') return remote as SubscriptionRecord
  try {
    const saved = window.localStorage.getItem(subscriptionStorageKey(userId))
    return saved ? JSON.parse(saved) as SubscriptionRecord : defaultSubscription()
  } catch {
    return defaultSubscription()
  }
}

async function persistSubscription(userId: string | undefined, record: SubscriptionRecord) {
  window.localStorage.setItem(subscriptionStorageKey(userId), JSON.stringify(record))
  if (userId) await supabase.auth.updateUser({ data: { spyda_subscription: record } })
}

function formatDate(value: string | null) {
  if (!value) return 'No expiry'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function PlanCheckoutButton({ plan, current, onActivated }: { plan: SubscriptionPlan; current: boolean; onActivated: (record: SubscriptionRecord) => void }) {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'processing' | 'error'>('idle')
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''
  const config = {
    publicKey,
    email: user?.email || '',
    amount: plan.price * 100,
    currency: 'NGN',
    reference: `spyda-sub-${plan.id}-${Date.now()}`,
  }
  const initializePayment = usePaystackPayment(config)

  const purchase = () => {
    if (!user || !publicKey || plan.price === 0) return
    setState('processing')
    initializePayment({
      onSuccess: async response => {
        const startedAt = new Date()
        const expiresAt = new Date(startedAt)
        expiresAt.setDate(expiresAt.getDate() + 30)
        const existing = readSubscription(user.id, user.user_metadata)
        const next: SubscriptionRecord = {
          planId: plan.id,
          status: 'active',
          startedAt: startedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          billingHistory: [{ id: crypto.randomUUID(), plan: plan.id, amount: plan.price, date: startedAt.toISOString(), reference: String(response?.reference || config.reference) }, ...existing.billingHistory].slice(0, 20),
        }
        await persistSubscription(user.id, next)
        onActivated(next)
        setState('idle')
      },
      onClose: () => setState('idle'),
    })
  }

  return (
    <button type="button" disabled={current || state === 'processing' || !publicKey || !user} onClick={purchase} className={`mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold ${current ? 'border border-primary/30 bg-primary/10 text-primary' : 'bg-primary text-primary-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}>
      {state === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
      {current ? 'Current plan' : !user ? 'Sign in to subscribe' : !publicKey ? 'Billing unavailable' : `Choose ${plan.name}`}
    </button>
  )
}

export function SubscriptionView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionRecord>(() => readSubscription(user?.id, user?.user_metadata))
  const [message, setMessage] = useState('')
  const currentPlan = PLANS.find(plan => plan.id === subscription.planId) || PLANS[0]

  const cancelAccess = async () => {
    const next = { ...subscription, planId: 'free' as const, status: 'cancelled' as const, expiresAt: null }
    await persistSubscription(user?.id, next)
    setSubscription(next)
    setMessage('Paid access has been removed from this Spyda account.')
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to settings</button>
      <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Account billing</p><h2 className="font-heading text-2xl font-semibold sm:text-3xl">Subscription</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Choose the access level that fits your design workload and manage it from one place.</p></div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-5 py-4"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Current plan</p><div className="mt-1 flex items-center gap-3"><span className="font-heading text-xl font-semibold">{currentPlan.name}</span><span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">{subscription.status}</span></div>{subscription.expiresAt && <p className="mt-2 text-xs text-muted-foreground">Access through {formatDate(subscription.expiresAt)}</p>}</div>
      </div>

      {message && <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.06] p-4 text-sm text-primary"><span>{message}</span><button type="button" onClick={() => setMessage('')} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {PLANS.map(plan => (
          <article key={plan.id} className={`rounded-lg border p-5 ${plan.id === subscription.planId ? 'border-primary/40 bg-primary/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-xl font-semibold">{plan.name}</h3><p className="mt-1 text-xs text-primary">{plan.credits}</p></div>{plan.id === subscription.planId && <CheckCircle2 className="h-5 w-5 text-primary" />}</div>
            <p className="mt-4 font-heading text-3xl font-semibold">{plan.price ? `NGN ${plan.price.toLocaleString()}` : 'Free'} <span className="font-sans text-xs font-normal text-muted-foreground">{plan.price ? '/ 30 days' : ''}</span></p>
            <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground">{plan.description}</p>
            <div className="mt-5 space-y-3 border-t border-white/[0.07] pt-5">{plan.features.map(feature => <div key={feature} className="flex items-center gap-2 text-xs"><Check className="h-3.5 w-3.5 text-primary" /> {feature}</div>)}</div>
            {plan.id === 'free' ? <button type="button" disabled={subscription.planId === 'free'} onClick={cancelAccess} className="mt-5 h-10 w-full rounded-lg border border-white/[0.1] text-xs font-semibold disabled:opacity-60">{subscription.planId === 'free' ? 'Current plan' : 'Move to Free'}</button> : <PlanCheckoutButton plan={plan} current={plan.id === subscription.planId} onActivated={record => { setSubscription(record); setMessage(`${plan.name} access is now active.`) }} />}
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Billing history</h3></div>{!subscription.billingHistory.length ? <p className="mt-5 text-sm text-muted-foreground">No payments have been made on this account yet.</p> : <div className="mt-4 divide-y divide-white/[0.07]">{subscription.billingHistory.map(entry => <div key={entry.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium capitalize">{entry.plan} access</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(entry.date)} · {entry.reference}</p></div><p className="text-sm font-semibold">NGN {entry.amount.toLocaleString()}</p></div>)}</div>}</section>
        <aside className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="mt-3 text-sm font-semibold">Protected checkout</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Payments are handled by Paystack. Spyda does not store your card details.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> Each payment activates 30 days of access. It does not renew automatically.</div></aside>
      </div>
    </div>
  )
}

type TotpFactor = {
  id: string
  friendly_name?: string
  status?: string
  created_at?: string
}

type Enrollment = {
  id: string
  qrCode: string
  secret: string
}

export function SecurityPanel() {
  const { user, session } = useAuth()
  const [panel, setPanel] = useState<'password' | 'mfa' | 'sessions' | null>(null)
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadFactors = async () => {
    const { data, error: factorError } = await supabase.auth.mfa.listFactors()
    if (factorError) return setError(factorError.message)
    setFactors((data.totp || []) as TotpFactor[])
  }

  useEffect(() => { if (user) loadFactors() }, [user])
  const verifiedFactor = factors.find(factor => factor.status === 'verified')

  const resetNotice = () => { setError(''); setMessage('') }

  const changePassword = async () => {
    resetNotice()
    if (password.length < 8) return setError('Use at least 8 characters for your new password.')
    if (password !== confirmPassword) return setError('The two passwords do not match.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) return setError(updateError.message)
    setPassword(''); setConfirmPassword(''); setMessage('Your password has been changed.')
  }

  const beginMfa = async () => {
    resetNotice(); setBusy(true)
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Spyda Authenticator' })
    setBusy(false)
    if (enrollError) return setError(enrollError.message)
    setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
  }

  const verifyMfa = async () => {
    if (!enrollment || code.trim().length !== 6) return setError('Enter the 6-digit code from your authenticator app.')
    resetNotice(); setBusy(true)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: code.trim() })
    setBusy(false)
    if (verifyError) return setError(verifyError.message)
    setEnrollment(null); setCode(''); setMessage('Two-factor authentication is now active.'); await loadFactors()
  }

  const disableMfa = async () => {
    if (!verifiedFactor) return
    if (code.trim().length !== 6) return setError('Enter a current 6-digit authenticator code to disable two-factor authentication.')
    resetNotice(); setBusy(true)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: verifiedFactor.id, code: code.trim() })
    if (verifyError) { setBusy(false); return setError(verifyError.message) }
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id })
    setBusy(false)
    if (removeError) return setError(removeError.message)
    setCode(''); setMessage('Two-factor authentication has been disabled.'); await loadFactors()
  }

  const revokeOthers = async () => {
    resetNotice(); setBusy(true)
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    setBusy(false)
    if (signOutError) return setError(signOutError.message)
    setMessage('Every other Spyda session has been signed out. This device remains active.')
  }

  const sessionExpiry = useMemo(() => session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Not available', [session?.expires_at])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3"><div><h4 className="font-heading text-sm font-semibold">Security</h4><p className="mt-1 text-[11px] text-muted-foreground">Protect your account and control signed-in devices.</p></div><Shield className="h-5 w-5 text-primary" /></div>
      <div className="mt-4 divide-y divide-white/[0.07]">
        <button type="button" onClick={() => { setPanel(panel === 'password' ? null : 'password'); resetNotice() }} className="flex w-full items-center justify-between py-3 text-sm hover:text-primary"><span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted-foreground" /> Change password</span><span className="text-xs text-muted-foreground">Open</span></button>
        <button type="button" onClick={() => { setPanel(panel === 'mfa' ? null : 'mfa'); resetNotice() }} className="flex w-full items-center justify-between py-3 text-sm hover:text-primary"><span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-muted-foreground" /> Two-factor authentication</span><span className={`rounded px-2 py-1 text-[10px] font-semibold uppercase ${verifiedFactor ? 'bg-primary/10 text-primary' : 'bg-white/[0.05] text-muted-foreground'}`}>{verifiedFactor ? 'On' : 'Off'}</span></button>
        <button type="button" onClick={() => { setPanel(panel === 'sessions' ? null : 'sessions'); resetNotice() }} className="flex w-full items-center justify-between py-3 text-sm hover:text-primary"><span className="flex items-center gap-2"><Monitor className="h-4 w-4 text-muted-foreground" /> Active sessions</span><span className="text-xs text-muted-foreground">Manage</span></button>
      </div>

      {panel && <div className="mt-4 rounded-lg border border-white/[0.08] bg-background/70 p-4">
        {panel === 'password' && <div><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /><h5 className="text-sm font-semibold">Set a new password</h5></div><div className="mt-4 space-y-3"><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="New password" autoComplete="new-password" className="h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" /><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" /><button type="button" disabled={busy} onClick={changePassword} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password</button></div></div>}

        {panel === 'mfa' && <div><h5 className="text-sm font-semibold">Authenticator app</h5>{!verifiedFactor && !enrollment && <div><p className="mt-2 text-xs leading-5 text-muted-foreground">Use Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p><button type="button" disabled={busy} onClick={beginMfa} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Set up authenticator</button></div>}{enrollment && <div className="mt-4"><div className="flex justify-center rounded-lg bg-white p-3"><img src={enrollment.qrCode} alt="Authenticator QR code" className="h-44 w-44" /></div><p className="mt-3 break-all rounded-lg border border-white/[0.08] p-3 font-mono text-[10px] text-muted-foreground">{enrollment.secret}</p><div className="mt-3 flex gap-2"><input inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-background px-3 text-sm tracking-widest outline-none" /><button type="button" disabled={busy} onClick={verifyMfa} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Verify</button></div></div>}{verifiedFactor && <div className="mt-3"><p className="text-xs leading-5 text-muted-foreground">Two-factor authentication is active. Enter a current code before removing it.</p><div className="mt-3 flex gap-2"><input inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-background px-3 text-sm tracking-widest outline-none" /><button type="button" disabled={busy} onClick={disableMfa} className="h-10 rounded-lg border border-red-500/30 px-4 text-xs font-semibold text-red-300">Disable</button></div></div>}</div>}

        {panel === 'sessions' && <div><h5 className="text-sm font-semibold">This device</h5><div className="mt-3 space-y-2 rounded-lg border border-white/[0.07] p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Account</span><span className="truncate">{user?.email}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Last sign in</span><span>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Not available'}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Session expires</span><span>{sessionExpiry}</span></div></div><button type="button" disabled={busy} onClick={revokeOthers} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/30 px-4 text-xs font-semibold text-red-300 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out other devices</button></div>}

        {error && <p className="mt-3 text-xs leading-5 text-red-300">{error}</p>}
        {message && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-primary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}</p>}
      </div>}
    </div>
  )
}
