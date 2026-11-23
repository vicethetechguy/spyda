import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Coins,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from '../components/ui/icons'
import BrandMark from '../components/brand/BrandMark'
import HeroField from '../components/HeroField'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { passwordStrength } from '../lib/password-strength'

const STRENGTH_COLORS = ['bg-white/10', 'bg-red-400', 'bg-amber-300', 'bg-[#8bd3ff]', 'bg-primary']

const SHOWCASE_CHIPS = [
  { icon: Coins, label: 'Free to use · no subscription' },
  { icon: Coins, label: '1,000 credits used = 1 SPYDA' },
  { icon: Clapperboard, label: 'Motion videos by Claude' },
  { icon: ShieldCheck, label: 'Two-factor sign-in' },
]

/** The showcase: what Spyda does, told as the chat it really is. Desktop only. */
function Showcase() {
  return (
    <section className="relative hidden overflow-hidden rounded-[28px] border border-white/10 lg:flex lg:flex-col">
      <HeroField variant="vivid" className="inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,5,0.35)_0%,rgba(4,5,5,0)_30%,rgba(4,5,5,0.15)_60%,rgba(4,5,5,0.82)_100%)]" />

      <div className="relative z-10 flex flex-1 flex-col p-8 xl:p-10 short:p-7">
        <div className="max-w-xl pt-14 xl:pt-20 short:pt-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 font-heading text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(157,250,176,0.9)]" /> Your AI design partner
          </p>
          <h1 className="mt-6 font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-white xl:text-[64px] short:text-[46px]">Make any design yours.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/75 short:mt-3">Import a flyer, say what to change, and Spyda rebuilds it in your brand. Every credit you use earns SPYDA.</p>
        </div>

        <div className="mt-auto pt-10 short:pt-6">
          <div className="max-w-lg rounded-[24px] border border-white/[0.12] bg-black/45 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex justify-end">
              <div className="flex max-w-[82%] items-end gap-2.5">
                <p className="rounded-[18px] rounded-br-md bg-white/[0.09] px-3.5 py-2.5 text-[13px] leading-5 text-white/90">Change the headline to “Grand Opening” and use our green.</p>
                <img src="/assets/spyda-sample-11.jpeg" alt="" className="h-16 w-12 shrink-0 rounded-xl border border-white/10 object-cover" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-[#0b1412]"><BrandMark size={20} /></span>
              <div className="min-w-0">
                <p className="text-[13px] leading-5 text-white/85">Done. Same layout and type, new headline, your colours.</p>
                <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-2 pr-3">
                  <img src="/assets/spyda-sample-04.jpeg" alt="" className="h-14 w-11 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Check className="h-3.5 w-3.5" strokeWidth={2.6} /> New version ready</p>
                    <p className="mt-0.5 text-[11px] text-white/55">20 credits · counts toward your next SPYDA</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 short:hidden">
            {SHOWCASE_CHIPS.map(({ icon: ChipIcon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-black/30 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur-md">
                <ChipIcon className="h-3.5 w-3.5 text-primary" /> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** The mark in a small glass orb, the same object the splash opens on. */
function AuthOrb() {
  return (
    <div className="relative h-[76px] w-[76px]" aria-hidden="true">
      <div className="absolute -inset-2 rounded-full bg-[conic-gradient(from_0deg,#9dfab0,#8bd3ff,#0c5b86,#12866f,#ffab84,#9dfab0)] opacity-60 blur-lg motion-safe:animate-[spin_12s_linear_infinite]" />
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_140deg,#9dfab0,#0c5b86,#8bd3ff,#12866f,#9dfab0)] p-[1.5px]">
        <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_50%_50%,#0e2a24,#050606_72%)]" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center"><BrandMark size={44} animated tint="#c4ffd3" /></div>
    </div>
  )
}

const inputClass = 'h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.03] text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/45 hover:border-white/[0.16] focus:border-primary/60 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(157,250,176,0.1)]'

export default function Auth() {
  const { session, signIn, loading: sessionLoading } = useAuth()
  const location = useLocation()
  const [isSignUp, setIsSignUp] = useState(location.state?.mode === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mfaStatus, setMfaStatus] = useState<'checking' | 'required' | 'clear' | 'error'>('checking')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')

  useEffect(() => {
    let active = true
    if (!session) {
      setMfaStatus('clear')
      setMfaFactorId('')
      return () => { active = false }
    }

    setMfaStatus('checking')
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]).then(([assurance, factorResult]) => {
      if (!active) return
      const verifiedFactor = factorResult.data?.totp?.find(factor => factor.status === 'verified')
      const needsMfa = assurance.data?.nextLevel === 'aal2' && assurance.data?.currentLevel !== 'aal2'
      if (needsMfa) {
        if (verifiedFactor) {
          setMfaFactorId(verifiedFactor.id)
          setMfaStatus('required')
        } else {
          console.error('MFA required but no verified TOTP factor found.')
          setMfaStatus('error')
        }
      } else {
        setMfaStatus('clear')
      }
    }).catch((err) => {
      console.error('MFA check failed:', err)
      if (active) setMfaStatus('error')
    })

    return () => { active = false }
  }, [session])

  if (session && mfaStatus === 'clear') return <Navigate to="/workspace" replace />

  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp)
    setError(null)
    setMessage(null)
    setPassword('')
  }

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        setMessage('Your account is ready. Check your inbox if email verification is enabled, then sign in.')
        setIsSignUp(false)
        setPassword('')
      } else {
        setMfaStatus('checking')
        await signIn(email, password)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Spyda could not complete authentication. Try again.')
      setMfaStatus('clear')
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!mfaFactorId || mfaCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    setLoading(true)
    setError(null)
    const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode })
    setLoading(false)
    if (verificationError) {
      setError(verificationError.message)
      return
    }
    setMfaStatus('clear')
  }

  const isMfa = mfaStatus === 'required'
  const isError = mfaStatus === 'error'
  const busy = loading || sessionLoading || mfaStatus === 'checking'
  const strength = passwordStrength(password)

  const eyebrow = isError ? 'Security error' : isMfa ? 'Two-factor verification' : isSignUp ? 'Create your account' : 'Welcome back'
  const title = isError ? 'Authentication failed.' : isMfa ? 'Confirm it is you.' : isSignUp ? 'Make your next design yours.' : 'Pick up where you left off.'
  const lede = isError
    ? 'We could not load your security settings or verified authenticator. This may be temporary or an unfinished setup.'
    : isMfa
      ? 'Enter the current code from the authenticator app connected to your Spyda account.'
      : isSignUp
        ? 'Save your chats and versions, and earn 1 SPYDA for every 1,000 credits you use.'
        : 'Your chats, flyers and SPYDA rewards are waiting.'

  return (
    <div className="min-h-[100dvh] bg-[#040505] p-2 font-sans text-foreground sm:p-3">
      <div className="grid min-h-[calc(100dvh-1rem)] gap-2 sm:min-h-[calc(100dvh-1.5rem)] sm:gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <Showcase />

        <section className="relative flex flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#08090a]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(18,134,111,0.28),transparent_70%)]" />

          <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-7 sm:pt-6">
            <Link to="/" className="flex items-center gap-2.5" aria-label="Spyda home">
              <BrandMark size={30} animated />
              <span className="font-heading text-lg font-semibold">Spyda</span>
            </Link>
            <Link to="/" className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Back home
            </Link>
          </header>

          <div className="relative z-10 mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-5 py-10 sm:px-0 short:py-4">
            <div className="mb-7 flex justify-center short:hidden"><AuthOrb /></div>

            {!isMfa && !isError && (
              <div role="tablist" aria-label="Account" className="relative mb-7 grid grid-cols-2 rounded-full short:mb-5 border border-white/[0.08] bg-white/[0.03] p-1">
                <span aria-hidden="true" className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSignUp ? 'translate-x-full' : 'translate-x-0'}`} />
                <button type="button" role="tab" aria-selected={!isSignUp} onClick={() => switchMode(false)} className={`relative h-10 rounded-full text-xs font-semibold transition-colors ${!isSignUp ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Sign in</button>
                <button type="button" role="tab" aria-selected={isSignUp} onClick={() => switchMode(true)} className={`relative h-10 rounded-full text-xs font-semibold transition-colors ${isSignUp ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Create account</button>
              </div>
            )}

            <div className="mb-7 text-center short:mb-5">
              <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isError ? 'text-red-400' : 'text-primary'}`}>{eyebrow}</p>
              <h2 className="mt-2.5 font-heading text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">{title}</h2>
              <p className="mx-auto mt-2.5 max-w-[340px] text-sm leading-6 text-muted-foreground">{lede}</p>
            </div>

            {isError ? (
              <div className="space-y-3">
                <button type="button" onClick={() => window.location.reload()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] text-sm font-semibold text-foreground transition-colors hover:bg-white/[0.1]">
                  Try again
                </button>
                <button type="button" onClick={() => { supabase.auth.signOut(); window.location.assign('/') }} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-500/90">
                  Log out completely
                </button>
              </div>
            ) : (
              <form onSubmit={isMfa ? handleMfa : handleAuth} className="space-y-4">
                {error && <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-300">{error}</div>}
                {message && <div role="status" className="rounded-2xl border border-primary/25 bg-primary/[0.07] px-4 py-3 text-sm leading-5 text-primary">{message}</div>}

                {isMfa ? (
                  <div>
                    <label htmlFor="mfa-code" className="mb-2 block text-xs font-medium text-foreground/90">Authenticator code</label>
                    <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputClass} px-4 text-center font-mono text-lg tracking-[0.5em]`} />
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="auth-email" className="mb-2 block text-xs font-medium text-foreground/90">Email</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className={`${inputClass} pl-11 pr-4`} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="auth-password" className="mb-2 block text-xs font-medium text-foreground/90">Password</label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={isSignUp ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} placeholder={isSignUp ? 'At least 8 characters' : 'Your password'} aria-describedby={isSignUp ? 'password-strength' : undefined} className={`${inputClass} pl-11 pr-12`} />
                        <button type="button" onClick={() => setShowPassword(previous => !previous)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      </div>
                      {isSignUp && (
                        <div id="password-strength" className="mt-2.5 flex items-center gap-3" aria-live="polite">
                          <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
                            {[1, 2, 3, 4].map(step => <span key={step} className={`h-1 rounded-full transition-colors duration-300 ${strength.score >= step ? STRENGTH_COLORS[strength.score] : 'bg-white/[0.08]'}`} />)}
                          </div>
                          <span className="w-20 text-right text-[11px] text-muted-foreground">{strength.label || '8+ characters'}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <button type="submit" disabled={busy} className="group !mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_14px_38px_rgba(157,250,176,0.18)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : isMfa ? 'Verify and continue' : isSignUp ? 'Create account' : 'Sign in'}
                  {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>
            )}

            {!isMfa && !isError && (
              <p className="mt-6 text-center text-sm text-muted-foreground short:mt-4">
                {isSignUp ? 'Already have an account?' : 'New to Spyda?'}{' '}
                <button type="button" onClick={() => switchMode(!isSignUp)} className="font-semibold text-primary transition-colors hover:text-primary/80">{isSignUp ? 'Sign in' : 'Create an account'}</button>
              </p>
            )}
          </div>

          <footer className="relative z-10 flex flex-col items-center gap-1 px-5 pb-5 text-center text-[11px] text-muted-foreground/80 sm:pb-6">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Protected sign-in, two-factor ready</span>
            {isSignUp && !isMfa && <span>Use only designs and assets you have the right to use.</span>}
          </footer>
        </section>
      </div>
    </div>
  )
}
