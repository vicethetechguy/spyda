import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Bell, CheckCheck, Loader2, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  listWalletNotifications,
  markWalletNotificationsRead,
  parseWalletTransaction,
  type WalletTransaction,
} from '../../lib/wallet'

type WalletNotificationCenterProps = {
  userId?: string
  onOpenWallet: () => void
}

export function WalletNotificationCenter({ userId, onOpenWallet }: WalletNotificationCenterProps) {
  const [notifications, setNotifications] = useState<WalletTransaction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveNotice, setLiveNotice] = useState<WalletTransaction | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([])
      setLoading(false)
      return
    }
    try {
      setNotifications(await listWalletNotifications(userId))
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Wallet notifications are unavailable.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
    if (!userId) return

    const timer = window.setInterval(() => void load(), 20_000)
    const onFocus = () => void load()
    const channel = supabase
      .channel(`user-wallet-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${userId}` },
        payload => {
          const transaction = parseWalletTransaction(payload.new)
          setNotifications(current => [
            transaction,
            ...current.filter(item => item.id !== transaction.id),
          ].slice(0, 25))
          setLiveNotice(transaction)
          if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
          noticeTimerRef.current = window.setTimeout(() => setLiveNotice(null), 6000)
        },
      )
      .subscribe()

    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
      void supabase.removeChannel(channel)
    }
  }, [load, userId])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const unread = notifications.filter(item => !item.read_at).length

  const markAllRead = async () => {
    try {
      await markWalletNotificationsRead()
      const readAt = new Date().toISOString()
      setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at || readAt })))
      setError('')
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Notifications could not be updated.')
    }
  }

  const openNotification = (notification: WalletTransaction) => {
    if (!notification.read_at) {
      void markWalletNotificationsRead([notification.id]).catch(() => undefined)
      setNotifications(current => current.map(item => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString() }
        : item))
    }
    setOpen(false)
    onOpenWallet()
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={`Wallet notifications${unread ? `, ${unread} unread` : ''}`}
        title="Notifications"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#060608] bg-primary px-1 text-[8px] font-bold text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[64px] z-[70] overflow-hidden rounded-xl border border-white/[0.1] bg-[#090b0a] shadow-[0_24px_80px_rgba(0,0,0,.7)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-[390px]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3.5">
            <div>
              <p className="font-heading text-sm font-semibold">Notifications</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{unread} unread wallet update{unread === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={() => void markAllRead()} disabled={!unread} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold text-primary hover:bg-primary/[0.08] disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>

          <div className="max-h-[min(65vh,520px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : error && !notifications.length ? (
              <div className="p-5 text-center text-xs leading-5 text-amber-300">{error}</div>
            ) : notifications.length ? notifications.map(notification => {
              const incoming = notification.amount > 0
              return (
                <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`block w-full border-b border-white/[0.06] px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-white/[0.035] ${notification.read_at ? '' : 'bg-primary/[0.035]'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${incoming ? 'border-primary/20 bg-primary/[0.08] text-primary' : 'border-[#ff8f5c]/20 bg-[#ff8f5c]/[0.06] text-[#ffab84]'}`}>
                      {incoming ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{notification.description}</span>
                      <span className={`mt-1 block text-[11px] font-semibold ${incoming ? 'text-primary' : 'text-[#ffab84]'}`}>{incoming ? '+' : ''}{notification.amount.toLocaleString()} credits</span>
                      <span className="mt-1.5 block text-[9px] uppercase tracking-wide text-muted-foreground">{notification.created_at ? new Date(notification.created_at).toLocaleString() : 'Just now'}</span>
                    </span>
                    {!notification.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" />}
                  </div>
                </button>
              )
            }) : (
              <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center">
                <Wallet className="h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No wallet updates yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Funding, rewards, transfers, and spending will appear here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {liveNotice && (
        <button
          type="button"
          onClick={() => { setLiveNotice(null); openNotification(liveNotice) }}
          className="fixed right-4 top-[68px] z-[80] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-primary/25 bg-[#0b1510]/95 p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,.55)] backdrop-blur-xl"
        >
          <span className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.1] text-primary"><Bell className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{liveNotice.description}</span>
              <span className="mt-1 block text-[11px] text-primary">{liveNotice.amount > 0 ? '+' : ''}{liveNotice.amount.toLocaleString()} credits · Balance {liveNotice.balance_after.toLocaleString()}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
