import { useCallback, useEffect, useState } from 'react'
import type { ElementType, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Ticket,
  Users as UsersIcon,
  LayoutDashboard,
  Copy,
  Check,
  Plus,
  Coins,
  RefreshCw,
  CircleCheck,
  XCircle,
  ArrowLeft,
  Send,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import {
  ADMIN_EMAIL,
  isAdminEmail,
  COUPON_AMOUNTS,
  generateCoupon,
  listCoupons,
  listUsers,
  adjustCredits,
  sendCreditsBySpydaId,
  overviewStats,
  type Coupon,
  type AdminUser,
  type OverviewStats,
} from '../lib/admin'

const fmt = (n: number) => n.toLocaleString()

function SpydaMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-[8px] bg-brand-gradient font-heading font-bold text-white shadow-sm ${className}`}>
      S
    </div>
  )
}

// ── Login gate ────────────────────────────────────────────────────────────────
function AdminLogin() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(ADMIN_EMAIL)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (!isAdminEmail(email)) {
        throw new Error('This portal is for the Spyda administrator only.')
      }
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <SpydaMark className="h-12 w-12 text-lg" />
          <h1 className="mt-4 font-heading text-2xl font-semibold">Spyda Admin</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> Restricted control panel
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 shadow-xl">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin email</label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 pl-10 pr-3 text-sm outline-none focus:border-primary/50"
              placeholder="admin@spydadesigns.xyz"
            />
          </div>

          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
          <div className="relative mb-5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 pl-10 pr-10 text-sm outline-none focus:border-primary/50"
              placeholder="Enter your password"
            />
            <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? 'Signing in…' : 'Enter admin panel'}
          </button>
        </form>

        <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Spyda
        </Link>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStats(await overviewStats())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load stats.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Total users', value: stats?.total_users, icon: UsersIcon },
    { label: 'Credits in circulation', value: stats?.total_credits, icon: Coins },
    { label: 'Active coupons', value: stats?.coupons_active, icon: Ticket },
    { label: 'Coupons redeemed', value: stats?.coupons_redeemed, icon: CircleCheck },
    { label: 'Credits from coupons', value: stats?.credits_from_coupons, icon: Coins },
  ]

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">A live snapshot of the Spyda economy.</p>
        </div>
        <button onClick={load} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => (
          <div key={card.label} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <card.icon className="h-4 w-4 text-primary" /> {card.label}
            </div>
            <p className="mt-3 font-heading text-3xl font-semibold">
              {loading || card.value === undefined ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : fmt(card.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Coupons tab ───────────────────────────────────────────────────────────────
function CouponsTab() {
  const [amount, setAmount] = useState<number>(1000)
  const [customAmount, setCustomAmount] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [newCoupon, setNewCoupon] = useState<Coupon | null>(null)
  const [copied, setCopied] = useState(false)

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      setCoupons(await listCoupons())
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load coupons.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleGenerate = async () => {
    if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) {
      setGenError('Enter a whole credit amount between 1 and 10,000,000.')
      return
    }
    setGenerating(true)
    setGenError('')
    setNewCoupon(null)
    setCopied(false)
    try {
      const coupon = await generateCoupon(amount)
      setNewCoupon(coupon)
      await load()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not generate a coupon.')
    } finally {
      setGenerating(false)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-heading text-xl font-semibold">Coupon codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Generate single-use codes. Each code can be redeemed once, then it expires.</p>
      </div>

      {/* Generator */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Choose credit amount</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COUPON_AMOUNTS.map(value => {
            const selected = amount === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAmount(value)
                  setCustomAmount('')
                  setGenError('')
                }}
                aria-pressed={selected && customAmount === ''}
                className={`rounded-lg border p-4 text-left transition-colors ${selected && customAmount === '' ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-2xl font-semibold">{fmt(value)}</span>
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/[0.16]'}`}>
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Coins className="h-3.5 w-3.5 text-primary" /> Spyda Credits</p>
              </button>
            )
          })}
          
          {/* Custom Amount */}
          <div className={`rounded-lg border p-4 transition-colors ${customAmount !== '' ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
            <p className="mb-2 text-xs font-semibold text-foreground">Custom amount</p>
            <div className="flex items-center gap-2 border-b border-white/[0.14] pb-1 focus-within:border-primary/50">
              <input
                type="number"
                min="1"
                max="10000000"
                step="1"
                inputMode="numeric"
                value={customAmount}
                onChange={e => {
                  setCustomAmount(e.target.value)
                  setAmount(Number(e.target.value))
                  setGenError('')
                }}
                placeholder="Any amount"
                aria-label="Custom Spyda coupon credit amount"
                className="w-full bg-transparent font-heading text-2xl font-semibold outline-none placeholder:text-base placeholder:text-muted-foreground"
              />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Coins className="h-3.5 w-3.5 text-primary" /> 1 to 10,000,000 credits</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Use a preset or create any amount, including below 500 or above 2,800. The code will grant <span className="font-semibold text-foreground">{Number.isFinite(amount) ? fmt(amount) : '0'} credits</span> once.</p>
          <button
            onClick={handleGenerate}
            disabled={generating || !Number.isInteger(amount) || amount < 1 || amount > 10_000_000}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {generating ? 'Generating…' : 'Generate coupon code'}
          </button>
        </div>

        {genError && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{genError}</p>}

        {newCoupon && (
          <div className="mt-5 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">New coupon · {fmt(newCoupon.credit_amount)} credits</p>
              <p className="mt-1 font-heading text-2xl font-semibold tracking-wide">{newCoupon.code}</p>
            </div>
            <button onClick={() => copyCode(newCoupon.code)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold">Issued coupons</h3>
        <button onClick={load} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {listError && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{listError}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Credits</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Redeemed by</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No coupons generated yet.</td></tr>
              ) : (
                coupons.map(c => (
                  <tr key={c.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-4 py-3 font-mono font-medium tracking-wide">{c.code}</td>
                    <td className="px-4 py-3">{fmt(c.credit_amount)}</td>
                    <td className="px-4 py-3">
                      {c.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-muted-foreground"><Check className="h-3 w-3" /> Redeemed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.redeemed_email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [recipientSpydaId, setRecipientSpydaId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const [sending, setSending] = useState(false)
  const [transferNotice, setTransferNotice] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await listUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const apply = async (userId: string) => {
    const raw = drafts[userId]
    const delta = Number(raw)
    if (!raw || Number.isNaN(delta) || delta === 0) {
      setNotice({ id: userId, text: 'Enter a non-zero amount (use a minus sign to remove).', ok: false })
      return
    }
    setSavingId(userId)
    setNotice(null)
    try {
      const newBalance = await adjustCredits(userId, delta)
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, wallet_balance: newBalance } : u)))
      setDrafts(prev => ({ ...prev, [userId]: '' }))
      setNotice({ id: userId, text: `Balance updated to ${fmt(newBalance)} credits.`, ok: true })
    } catch (err) {
      setNotice({ id: userId, text: err instanceof Error ? err.message : 'Could not adjust credits.', ok: false })
    } finally {
      setSavingId(null)
    }
  }

  const sendCredits = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedId = recipientSpydaId.trim().toUpperCase()
    const amount = Number(transferAmount)

    if (!/^SPY-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalizedId)) {
      setTransferNotice({ text: 'Enter a valid Spyda ID in the format SPY-XXXX-XXXX.', ok: false })
      return
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) {
      setTransferNotice({ text: 'Enter a whole amount between 1 and 10,000,000 credits.', ok: false })
      return
    }

    setSending(true)
    setTransferNotice(null)
    try {
      const result = await sendCreditsBySpydaId(normalizedId, amount, transferNote)
      setUsers(prev => prev.map(user => (
        user.id === result.target_user_id
          ? { ...user, wallet_balance: result.new_balance }
          : user
      )))
      setRecipientSpydaId('')
      setTransferAmount('')
      setTransferNote('')
      setTransferNotice({
        text: `${fmt(amount)} credits sent to ${result.spyda_id}. New balance: ${fmt(result.new_balance)} credits.`,
        ok: true,
      })
    } catch (err) {
      setTransferNotice({
        text: err instanceof Error ? err.message : 'Could not send Spyda credits.',
        ok: false,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">View balances and manually add or remove Spyda credits.</p>
        </div>
        <button onClick={load} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <form onSubmit={sendCredits} className="mb-6 rounded-xl border border-primary/20 bg-primary/[0.035] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Send className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-heading text-base font-semibold">Send Spyda Credits</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Admin-only wallet transfer. Enter the user’s public Spyda ID shown on their wallet.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(200px,.8fr)_minmax(160px,.55fr)_minmax(240px,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recipient Spyda ID</span>
            <input
              value={recipientSpydaId}
              onChange={event => setRecipientSpydaId(event.target.value.toUpperCase())}
              placeholder="SPY-XXXX-XXXX"
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 font-mono text-sm uppercase outline-none focus:border-primary/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Credits</span>
            <input
              type="number"
              min="1"
              max="10000000"
              step="1"
              inputMode="numeric"
              value={transferAmount}
              onChange={event => setTransferAmount(event.target.value)}
              placeholder="Amount"
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Transfer note</span>
            <input
              value={transferNote}
              onChange={event => setTransferNote(event.target.value)}
              maxLength={120}
              placeholder="Optional reason"
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50"
            />
          </label>
          <button
            type="submit"
            disabled={sending}
            className="mt-[22px] inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send credits'}
          </button>
        </div>

        {transferNotice && (
          <p role="status" className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${transferNotice.ok ? 'border-primary/25 bg-primary/[0.06] text-primary' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
            {transferNotice.ok ? <CircleCheck className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {transferNotice.text}
          </p>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Adjust credits</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="border-b border-white/[0.05] align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium">
                        {u.email}
                        {u.is_admin && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Admin</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-primary/80">{u.spyda_id || `SPY-${u.id.slice(0, 4)}-${u.id.slice(-4)}`}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-heading text-base font-semibold">{fmt(u.wallet_balance)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">credits</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={drafts[u.id] ?? ''}
                          onChange={e => setDrafts(prev => ({ ...prev, [u.id]: e.target.value }))}
                          placeholder="e.g. 500 or -200"
                          className="h-9 w-36 rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50"
                        />
                        <button
                          onClick={() => apply(u.id)}
                          disabled={savingId === u.id}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply
                        </button>
                      </div>
                      {notice && notice.id === u.id && (
                        <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${notice.ok ? 'text-primary' : 'text-destructive'}`}>
                          {notice.ok ? <CircleCheck className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {notice.text}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────
type TabId = 'overview' | 'coupons' | 'users'

export default function Admin() {
  const { user, loading, signOut } = useAuth()
  const [tab, setTab] = useState<TabId>('overview')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!user || !isAdminEmail(user.email)) {
    // A signed-in non-admin is shown the login gate with a clear message.
    return <AdminLogin />
  }

  const tabs: { id: TabId; label: string; icon: ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'users', label: 'Users', icon: UsersIcon },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#060608]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SpydaMark className="h-9 w-9 text-sm" />
            <div>
              <p className="font-heading text-sm font-semibold leading-none">Spyda Admin</p>
              <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/workspace" className="hidden h-9 items-center rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
              Workspace
            </Link>
            <button onClick={() => signOut()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <nav className="mb-7 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
          {tabs.map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            )
          })}
        </nav>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'coupons' && <CouponsTab />}
        {tab === 'users' && <UsersTab />}
      </div>
    </div>
  )
}
