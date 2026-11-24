import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Coins, Download, Gauge, Loader2, X } from './ui/icons'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { canCompressVideo, compressImage, compressVideo, formatBytes } from '../lib/compress'

/**
 * Every download in Spyda goes through here. A Spyda card shows the price
 * (100 credits, +50 with the compressor) and the balance; the file is built
 * (and compressed, when the switch is on), then charged, and only saved once
 * the charge succeeds — so nothing is debited for a download that never
 * finished, and nothing is saved without paying.
 */

export const DOWNLOAD_PRICE = 100
export const COMPRESS_PRICE = 50

export type DownloadKind = 'image' | 'video' | 'file'

export type DownloadRequest = {
  /** File name, with extension. */
  name: string
  kind: DownloadKind
  /** What is being downloaded, for the card's title. */
  title?: string
  /** Builds the file. `report` updates the card's progress (0..1). */
  produce: (report: (progress: number, label?: string) => void) => Promise<Blob>
  /** Offer the compressor (images and video). Defaults to true for those kinds. */
  compressible?: boolean
}

type Phase =
  | { step: 'confirm' }
  | { step: 'working'; label: string; progress: number }
  | { step: 'done'; before: number; after: number; compressed: boolean; charged: number; balance: number | null; name: string }
  | { step: 'error'; message: string }

type Pending = { request: DownloadRequest; resolve: (ok: boolean) => void }

const DownloadContext = createContext<((request: DownloadRequest) => Promise<boolean>) | null>(null)

/** Opens the Spyda download card; resolves true once the file is saved and paid for. */
export function useDownload() {
  const download = useContext(DownloadContext)
  if (!download) throw new Error('useDownload needs a DownloadProvider.')
  return download
}

export function saveBlob(blob: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 60_000)
}

/** The bytes behind a URL (data:, blob: or a signed link), for the download card. */
export async function fetchBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('This file could not be fetched. Nothing was charged.')
  return response.blob()
}

const previewWithoutAccount = () => import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true'

/** Debits the download on the server, which sets the price. Returns the new balance. */
async function chargeDownload(kind: DownloadKind, compressed: boolean, name: string, signedIn: boolean): Promise<{ balance: number | null; charged: number }> {
  const price = DOWNLOAD_PRICE + (compressed ? COMPRESS_PRICE : 0)
  if (!signedIn && previewWithoutAccount()) return { balance: null, charged: 0 }
  const { data, error } = await supabase.rpc('charge_download', { p_kind: kind, p_compressed: compressed, p_file_name: name })
  if (error) {
    if (/not enough/i.test(error.message)) throw new Error(`You need ${price} Spyda credits for this download. Top up your wallet and try again.`)
    if (/sign in/i.test(error.message)) throw new Error('Sign in to download.')
    throw new Error(error.message || 'The download could not be charged.')
  }
  const row = (Array.isArray(data) ? data[0] : data) as { wallet_balance?: number; credits_charged?: number } | null
  const balance = row?.wallet_balance ?? null
  if (balance != null) window.dispatchEvent(new CustomEvent('spyda:wallet', { detail: { balance } }))
  return { balance, charged: row?.credits_charged ?? price }
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<Pending | null>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'confirm' })
  const [compress, setCompress] = useState(() => {
    try { return window.localStorage.getItem('spyda.compressDownloads') === 'true' } catch { return false }
  })
  const [balance, setBalance] = useState<number | null>(null)
  const closeTimer = useRef(0)

  const download = useCallback((request: DownloadRequest) => new Promise<boolean>(resolve => {
    window.clearTimeout(closeTimer.current)
    setPhase({ step: 'confirm' })
    setPending({ request, resolve })
  }), [])

  // The balance, for the card.
  useEffect(() => {
    if (!pending || !user) { setBalance(null); return }
    let active = true
    void Promise.resolve(supabase.from('profiles').select('wallet_balance').eq('id', user.id).maybeSingle()).then(({ data }) => {
      if (active) setBalance(data ? Number(data.wallet_balance ?? 0) : null)
    })
    return () => { active = false }
  }, [pending, user])

  useEffect(() => {
    try { window.localStorage.setItem('spyda.compressDownloads', String(compress)) } catch { /* storage off */ }
  }, [compress])

  const finish = useCallback((ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }, [pending])

  const request = pending?.request
  const canCompress = Boolean(request && (request.compressible ?? request.kind !== 'file') && (request.kind !== 'video' || canCompressVideo()))
  const useCompressor = canCompress && compress
  const price = DOWNLOAD_PRICE + (useCompressor ? COMPRESS_PRICE : 0)
  const short = balance != null && balance < price

  const start = async () => {
    if (!request) return
    try {
      setPhase({ step: 'working', label: request.kind === 'video' ? 'Rendering your video…' : 'Preparing your file…', progress: 0 })
      const report = (progress: number, label?: string) => setPhase(current => (current.step === 'working' ? { step: 'working', label: label ?? current.label, progress: useCompressor ? progress * 0.6 : progress } : current))
      let blob = await request.produce(report)
      let name = request.name
      const before = blob.size
      let compressed = false
      if (useCompressor) {
        setPhase({ step: 'working', label: request.kind === 'video' ? 'Compressing — keeping every detail…' : 'Compressing — checking every pixel…', progress: 0.6 })
        const result = request.kind === 'video'
          ? await compressVideo(blob, name, progress => setPhase({ step: 'working', label: 'Compressing — keeping every detail…', progress: 0.6 + progress * 0.37 }))
          : await compressImage(blob, name)
        blob = result.blob
        name = result.name
        compressed = result.compressed
      }
      setPhase({ step: 'working', label: 'Finishing your download…', progress: 0.98 })
      // Charged only now that the file is ready; the compressor is only billed when it saved space.
      const charge = await chargeDownload(request.kind, compressed, name, Boolean(user))
      saveBlob(blob, name)
      setPhase({ step: 'done', before, after: blob.size, compressed, charged: charge.charged, balance: charge.balance, name })
      pending?.resolve(true)
      closeTimer.current = window.setTimeout(() => setPending(null), compressed ? 4200 : 2600)
    } catch (error) {
      setPhase({ step: 'error', message: error instanceof Error ? error.message : 'The download did not finish. Nothing was charged.' })
    }
  }

  const working = phase.step === 'working'

  return (
    <DownloadContext.Provider value={download}>
      {children}
      {pending && request ? (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={event => { if (event.target === event.currentTarget && !working) finish(false) }}>
          <div role="dialog" aria-modal="true" aria-label="Download" className="spyda-select-menu w-full max-w-[380px] rounded-2xl border border-white/[0.1] bg-[#15161a]/95 p-5 text-foreground shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Download className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold">{phase.step === 'done' ? 'Downloaded' : request.title ?? 'Download'}</h2>
                <p className="truncate text-[11px] text-muted-foreground">{phase.step === 'done' ? phase.name : request.name}</p>
              </div>
              {!working ? <button type="button" onClick={() => finish(phase.step === 'done')} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><X className="h-4 w-4" /></button> : null}
            </div>

            {phase.step === 'confirm' ? (
              <>
                {canCompress ? (
                  <button type="button" role="switch" aria-checked={compress} onClick={() => setCompress(value => !value)} className={`mt-4 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${compress ? 'border-primary/50 bg-primary/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'}`}>
                    <Gauge className={`mt-0.5 h-4 w-4 shrink-0 ${compress ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between text-[12px] font-semibold">{request.kind === 'video' ? 'Video compressor' : 'Graphics compressor'}<span className="text-[11px] font-medium text-primary">+{COMPRESS_PRICE} credits</span></span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{request.kind === 'video' ? 'Makes the file smaller, then checks it frame by frame against the original. If any detail would be lost, it keeps your original instead. Charged only if it saves space.' : 'Cuts the file size by up to 90% while keeping it visually identical. Charged only if it saves space.'}</span>
                    </span>
                    <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${compress ? 'bg-primary' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${compress ? 'left-[18px]' : 'left-0.5'}`} /></span>
                  </button>
                ) : null}
                <dl className="mt-4 space-y-1.5 rounded-xl bg-white/[0.03] p-3 text-[12px]">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Download</dt><dd>{DOWNLOAD_PRICE} credits</dd></div>
                  {useCompressor ? <div className="flex justify-between"><dt className="text-muted-foreground">Compressor</dt><dd>{COMPRESS_PRICE} credits</dd></div> : null}
                  <div className="flex justify-between border-t border-white/[0.06] pt-1.5 font-semibold"><dt>Total</dt><dd className="flex items-center gap-1 text-primary"><Coins className="h-3.5 w-3.5" /> {price} credits</dd></div>
                  {balance != null ? <div className="flex justify-between text-[11px]"><dt className="text-muted-foreground">Your balance</dt><dd className={short ? 'text-red-300' : 'text-muted-foreground'}>{balance.toLocaleString()} credits</dd></div> : null}
                </dl>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Credits are taken only once your file has finished downloading.</p>
                {short ? (
                  <button type="button" onClick={() => { finish(false); navigate('/workspace') }} className="mt-4 h-10 w-full rounded-xl border border-white/[0.12] text-[13px] font-semibold hover:bg-white/[0.06]">Not enough credits · Top up</button>
                ) : (
                  <button type="button" onClick={() => { void start() }} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]">
                    <Download className="h-4 w-4" /> Download · {price} credits
                  </button>
                )}
              </>
            ) : phase.step === 'working' ? (
              <div className="mt-5">
                <p className="flex items-center gap-2 text-[12px]"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> {phase.label}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(phase.progress * 100)}%` }} /></div>
                <p className="mt-2 text-[10px] text-muted-foreground">Keep this tab open. Nothing is charged until the file is ready.</p>
              </div>
            ) : phase.step === 'done' ? (
              <div className="mt-4 space-y-3">
                {phase.compressed ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-3">
                    <p className="text-[22px] font-bold text-primary">{Math.round((1 - phase.after / Math.max(1, phase.before)) * 100)}% smaller</p>
                    <p className="text-[11px] text-muted-foreground">{formatBytes(phase.before)} → {formatBytes(phase.after)}, same quality</p>
                  </div>
                ) : useCompressor ? (
                  <p className="rounded-xl bg-white/[0.03] p-3 text-[11px] text-muted-foreground">This file was already as small as it can be without losing quality, so it was kept as it is and the compressor was not charged.</p>
                ) : null}
                <p className="flex items-center gap-2 text-[12px]"><Check className="h-4 w-4 text-primary" /> {phase.charged ? `${phase.charged} credits used` : 'Saved (preview: no credits charged)'}{phase.balance != null ? ` · ${phase.balance.toLocaleString()} left` : ''}</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[12px] leading-5 text-red-100">{phase.message}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => finish(false)} className="h-9 rounded-xl border border-white/[0.12] text-[12px] font-semibold hover:bg-white/[0.06]">Close</button>
                  <button type="button" onClick={() => setPhase({ step: 'confirm' })} className="h-9 rounded-xl bg-primary text-[12px] font-semibold text-primary-foreground">Try again</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </DownloadContext.Provider>
  )
}
