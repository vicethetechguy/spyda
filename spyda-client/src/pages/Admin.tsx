import { useCallback, useEffect, useRef, useState } from 'react'
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
  Gift,
  ExternalLink,
  Clock3,
  Repeat2,
  AtSign,
  Bell,
  CheckCheck,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
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
  listAdminNotifications,
  markAdminNotificationsRead,
  type AdminNotification,
  type Coupon,
  type AdminUser,
  type OverviewStats,
} from '../lib/admin'
import {
  SPYDA_PINNED_POST_URL,
  WELCOME_REWARD_CREDITS,
  adminListWelcomeRewardClaims,
  adminReviewWelcomeRewardClaim,
  type AdminWelcomeRewardClaim,
  type WelcomeRewardStatus,
} from '../lib/rewards'
import { formatSpydaWalletId } from '../lib/code-format'

const fmt = (n: number) => n.toLocaleString()
type TabId = 'overview' | 'coupons' | 'users' | 'task-reviews'

function notificationTarget(eventType: string): TabId {
  if (eventType === 'task_submitted') return 'task-reviews'
  if (eventType === 'coupon_redeemed') return 'coupons'
  if (eventType === 'user_joined') return 'users'
  return 'overview'
}

function AdminNotificationCenter({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setNotifications(await listAdminNotifications())
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Notifications are unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    const onFocus = () => void load()
    const channel = supabase
      .channel('spyda-admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' }, () => void load())
      .subscribe()

    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const unread = notifications.filter(item => !item.read_at).length

  useEffect(() => {
    const baseTitle = 'Spyda Admin'
    document.title = unread ? `(${unread}) ${baseTitle}` : baseTitle
    return () => { document.title = 'Spyda' }
  }, [unread])

  const markAllRead = async () => {
    try {
      await markAdminNotificationsRead()
      const now = new Date().toISOString()
      setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at || now })))
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not mark notifications as read.')
    }
  }

  const openNotification = async (notification: AdminNotification) => {
    if (!notification.read_at) {
      void markAdminNotificationsRead([notification.id]).catch(() => undefined)
      setNotifications(current => current.map(item => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString() }
        : item))
    }
    setOpen(false)
    onNavigate(notificationTarget(notification.event_type))
  }

  return (
    <div ref={panelRef} className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.03] text-muted-foreground transition-colors hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#060608] bg-primary px-1 text-[9px] font-bold text-primary-foreground">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[72px] z-50 overflow-hidden rounded-xl border border-white/[0.1] bg-[#090b0a] shadow-[0_24px_80px_rgba(0,0,0,.7)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3.5">
            <div><p className="font-heading text-sm font-semibold">Activity</p><p className="mt-0.5 text-[10px] text-muted-foreground">{unread} unread notification{unread === 1 ? '' : 's'}</p></div>
            <button type="button" onClick={() => void markAllRead()} disabled={!unread} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold text-primary hover:bg-primary/[0.08] disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
          </div>

          <div className="max-h-[min(65vh,520px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : error && !notifications.length ? (
              <div className="p-5 text-center text-xs leading-5 text-amber-300">{error}</div>
            ) : notifications.length ? notifications.map(notification => (
              <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`block w-full border-b border-white/[0.06] px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-white/[0.035] ${notification.read_at ? '' : 'bg-primary/[0.035]'}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? 'bg-white/15' : 'bg-primary shadow-[0_0_12px_rgba(157,250,176,.6)]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{notification.title}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{notification.message}</span>
                    <span className="mt-2 block text-[9px] uppercase tracking-wide text-muted-foreground">{notification.created_at ? new Date(notification.created_at).toLocaleString() : 'Just now'}</span>
                  </span>
                </div>
              </button>
            )) : (
              <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center"><Bell className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">No activity yet</p><p className="mt-1 text-xs text-muted-foreground">New Spyda activity will appear here.</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SpydaMark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/assets/spyda-logo.png"
      alt="Spyda"
      className={`shrink-0 object-contain ${className}`}
    />
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
      setUsers(prev => prev.map(user => {
        if (user.id === result.target_user_id) {
          return { ...user, wallet_balance: result.new_balance }
        }
        if (user.is_admin && result.sender_balance !== null) {
          return { ...user, wallet_balance: result.sender_balance }
        }
        return user
      }))
      setRecipientSpydaId('')
      setTransferAmount('')
      setTransferNote('')
      setTransferNotice({
        text: `${fmt(amount)} credits sent to ${result.recipient_email || result.spyda_id}. Recipient balance: ${fmt(result.new_balance)} credits.`,
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
              onChange={event => setRecipientSpydaId(formatSpydaWalletId(event.target.value))}
              placeholder="SPY-XXXX-XXXX"
              maxLength={13}
              autoComplete="off"
              spellCheck={false}
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
function TaskReviewsTab() {
  const [claims, setClaims] = useState<AdminWelcomeRewardClaim[]>([])
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const status: WelcomeRewardStatus | undefined = filter === 'pending' ? 'pending' : undefined
      setClaims(await adminListWelcomeRewardClaims(status))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load task submissions.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  const review = async (claim: AdminWelcomeRewardClaim, approved: boolean) => {
    setReviewingId(claim.user_id)
    setError('')
    setNotice('')
    try {
      const result = await adminReviewWelcomeRewardClaim(claim.user_id, approved, notes[claim.user_id])
      setClaims(current => current
        .map(item => item.user_id === claim.user_id
          ? {
              ...item,
              status: result.status,
              admin_note: notes[claim.user_id]?.trim() || null,
              credits_awarded: approved ? WELCOME_REWARD_CREDITS : 0,
              reviewed_at: new Date().toISOString(),
              wallet_balance: result.user_balance,
              payout_id: result.payout_id,
            }
          : item)
        .filter(item => filter !== 'pending' || item.status === 'pending'))
      setNotice(approved
        ? `${WELCOME_REWARD_CREDITS} credits awarded to ${result.recipient_email || claim.email} (${result.spyda_id || claim.spyda_id}). Wallet balance: ${fmt(result.user_balance)}. Verified X: @${result.x_handle || claim.x_handle}.`
        : `@${claim.x_handle}'s claim was returned for correction.`)
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not complete this review.')
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary"><Gift className="h-3.5 w-3.5" /> Welcome reward</div>
          <h2 className="mt-2 font-heading text-xl font-semibold">Task Reviews</h2>
          <p className="mt-1 text-sm text-muted-foreground">Verify X activity before releasing {WELCOME_REWARD_CREDITS} Spyda Credits.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.09] bg-white/[0.025] p-1">
            {(['pending', 'all'] as const).map(option => (
              <button key={option} type="button" onClick={() => setFilter(option)} className={`h-8 rounded-md px-3 text-xs font-semibold capitalize transition-colors ${filter === option ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm text-muted-foreground hover:text-foreground"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </div>

      {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm text-primary"><CircleCheck className="h-4 w-4" />{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-white/[0.08]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : claims.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] bg-white/[0.015] px-6 text-center">
          <CircleCheck className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-heading text-lg font-semibold">Queue cleared</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There are no {filter === 'pending' ? 'pending ' : ''}welcome reward claims to review.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {claims.map(claim => {
            const pending = claim.status === 'pending'
            const busy = reviewingId === claim.user_id
            return (
              <article key={claim.user_id} className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.018]">
                <div className="grid gap-5 border-b border-white/[0.07] p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-base font-semibold">{claim.email}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${claim.status === 'approved' ? 'border-primary/25 bg-primary/10 text-primary' : claim.status === 'rejected' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-[#8bd3ff]/25 bg-[#8bd3ff]/10 text-[#8bd3ff]'}`}>{claim.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground"><span className="font-mono text-primary/80">{claim.spyda_id}</span> <span className="mx-1 text-white/20">/</span> X verification: <span className="font-semibold text-foreground">@{claim.x_handle}</span></p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Wallet balance: {claim.wallet_balance === null ? 'Unavailable' : `${fmt(claim.wallet_balance)} credits`}{claim.payout_id ? ` / Receipt ${claim.payout_id.slice(0, 8)}` : ''}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Submitted {claim.submitted_at ? new Date(claim.submitted_at).toLocaleString() : 'recently'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`https://x.com/${claim.x_handle}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold hover:bg-white/[0.05]"><AtSign className="h-3.5 w-3.5" /> Open profile <ExternalLink className="h-3 w-3" /></a>
                    <a href={SPYDA_PINNED_POST_URL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold hover:bg-white/[0.05]"><Repeat2 className="h-3.5 w-3.5" /> Open post <ExternalLink className="h-3 w-3" /></a>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ['Follow @spydadesign', claim.follow_spyda],
                      ['Repost pinned post', claim.repost_pinned],
                      ['Follow @viceonchain', claim.follow_vice],
                    ].map(([label, complete]) => (
                      <div key={String(label)} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/15 px-3 py-3 text-xs">{complete ? <Check className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}{String(label)}</div>
                    ))}
                  </div>

                  {pending ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review note</span>
                        <input value={notes[claim.user_id] ?? ''} onChange={event => setNotes(current => ({ ...current, [claim.user_id]: event.target.value }))} maxLength={240} placeholder="Optional for approval; recommended when rejecting" className="h-11 w-full rounded-lg border border-white/[0.1] bg-background/60 px-3 text-sm outline-none focus:border-primary/50" />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void review(claim, false)} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button>
                        <button type="button" onClick={() => void review(claim, true)} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Approve + send {WELCOME_REWARD_CREDITS}</button>
                      </div>
                    </div>
                  ) : claim.status === 'approved' && !claim.payout_id ? (
                    <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-200"><span className="font-semibold">Payout receipt not found.</span> Check this Spyda Wallet ID in Users and its wallet activity before sending a one-time 60-credit compensation.</p>
                  ) : claim.admin_note ? (
                    <p className="mt-4 rounded-lg border border-white/[0.07] bg-black/15 px-4 py-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Admin note:</span> {claim.admin_note}</p>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
    { id: 'task-reviews', label: 'Task Reviews', icon: Gift },
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
            <AdminNotificationCenter onNavigate={setTab} />
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
        {tab === 'task-reviews' && <TaskReviewsTab />}
      </div>
    </div>
  )
}
