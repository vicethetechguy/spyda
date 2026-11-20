import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Coins, Download, FileCode2, Loader2, RefreshCw, RotateCcw, Wrench } from 'lucide-react'
import { MOTION_FORMATS, motionDocument, playerConfig, type MotionPlayerMessage } from '../../lib/motion-harness'
import type { ChatMotion } from '../../lib/chat'

/**
 * One motion design in the chat: progress while Claude writes it, then the
 * sandboxed player with restart, video and HTML downloads. A runtime error in
 * the generated code gets a one-click fix request instead of a dead frame.
 */

type MotionCardProps = {
  motion: ChatMotion
  onRetry: () => void
  onFix: (error: string) => void
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'spyda-motion'
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span className="tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
}

function Player({ motion, onFix }: { motion: ChatMotion & { code: string }; onFix: (error: string) => void }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [state, setState] = useState<'loading' | 'playing' | 'recording' | 'error'>('loading')
  const [error, setError] = useState('')
  const size = MOTION_FORMATS[motion.format]
  const config = useMemo(() => ({ code: motion.code, reference: motion.sourceImage, format: motion.format, duration: motion.duration }), [motion.code, motion.duration, motion.format, motion.sourceImage])
  const srcDoc = useMemo(() => motionDocument(config), [config])
  const name = slug(motion.title || 'spyda-motion')

  useEffect(() => {
    const onMessage = (event: MessageEvent<MotionPlayerMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.source !== 'spyda-motion') return
      const message = event.data
      if (message.type === 'loaded') frameRef.current?.contentWindow?.postMessage({ type: 'init', config: playerConfig(config) }, '*')
      if (message.type === 'ready') setState('playing')
      if (message.type === 'recording') setState('recording')
      if (message.type === 'recorded') {
        setState('playing')
        download(message.blob, `${name}.${message.mimeType.includes('mp4') ? 'mp4' : 'webm'}`)
      }
      if (message.type === 'error') {
        setState('error')
        setError(message.message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [config, name])

  const send = (type: 'restart' | 'record') => frameRef.current?.contentWindow?.postMessage({ type }, '*')

  return (
    <div className="w-full max-w-sm">
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#050606]" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <iframe
          ref={frameRef}
          title={motion.title || 'Motion design'}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="absolute inset-0 h-full w-full border-0"
        />
        {state === 'loading' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : null}
        {state === 'recording' ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording {motion.duration}s
          </span>
        ) : null}
      </div>

      {state === 'error' ? (
        <div className="mt-2.5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
          <p className="text-xs font-medium text-amber-100">This motion hit an error while playing.</p>
          <p className="mt-1 line-clamp-2 font-mono text-[10px] text-amber-200/70">{error}</p>
          <button
            type="button"
            onClick={() => onFix(error)}
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
          >
            <Wrench className="h-3.5 w-3.5" /> Ask Claude to fix it · {motion.cost} credits
          </button>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => send('record')}
            disabled={state !== 'playing'}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50"
          >
            {state === 'recording' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {state === 'recording' ? 'Recording…' : 'Download video'}
          </button>
          <button
            type="button"
            onClick={() => download(new Blob([motionDocument(config, { standalone: true })], { type: 'text/html' }), `${name}.html`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.1] bg-surface-raised px-3.5 text-xs font-semibold transition-colors hover:border-primary/30"
          >
            <FileCode2 className="h-3.5 w-3.5" /> HTML
          </button>
          <button
            type="button"
            onClick={() => send('restart')}
            disabled={state !== 'playing'}
            aria-label="Play from the start"
            title="Play from the start"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-surface-raised text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function MotionCard({ motion, onRetry, onFix }: MotionCardProps) {
  const size = MOTION_FORMATS[motion.format]

  if (motion.status === 'generating') {
    return (
      <div className="mt-1 w-full max-w-sm overflow-hidden rounded-[22px] border border-primary/20 bg-surface">
        <div className="relative overflow-hidden" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          <img src={motion.sourceImage} alt="" className="h-full w-full object-cover opacity-25 blur-[3px]" />
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent,rgba(157,250,176,0.12),transparent)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Clapperboard className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium">Claude Opus 5.5 is designing your motion</p>
            <p className="text-xs text-muted-foreground">This usually takes one to three minutes · <Elapsed /></p>
          </div>
        </div>
      </div>
    )
  }

  if (motion.status === 'failed' || !motion.code) {
    return (
      <div className="mt-1 w-full max-w-md rounded-[22px] border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm text-red-200">{motion.error || 'The motion design could not be made.'}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1">
      <p className="mb-2 flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-semibold">{motion.title || 'Motion design'}</span>
        <span className="text-xs text-muted-foreground">{size.label} · {motion.duration}s · Claude Opus 5.5</span>
      </p>
      <Player motion={{ ...motion, code: motion.code }} onFix={onFix} />
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Coins className="h-3 w-3 text-primary" /> {motion.cost} credits used
        {motion.tokensAwarded ? <span className="font-semibold text-primary"> · +{motion.tokensAwarded} SPYDA</span> : null}
      </p>
    </div>
  )
}
