import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

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
  const [mfaStatus, setMfaStatus] = useState<'checking' | 'required' | 'clear'>('checking')
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
      const needsMfa = assurance.data?.nextLevel === 'aal2' && assurance.data?.currentLevel !== 'aal2' && verifiedFactor
      if (needsMfa) {
        setMfaFactorId(verifiedFactor.id)
        setMfaStatus('required')
      } else {
        setMfaStatus('clear')
      }
    }).catch(() => {
      if (active) setMfaStatus('clear')
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-25" />
      <header className="absolute inset-x-0 top-0 z-30 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Spyda home">
          <img src="/assets/spyda-logo-drive.webp" alt="" className="h-9 w-9 object-contain" />
          <span className="font-heading text-lg font-semibold">Spyda</span>
        </Link>
        <Link to="/" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:bg-white/[0.04] hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
      </header>

      <main className="relative z-10 grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden min-h-screen overflow-hidden border-r border-white/[0.07] px-10 pb-10 pt-32 lg:flex lg:flex-col lg:justify-between xl:px-16">
          <div className="absolute inset-x-0 top-20 h-px bg-gradient-to-r from-primary/70 via-[#8bd3ff]/35 to-transparent" />
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Your design workspace</div>
            <h1 className="font-heading text-5xl font-semibold leading-[1.08] xl:text-6xl">Every reference, atom, and child design stays within reach.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">Sign in to continue a focused design round, reopen a project, reuse your brand assets, or start from a new visual reference.</p>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-[minmax(220px,0.85fr)_minmax(210px,1fr)] overflow-hidden rounded-lg border border-white/[0.08] bg-[#08090a]">
            <div className="relative min-h-[330px] overflow-hidden border-r border-white/[0.08]">
              <img src="/assets/spyda-sample-11.jpeg" alt="Flyer reference" className="absolute inset-0 h-full w-full object-cover opacity-85" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" />
              <span className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-[9px] font-semibold uppercase text-white backdrop-blur">Source design</span>
              <p className="absolute bottom-4 left-4 right-4 font-heading text-lg font-semibold">Start from a direction that already works.</p>
            </div>
            <div className="flex flex-col justify-between p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Detected design atoms</p>
                <div className="mt-4 space-y-2.5">
                  {[
                    ['Headline', 'Replace text'],
                    ['Product image', 'Upload asset'],
                    ['Brand logo', 'Keep or replace'],
                    ['Call to action', 'Edit or remove'],
                  ].map(([name, action]) => (
                    <div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-3">
                      <span className="text-xs font-medium">{name}</span>
                      <span className="text-[9px] text-primary">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" /> Original reference stays untouched</div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Protected account access</span>
            <span className="flex items-center gap-2"><KeyRound className="h-3.5 w-3.5 text-[#8bd3ff]" /> Authenticator verification available</span>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 pb-10 pt-24 sm:px-8 lg:pt-20">
          <div className="w-full max-w-[420px]">
            {!isMfa && (
              <div className="mb-8 grid grid-cols-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
                <button type="button" onClick={() => switchMode(false)} className={`h-10 rounded-md text-xs font-semibold transition-colors ${!isSignUp ? 'bg-white/[0.09] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Sign in</button>
                <button type="button" onClick={() => switchMode(true)} className={`h-10 rounded-md text-xs font-semibold transition-colors ${isSignUp ? 'bg-white/[0.09] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Create account</button>
              </div>
            )}

            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                {isMfa ? <ShieldCheck className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                {isMfa ? 'Two-factor verification' : isSignUp ? 'Create your Spyda account' : 'Welcome back'}
              </div>
              <h2 className="font-heading text-3xl font-semibold sm:text-4xl">{isMfa ? 'Confirm it is you.' : isSignUp ? 'Build from your next reference.' : 'Continue your design work.'}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{isMfa ? 'Enter the current code from the authenticator app connected to your Spyda account.' : isSignUp ? 'Create an account to save projects, brand assets, history, and generated designs.' : 'Sign in to open your projects, design atoms, and latest child versions.'}</p>
            </div>

            <form onSubmit={isMfa ? handleMfa : handleAuth} className="space-y-5">
              {error && <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3 text-sm leading-5 text-red-300">{error}</div>}
              {message && <div className="rounded-lg border border-primary/25 bg-primary/[0.07] p-3 text-sm leading-5 text-primary">{message}</div>}

              {isMfa ? (
                <div>
                  <label htmlFor="mfa-code" className="mb-2 block text-xs font-medium text-foreground">Authenticator code</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                    <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" className="h-12 w-full rounded-lg border border-white/[0.09] bg-white/[0.025] pl-10 pr-4 font-mono text-sm tracking-[0.28em] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="auth-email" className="mb-2 block text-xs font-medium text-foreground">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-lg border border-white/[0.09] bg-white/[0.025] pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between"><label htmlFor="auth-password" className="text-xs font-medium text-foreground">Password</label>{isSignUp && <span className="text-[10px] text-muted-foreground">8 characters minimum</span>}</div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={isSignUp ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} placeholder={isSignUp ? 'Create a strong password' : 'Enter your password'} className="h-12 w-full rounded-lg border border-white/[0.09] bg-white/[0.025] pl-10 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50" />
                      <button type="button" onClick={() => setShowPassword(previous => !previous)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading || sessionLoading || mfaStatus === 'checking'} className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_14px_38px_rgba(157,250,176,0.16)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                {loading || sessionLoading || mfaStatus === 'checking' ? <Loader2 className="h-5 w-5 animate-spin" /> : isMfa ? 'Verify and continue' : isSignUp ? 'Create account' : 'Sign in to Spyda'}
                {!loading && !sessionLoading && mfaStatus !== 'checking' && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            {!isMfa && (
              <div className="mt-6 border-t border-white/[0.07] pt-5">
                <p className="text-center text-xs leading-5 text-muted-foreground">{isSignUp ? 'By creating an account, you agree to use Spyda responsibly with designs and assets you are allowed to use.' : 'Your saved workspace becomes available after authentication.'}</p>
                <p className="mt-4 text-center text-sm text-muted-foreground">{isSignUp ? 'Already have an account?' : 'New to Spyda?'} <button type="button" onClick={() => switchMode(!isSignUp)} className="font-semibold text-primary hover:underline">{isSignUp ? 'Sign in' : 'Create an account'}</button></p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
