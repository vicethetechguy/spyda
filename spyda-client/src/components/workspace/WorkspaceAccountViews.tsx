import { useEffect, useMemo, useState } from 'react'
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
} from '../ui/icons'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

/** What Spyda costs: free to use, credits for downloads and AI, recharge from $1, never a subscription. */
const PRICING = [
  { id: 'free', name: 'Spyda', price: 'Free', detail: 'Always. No subscription.', description: 'Every editor and tool is free to open and use.', features: ['Spyda AI chat and voice', 'Canvas mode and Magic Layers', 'Video editor', 'Templates and the marketplace'], texture: 'free' },
  { id: 'wallet', name: 'Recharge', price: 'From $1', detail: '$1 = 100 Spyda credits', description: 'Top up any amount, whenever you need it.', features: ['Any amount from $1', 'Credits never expire', 'No recurring payment, ever', 'Paid securely through Paystack'], texture: 'starter' },
  { id: 'downloads', name: 'Downloads', price: '100 credits', detail: 'per flyer or video', description: 'Pay once your finished work is ready to save.', features: ['Compressor: +50 credits', 'Up to 90% smaller, same quality', 'Charged only when the file is ready', 'Eligible spend accrues SPYDA'], texture: 'creator' },
  { id: 'byok', name: 'AI work', price: 'From 5 credits', detail: 'per generation', description: 'The cost is confirmed before anything runs.', features: ['20 credits: Groq + GPT-Image 2', '30 credits: GPT-Image 2 only', '50 credits: motion by Claude Opus 5.5', '5 credits with your own API key'], texture: 'pro' },
] as const

const CREDIT_USES: Array<[string, string]> = [
  ['Using Spyda AI, Canvas mode, the Video editor and templates', 'Free'],
  ['Downloading a flyer, animation, video or file', '100 credits'],
  ['Compressor on a download (only when it saves space)', '+50 credits'],
  ['AI generation: Groq + GPT-Image 2 / GPT-Image 2 only', '20 / 30 credits'],
  ['Motion design by Claude Opus 5.5', '50 credits'],
  ['AI generation with your own OpenAI key', '5 credits'],
  ['Listing a design on the marketplace', '5 credits'],
]

export function SubscriptionView({ onBack, onOpenWallet, onOpenSettings }: { onBack: () => void; onOpenWallet: () => void; onOpenSettings: () => void }) {
  const { user } = useAuth()
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    if (!user) return
    void supabase.from('profiles').select('openai_key').eq('id', user.id).single().then(({ data }) => {
      setHasApiKey(Boolean(String(data?.openai_key || '').trim()))
    })
  }, [user])

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to settings</button>
      <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Pricing</p><h2 className="font-heading text-2xl font-semibold sm:text-3xl">Pricing & credits</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Spyda is free to use, with no subscriptions now or ever. You spend Spyda credits only when you download your work or run AI, and new features will use credits too. Recharge from just $1.</p></div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-5 py-4"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Your access</p><div className="mt-1 flex items-center gap-3"><span className="font-heading text-xl font-semibold">Free, forever</span><span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">No subscription</span></div>{hasApiKey ? <p className="mt-2 text-xs text-muted-foreground">Your own OpenAI key is connected: generations cost 5 credits.</p> : null}</div>
      </div>

      <div className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[8vw] pb-3 pt-2 sm:px-0 lg:grid lg:pt-0 lg:grid-cols-2 lg:overflow-visible lg:pb-0 xl:grid-cols-4">
        {PRICING.map(option => (
          <article key={option.id} tabIndex={0} aria-label={`${option.name} pricing`} className={`pricing-texture pricing-texture--${option.texture} relative flex w-[84vw] max-w-[340px] shrink-0 snap-start flex-col rounded-lg border p-6 outline-none sm:w-[340px] lg:w-auto lg:max-w-none ${option.id === 'wallet' ? 'border-primary/45 bg-primary/[0.04]' : 'border-white/[0.07] bg-surface'}`}>
            {option.id === 'wallet' && <span className="absolute right-4 top-4 rounded bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">From $1</span>}
            <h3 className="font-heading text-lg font-semibold">{option.name}</h3>
            <p className="mt-4 font-heading text-3xl font-semibold">{option.price}</p>
            <p className="mt-1 text-xs text-primary">{option.detail}</p>
            <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{option.description}</p>
            <ul className="mt-5 flex-1 space-y-3 border-t border-white/[0.07] pt-5">
              {option.features.map(feature => (
                <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.4} />
                  {feature}
                </li>
              ))}
            </ul>
            {option.id === 'wallet' && <button type="button" onClick={onOpenWallet} className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Recharge from $1</button>}
            {option.id === 'byok' && <button type="button" onClick={onOpenSettings} className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/[0.1] bg-surface-raised text-sm font-semibold transition-colors hover:bg-white/[0.07]">{hasApiKey ? 'Manage API key' : 'Connect API key'}</button>}
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-white/[0.08] bg-surface p-5">
          <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">What Spyda credits pay for</h3></div>
          <div className="mt-4 divide-y divide-white/[0.07]">
            {CREDIT_USES.map(([what, cost]) => <div key={what} className="flex items-center justify-between gap-4 py-2.5"><p className="text-sm text-muted-foreground">{what}</p><p className={`shrink-0 text-sm font-semibold ${cost === 'Free' ? 'text-primary' : ''}`}>{cost}</p></div>)}
          </div>
        </section>
        <aside className="rounded-lg border border-white/[0.08] bg-surface p-5"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="mt-3 text-sm font-semibold">Never a subscription</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">There is nothing to renew and nothing to cancel. Recharges are one-off payments through Paystack, and Spyda never stores your card details.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> Credits stay in your wallet until you use them.</div></aside>
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
    <div className="rounded-lg border border-white/[0.06] bg-surface p-5">
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
