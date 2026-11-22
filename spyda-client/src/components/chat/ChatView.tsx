import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import CreateDesignDialog from '../CreateDesignDialog'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUp,
  Clapperboard,
  Coins,
  Download,
  History,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Square,
  WandSparkles,
  X,
} from '../ui/icons'
import BrandMark from '../brand/BrandMark'
import ChatMarkdown from './ChatMarkdown'
import MotionCard from './MotionCard'
import { useSpeechInput } from './useSpeechInput'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  SPYDA_MOTION_CREDITS,
  generationCreditCost,
  loadSpydaApiKeys,
  spydaRequestHeaders,
  rewardStandingFrom,
  type RewardStanding,
  type SpydaApiKeys,
} from '../../lib/spyda-api'
import {
  createConversation,
  imageDimensions,
  latestFlyer,
  latestMotion,
  listConversations,
  loadConversation,
  newId,
  prepareImage,
  requestEdit,
  requestMotion,
  requestReply,
  saveConversation,
  titleFrom,
  toJpegDataUrl,
  type ChatEdit,
  type ChatMessage,
  type ChatMotion,
  type Conversation,
  type ConversationSummary,
  type PreparedImage,
} from '../../lib/chat'
import { readProject, saveProject } from '../../lib/project-store'
import { MOTION_FORMATS, type MotionFormat } from '../../lib/motion-harness'

/**
 * The workspace home: bring a reference design and say what to change. In
 * flyer mode a GPT model makes the reference yours, proposing the edit and
 * generating it only after the person confirms its credit cost. In motion mode
 * Claude Opus 5.5 turns the reference into a short animation. Canvas mode hands
 * the current flyer to the layer editor for manual work.
 */

type ComposerMode = 'flyer' | 'motion'
const MOTION_DURATION = 8

export type ChatSeed = {
  /** Changes every time, so the same template can be seeded twice. */
  key: string
  image?: string
  name?: string
  text?: string
}

type ChatViewProps = {
  /** `openai` or `groq`: decides the credit price of a generated version. */
  modelProvider: string
  /** Where the header actions (history, new chat, canvas mode) are drawn. */
  headerSlot: HTMLElement | null
  seed: ChatSeed | null
  onOpenWallet: () => void
}

const MAX_ATTACHMENTS = 3

const SUGGESTIONS: { icon: typeof WandSparkles; title: string; copy: string; prompt: string; mode: ComposerMode }[] = [
  {
    icon: WandSparkles,
    title: 'Make it mine',
    copy: 'Swap in your brand, headline, offer and colours. Keep the design.',
    prompt: 'Make this flyer mine. My brand is ',
    mode: 'flyer',
  },
  {
    icon: Clapperboard,
    title: 'Animate it',
    copy: 'Claude Opus 5.5 turns your design into a short motion video.',
    prompt: 'Animate this for my brand. Make it ',
    mode: 'motion',
  },
  {
    icon: Maximize2,
    title: 'Resize for a format',
    copy: 'Turn it into an Instagram story, a square post or a banner.',
    prompt: 'Resize this flyer into a 9:16 Instagram story and keep everything readable.',
    mode: 'flyer',
  },
]

function firstName(value: string | null | undefined) {
  const name = String(value || '').trim()
  if (!name || name === 'Spyda User') return ''
  return name.split(/\s+/)[0]
}

/* ── The orb ── */

function SpydaOrb({ busy = false }: { busy?: boolean }) {
  return (
    <div className="relative mx-auto h-32 w-32 sm:h-36 sm:w-36" aria-hidden="true">
      <div className={`absolute -inset-3 rounded-full bg-[conic-gradient(from_0deg,#9dfab0,#8bd3ff,#0c5b86,#12866f,#ffab84,#9dfab0)] opacity-70 blur-xl motion-safe:animate-[spin_14s_linear_infinite] ${busy ? 'opacity-100' : ''}`} />
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_140deg,#9dfab0,#0c5b86,#8bd3ff,#12866f,#9dfab0)] p-[2px] motion-safe:animate-[spin_22s_linear_infinite_reverse]">
        <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.28),transparent_34%),radial-gradient(circle_at_70%_78%,rgba(139,211,255,0.35),transparent_45%),radial-gradient(circle_at_50%_50%,#0e2a24,#050606_72%)]" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <BrandMark size={64} animated />
      </div>
    </div>
  )
}

/* ── Composer ── */

function RewardsStrip({ standing, onOpenWallet, mode }: { standing: RewardStanding | null; onOpenWallet: () => void; mode: ComposerMode }) {
  return (
    <button
      type="button"
      onClick={onOpenWallet}
      className="flex w-full items-center gap-2 px-4 pb-2 pt-2.5 text-left text-[11px] text-white/75 transition-colors hover:text-white"
    >
      <BrandMark size={18} animated />
      <span className="min-w-0 flex-1 truncate">
        {mode === 'motion' ? `Motion by Claude Opus 5.5 · ${SPYDA_MOTION_CREDITS} credits a video · ` : ''}
        Every 1,000 credits you use earns 1 SPYDA
        {standing ? <span className="text-white/50"> · {standing.toNextSpyda.toLocaleString()} credits to your next</span> : null}
      </span>
      {standing ? (
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 font-semibold text-primary sm:inline-flex">
          <Coins className="h-3 w-3" /> {standing.credits.toLocaleString()} credits
        </span>
      ) : null}
    </button>
  )
}

type ComposerProps = {
  draft: string
  setDraft: (value: string) => void
  attachments: PreparedImage[]
  onAttach: (files: File[]) => void
  onRemoveAttachment: (index: number) => void
  onSend: () => void
  busy: boolean
  standing: RewardStanding | null
  onOpenWallet: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  mode: ComposerMode
  onModeChange: (mode: ComposerMode) => void
  format: MotionFormat
  onFormatChange: (format: MotionFormat) => void
}

function Composer({
  draft, setDraft, attachments, onAttach, onRemoveAttachment, onSend, busy, standing, onOpenWallet,
  textareaRef, fileInputRef, mode, onModeChange, format, onFormatChange,
}: ComposerProps) {
  const canSend = !busy && (draft.trim().length > 0 || attachments.length > 0)
  // Speech replaces only what was said since the mic opened, after any typed text.
  const spokenBase = useRef('')
  const speech = useSpeechInput(text => setDraft(`${spokenBase.current}${spokenBase.current && text ? ' ' : ''}${text}`))
  const toggleSpeech = () => {
    if (speech.listening) {
      speech.stop()
      return
    }
    spokenBase.current = draft.trim()
    speech.start()
  }

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(200, element.scrollHeight)}px`
  }, [draft, textareaRef])

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend) onSend()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (files.length) {
      event.preventDefault()
      onAttach(files)
    }
  }

  return (
    <div className="rounded-[26px] border border-primary/20 bg-[linear-gradient(180deg,rgba(18,134,111,0.34),rgba(12,91,134,0.22))] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
      <RewardsStrip standing={standing} onOpenWallet={onOpenWallet} mode={mode} />
      <div className="rounded-[22px] border border-white/[0.06] bg-[#08090a] px-3 pb-3 pt-2.5">
        {attachments.length ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.name}-${index}`} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white/10">
                <img src={attachment.dataUrl} alt={attachment.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(index)}
                  aria-label={`Remove ${attachment.name}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white opacity-90 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <label htmlFor="spyda-chat-input" className="sr-only">Message Spyda</label>
        <textarea
          id="spyda-chat-input"
          ref={textareaRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={speech.listening
            ? 'Listening…'
            : mode === 'motion'
              ? 'Describe the motion: mood, pace, what to highlight…'
              : 'Import a flyer and tell Spyda what to change…'}
          className="block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            aria-label="Import file"
            title="Import file"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.09] bg-surface-raised px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40 sm:px-3.5"
          >
            <Paperclip className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Import file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={event => {
              onAttach([...(event.target.files || [])])
              event.target.value = ''
            }}
          />
          <div role="radiogroup" aria-label="What to make" className="flex h-9 items-center rounded-full border border-white/[0.09] bg-surface-raised p-0.5">
            {([
              { id: 'flyer', label: 'Flyer', icon: ImageIcon },
              { id: 'motion', label: 'Motion', icon: Clapperboard },
            ] as const).map(item => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                onClick={() => onModeChange(item.id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                  mode === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" /> <span className="hidden min-[400px]:inline">{item.label}</span>
              </button>
            ))}
          </div>
          {mode === 'motion' ? (
            <label className="hidden items-center sm:flex">
              <span className="sr-only">Video format</span>
              <select
                value={format}
                onChange={event => onFormatChange(event.target.value as MotionFormat)}
                className="h-9 rounded-full border border-white/[0.09] bg-surface-raised px-3 text-xs font-medium text-foreground outline-none"
              >
                {(Object.keys(MOTION_FORMATS) as MotionFormat[]).map(id => (
                  <option key={id} value={id}>{MOTION_FORMATS[id].name} {MOTION_FORMATS[id].label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="ml-auto" />
          {speech.supported ? (
            <button
              type="button"
              onClick={toggleSpeech}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Stop voice input' : 'Talk instead of typing'}
              title={speech.listening ? 'Stop voice input' : 'Talk instead of typing'}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                speech.listening
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-white/[0.09] bg-surface-raised text-muted-foreground hover:text-foreground'
              }`}
            >
              {speech.listening ? <span className="absolute inset-0 animate-ping rounded-full border border-primary/40" /> : null}
              {speech.listening ? <Square className="h-3.5 w-3.5 [&_path]:fill-current" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { if (speech.listening) speech.stop(); onSend() }}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(157,250,176,0.25)] transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:translate-y-0 disabled:bg-white/10 disabled:text-muted-foreground disabled:shadow-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.4} />}
          </button>
        </div>
        {mode === 'motion' ? (
          <div className="mt-2 flex gap-1.5 sm:hidden" role="radiogroup" aria-label="Video format">
            {(Object.keys(MOTION_FORMATS) as MotionFormat[]).map(id => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={format === id}
                onClick={() => onFormatChange(id)}
                className={`h-8 flex-1 rounded-full text-[11px] font-semibold ${format === id ? 'bg-white text-[#0b1210]' : 'bg-white/[0.05] text-muted-foreground'}`}
              >
                {MOTION_FORMATS[id].name} {MOTION_FORMATS[id].label}
              </button>
            ))}
          </div>
        ) : null}
        {speech.error ? <p className="mt-2 px-1 text-[11px] text-amber-200">{speech.error}</p> : null}
      </div>
    </div>
  )
}

/* ── Messages ── */

function EditCard({ edit, canAfford, onGenerate, onDecline, onOpenWallet, onOpenCanvas }: {
  edit: ChatEdit
  canAfford: boolean
  onGenerate: () => void
  onDecline: () => void
  onOpenWallet: () => void
  onOpenCanvas: (image: string) => void
}) {
  if (edit.status === 'declined') {
    return <p className="mt-3 text-xs text-muted-foreground">Skipped: {edit.summary}</p>
  }

  if (edit.status === 'generating') {
    return (
      <div className="mt-4 w-full max-w-sm overflow-hidden rounded-[22px] border border-primary/20 bg-surface">
        <div className="relative aspect-[4/5] overflow-hidden">
          <img src={edit.sourceImage} alt="" className="h-full w-full object-cover opacity-30 blur-[2px]" />
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent,rgba(157,250,176,0.12),transparent)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Generating your new version</p>
            <p className="px-6 text-xs text-muted-foreground">{edit.summary}</p>
          </div>
        </div>
      </div>
    )
  }

  if (edit.status === 'done' && edit.resultImage) {
    return (
      <div className="mt-4 w-full max-w-sm">
        <div className="group overflow-hidden rounded-[22px] border border-white/10 bg-surface">
          <img src={edit.resultImage} alt={edit.summary} className="w-full transition-transform duration-500 group-hover:scale-[1.02]" />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <a
            href={edit.resultImage}
            download="spyda-version.jpg"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.1] bg-surface-raised px-3.5 text-xs font-semibold transition-colors hover:border-primary/30"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button
            type="button"
            onClick={() => onOpenCanvas(edit.resultImage!)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.1] bg-surface-raised px-3.5 text-xs font-semibold transition-colors hover:border-primary/30"
          >
            <Layers className="h-3.5 w-3.5" /> Edit in canvas
          </button>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-primary" /> {edit.cost} credits used
            {edit.tokensAwarded ? <span className="font-semibold text-primary"> · +{edit.tokensAwarded} SPYDA</span> : null}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 w-full max-w-md rounded-[22px] border border-primary/25 bg-[linear-gradient(160deg,rgba(157,250,176,0.08),rgba(255,255,255,0.01))] p-4">
      <div className="flex items-start gap-3">
        <img src={edit.sourceImage} alt="" className="h-14 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Proposed version</p>
          <p className="mt-1 text-sm font-medium leading-5">{edit.summary}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Uses {edit.cost} credits · counts toward your SPYDA rewards
          </p>
        </div>
      </div>
      {edit.status === 'failed' && edit.error ? (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-red-200">{edit.error}</p>
      ) : null}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {canAfford ? (
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            {edit.status === 'failed' ? <RefreshCw className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
            {edit.status === 'failed' ? 'Try again' : 'Generate version'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenWallet}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            <Coins className="h-3.5 w-3.5" /> Fund wallet to generate
          </button>
        )}
        <button type="button" onClick={onDecline} className="h-9 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
          Not now
        </button>
      </div>
    </div>
  )
}

/** `live` runs the liquid-metal mark; only the newest reply gets it, so a long chat holds one WebGL context, not one per message. */
function MessageRow({ message, live = false, children }: { message: ChatMessage; live?: boolean; children?: React.ReactNode }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {message.images?.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {message.images.map((image, index) => (
                <img key={index} src={image} alt="Your upload" className="max-h-72 max-w-[240px] rounded-[18px] border border-white/10 object-cover" />
              ))}
            </div>
          ) : null}
          {message.text ? (
            <div className="whitespace-pre-wrap rounded-[22px] rounded-br-md bg-surface-raised px-4 py-2.5 text-[14px] leading-6 text-foreground">{message.text}</div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-[#0b1412]">
        <BrandMark size={22} animated={live} />
      </div>
      <div className="min-w-0 flex-1">
        {message.error ? (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-200">{message.text}</p>
        ) : (
          <ChatMarkdown text={message.text} />
        )}
        {children}
      </div>
    </div>
  )
}

function ThinkingRow() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Spyda is thinking">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-[#0b1412]"><BrandMark size={22} animated /></div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(dot => (
          <span key={dot} className="h-2 w-2 rounded-full bg-primary/70 motion-safe:animate-bounce" style={{ animationDelay: `${dot * 140}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ── The view ── */

export default function ChatView({ modelProvider, headerSlot, seed, onOpenWallet }: ChatViewProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState<Conversation>(createConversation)
  const [recent, setRecent] = useState<ConversationSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<PreparedImage[]>([])
  const [thinking, setThinking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [standing, setStanding] = useState<RewardStanding | null>(null)
  const [name, setName] = useState('')
  const [keys, setKeys] = useState<SpydaApiKeys>({ openai: '', groq: '' })
  const [mode, setMode] = useState<ComposerMode>('flyer')
  const [format, setFormat] = useState<MotionFormat>('portrait')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const loaded = useRef(false)

  const byok = Boolean(keys.openai)
  const cost = generationCreditCost(modelProvider, byok)
  const messages = conversation.messages
  const lastReplyIndex = messages.map(message => message.role).lastIndexOf('assistant')
  const flyer = useMemo(() => latestFlyer(messages), [messages])
  const [createOpen, setCreateOpen] = useState(false)

  const refreshStanding = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('profiles')
      .select('display_name, wallet_balance, spyda_token_balance, credits_spent_total')
      .eq('id', user.id)
      .maybeSingle()
    if (!data) return
    setStanding(rewardStandingFrom(data))
    setName(firstName(data.display_name))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    loadSpydaApiKeys(user.id).then(setKeys)
    refreshStanding()
  }, [refreshStanding, user?.id])

  // Reopen the last conversation on this device.
  useEffect(() => {
    let active = true
    listConversations().then(async list => {
      if (!active) return
      setRecent(list)
      const latest = list[0] ? await loadConversation(list[0].id) : null
      if (active && latest && !loaded.current) setConversation(latest)
      loaded.current = true
    })
    return () => { active = false }
  }, [])

  // Persist every change once there is something to keep.
  useEffect(() => {
    if (!conversation.messages.length) return
    const timer = window.setTimeout(() => {
      saveConversation(conversation).then(() => listConversations().then(setRecent))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [conversation])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  const attach = useCallback(async (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/'))
    if (!images.length) {
      setNotice('Import an image file (PNG, JPG or WEBP).')
      return
    }
    try {
      const prepared = await Promise.all(images.slice(0, MAX_ATTACHMENTS).map(file => prepareImage(file)))
      setAttachments(previous => [...previous, ...prepared].slice(0, MAX_ATTACHMENTS))
      setNotice(null)
      textareaRef.current?.focus()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That image could not be opened.')
    }
  }, [])

  // A project, template or brand asset sent here from another view.
  useEffect(() => {
    if (!seed) return
    let active = true
    setConversation(createConversation())
    setDraft(seed.text || '')
    setAttachments([])
    if (seed.image) {
      toJpegDataUrl(seed.image)
        .then(async dataUrl => {
          const size = await imageDimensions(dataUrl)
          if (active) setAttachments([{ dataUrl, width: size?.width || 0, height: size?.height || 0, name: seed.name || 'flyer.jpg' }])
        })
        .catch(() => { if (active) setNotice('That design could not be attached.') })
    }
    textareaRef.current?.focus()
    return () => { active = false }
  }, [seed])

  const updateMessage = useCallback((messageId: string, update: (message: ChatMessage) => ChatMessage) => {
    setConversation(current => ({
      ...current,
      updatedAt: new Date().toISOString(),
      messages: current.messages.map(message => (message.id === messageId ? update(message) : message)),
    }))
  }, [])

  /** Asks Claude for a motion design, or a revision of the last one, under an assistant message. */
  const runMotion = useCallback(async (messageId: string, motion: ChatMotion, previous?: { code: string; runtimeError?: string }) => {
    try {
      // The server charges the motion price before Claude runs and refunds a failure.
      const result = await requestMotion({
        image: motion.sourceImage,
        brief: motion.brief,
        format: motion.format,
        duration: motion.duration,
        previousCode: previous?.code,
        runtimeError: previous?.runtimeError,
      }, await spydaRequestHeaders(keys, 'motion'))
      updateMessage(messageId, current => ({
        ...current,
        motion: { ...current.motion!, status: 'done', title: result.title, code: result.code, tokensAwarded: result.billing?.tokensAwarded || 0, error: undefined },
      }))
    } catch (error) {
      updateMessage(messageId, current => ({
        ...current,
        motion: { ...current.motion!, status: 'failed', error: error instanceof Error ? error.message : 'The motion design could not be made.' },
      }))
    } finally {
      refreshStanding()
    }
  }, [keys, refreshStanding, updateMessage])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (thinking || (!text && !attachments.length)) return

    if (mode === 'motion') {
      const source = attachments[0]?.dataUrl || latestFlyer(conversation.messages)
      if (!source) {
        setNotice('Import a reference design for Claude to animate.')
        fileInputRef.current?.click()
        return
      }
      if (standing && standing.credits < SPYDA_MOTION_CREDITS) {
        setNotice(`A motion design uses ${SPYDA_MOTION_CREDITS} credits and you have ${standing.credits}. Fund your wallet to continue.`)
        return
      }
      // A follow-up without a new picture revises the last motion instead of starting over.
      const previous = attachments.length ? null : latestMotion(conversation.messages)
      const motion: ChatMotion = {
        status: 'generating',
        brief: text,
        format: previous?.format ?? format,
        duration: previous?.duration ?? MOTION_DURATION,
        sourceImage: previous?.sourceImage ?? source,
        cost: SPYDA_MOTION_CREDITS,
      }
      const userMessage: ChatMessage = { id: newId(), role: 'user', text, images: attachments.map(item => item.dataUrl), createdAt: new Date().toISOString() }
      const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', motion, createdAt: new Date().toISOString() }
      setConversation(current => ({
        ...current,
        title: current.messages.length ? current.title : titleFrom(text || 'Motion design', attachments.length > 0),
        flyerName: current.flyerName || (attachments[0] ? attachments[0].name.replace(/\.[a-z0-9]+$/i, '') : undefined),
        updatedAt: new Date().toISOString(),
        messages: [...current.messages, userMessage, reply],
      }))
      setDraft('')
      setAttachments([])
      setNotice(null)
      await runMotion(reply.id, motion, previous?.code ? { code: previous.code } : undefined)
      return
    }

    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      text,
      images: attachments.map(item => item.dataUrl),
      createdAt: new Date().toISOString(),
    }
    const history = [...conversation.messages, userMessage]
    setConversation(current => ({
      ...current,
      title: current.messages.length ? current.title : titleFrom(text, attachments.length > 0),
      flyerName: current.flyerName || (attachments[0] ? attachments[0].name.replace(/\.[a-z0-9]+$/i, '') : undefined),
      updatedAt: new Date().toISOString(),
      messages: [...current.messages, userMessage],
    }))
    setDraft('')
    setAttachments([])
    setNotice(null)
    setThinking(true)

    let reply: ChatMessage
    try {
      const result = await requestReply(history, await spydaRequestHeaders(keys, modelProvider))
      const source = latestFlyer(history)
      reply = {
        id: newId(),
        role: 'assistant',
        text: result.reply,
        createdAt: new Date().toISOString(),
        edit: result.edit && source
          ? { ...result.edit, status: 'proposed', cost, sourceImage: source }
          : undefined,
      }
    } catch (error) {
      reply = {
        id: newId(),
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Spyda could not answer. Try again.',
        createdAt: new Date().toISOString(),
        error: true,
      }
    }
    setConversation(current => ({ ...current, updatedAt: new Date().toISOString(), messages: [...current.messages, reply] }))
    setThinking(false)
  }, [attachments, conversation.messages, cost, draft, format, keys, mode, modelProvider, runMotion, standing, thinking])

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find(message => message.role === 'user')
    if (!lastUser) return
    setConversation(current => ({
      ...current,
      messages: current.messages.slice(0, current.messages.lastIndexOf(lastUser)),
    }))
    setDraft(lastUser.text)
    setAttachments((lastUser.images || []).map((dataUrl, index) => ({ dataUrl, width: 0, height: 0, name: `flyer-${index + 1}.jpg` })))
  }, [messages])

  const generate = useCallback(async (message: ChatMessage) => {
    const edit = message.edit
    if (!edit) return
    updateMessage(message.id, current => ({ ...current, edit: { ...current.edit!, status: 'generating', error: undefined } }))
    try {
      // The server charges the credits before generating and refunds a failure.
      const result = await requestEdit(edit.instruction, edit.sourceImage, await spydaRequestHeaders(keys, modelProvider))
      const resultImage = await toJpegDataUrl(result.image)
      updateMessage(message.id, current => ({
        ...current,
        edit: { ...current.edit!, status: 'done', resultImage, tokensAwarded: result.billing?.tokensAwarded || 0 },
      }))
      refreshStanding()
    } catch (error) {
      refreshStanding()
      updateMessage(message.id, current => ({
        ...current,
        edit: { ...current.edit!, status: 'failed', error: error instanceof Error ? error.message : 'The new version could not be generated.' },
      }))
    }
  }, [keys, modelProvider, refreshStanding, updateMessage])

  /** Canvas mode needs layers, so the first visit analyses the flyer into a project. */
  const openCanvas = useCallback(async (image: string | null = flyer) => {
    if (!image || canvasBusy) return
    const existing = conversation.projectId && conversation.projectSource === image ? readProject(conversation.projectId) : null
    if (existing?.breakdown) {
      navigate(`/editor/${encodeURIComponent(existing.id)}`)
      return
    }

    setCanvasBusy(true)
    setNotice(null)
    try {
      const size = await imageDimensions(image)
      const projectId = newId('spyda')
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await spydaRequestHeaders(keys, modelProvider)) },
        body: JSON.stringify({
          base64Image: image,
          aiProvider: modelProvider,
          sourceMetadata: {
            designId: projectId,
            width: size?.width,
            height: size?.height,
            fileName: `${conversation.title}.jpg`,
            mimeType: 'image/jpeg',
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok || !data.breakdown) throw new Error(data?.error || 'Spyda could not separate this flyer into layers.')

      const now = new Date().toISOString()
      saveProject({
        id: projectId,
        name: conversation.flyerName || (conversation.title === 'New chat' ? 'Spyda flyer' : conversation.title),
        createdAt: now,
        updatedAt: now,
        referencePreview: image,
        generatedImage: null,
        breakdown: data.breakdown,
      })
      setConversation(current => ({ ...current, projectId, projectSource: image }))
      await saveConversation({ ...conversation, projectId, projectSource: image })
      navigate(`/editor/${encodeURIComponent(projectId)}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Canvas mode could not open this flyer.')
    } finally {
      setCanvasBusy(false)
    }
  }, [canvasBusy, conversation, flyer, keys, modelProvider, navigate])

  const startNewChat = () => {
    setConversation(createConversation())
    setDraft('')
    setAttachments([])
    setNotice(null)
    setHistoryOpen(false)
    textareaRef.current?.focus()
  }

  const openConversation = async (id: string) => {
    setHistoryOpen(false)
    const found = await loadConversation(id)
    if (found) setConversation(found)
  }

  const applySuggestion = (prompt: string, nextMode: ComposerMode) => {
    setMode(nextMode)
    setDraft(prompt)
    if (!attachments.length && !flyer) fileInputRef.current?.click()
    else textareaRef.current?.focus()
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    attach([...event.dataTransfer.files])
  }

  const empty = messages.length === 0
  const canAfford = !standing || standing.credits >= cost

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setHistoryOpen(open => !open)}
          aria-expanded={historyOpen}
          aria-label="Recent chats"
          title="Recent chats"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
        </button>
        {historyOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
            <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-white/[0.08] bg-surface-raised p-1.5 shadow-2xl">
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent chats</p>
              {recent.length ? recent.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openConversation(item.id)}
                  className={`block w-full truncate rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.05] ${item.id === conversation.id ? 'text-primary' : 'text-foreground/85'}`}
                >
                  {item.title}
                </button>
              )) : <p className="px-2.5 py-2 text-xs text-muted-foreground">Your chats on this device show up here.</p>}
            </div>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={startNewChat}
        aria-label="New chat"
        title="New chat"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        disabled={canvasBusy}
        title="Create a design in canvas mode"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:bg-white/10 disabled:text-muted-foreground"
      >
        {canvasBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{canvasBusy ? 'Preparing layers…' : 'Canvas mode'}</span>
      </button>
    </div>
  )

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      attachments={attachments}
      onAttach={attach}
      onRemoveAttachment={index => setAttachments(previous => previous.filter((_, itemIndex) => itemIndex !== index))}
      onSend={send}
      busy={thinking}
      standing={standing}
      onOpenWallet={onOpenWallet}
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      mode={mode}
      onModeChange={setMode}
      format={format}
      onFormatChange={setFormat}
    />
  )

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }}
      onDrop={onDrop}
    >
      {headerSlot ? createPortal(headerActions, headerSlot) : null}

      <CreateDesignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        current={flyer ? {
          image: flyer,
          title: conversation.flyerName || (conversation.title === 'New chat' ? 'Your flyer' : conversation.title),
          hasLayers: Boolean(conversation.projectId && conversation.projectSource === flyer && readProject(conversation.projectId)?.breakdown),
        } : null}
        onContinue={() => { void openCanvas() }}
        onMagicLayers={file => {
          prepareImage(file)
            .then(prepared => openCanvas(prepared.dataUrl))
            .catch(error => setNotice(error instanceof Error ? error.message : 'That picture could not be read.'))
        }}
        onChat={nextMode => {
          setMode(nextMode)
          window.setTimeout(() => textareaRef.current?.focus(), 50)
        }}
      />

      {/* The teal floor light from the reference, in Spyda's colours. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(70%_80%_at_50%_100%,rgba(18,134,111,0.32),transparent_70%)]" />

      {dragging ? (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-[28px] border-2 border-dashed border-primary/60 bg-black/60 backdrop-blur-sm">
          <p className="flex items-center gap-2 font-heading text-lg font-semibold"><ImagePlus className="h-5 w-5 text-primary" /> Drop your flyer</p>
        </div>
      ) : null}

      {empty ? (
        // Auto margins centre the welcome when it fits and start it at the top
        // when it does not; justify-center would push the orb out of reach.
        <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-8 pt-8 [scrollbar-width:none] sm:pt-10 [&::-webkit-scrollbar]:hidden">
          <div className="my-auto w-full max-w-2xl text-center">
            <SpydaOrb />
            <h1 className="mt-7 font-heading text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.6rem]">
              <span className="block text-muted-foreground">Hi{name ? `, ${name}` : ''}</span>
              How can I help today?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Import a design you like and tell me what to change. I will make it yours, or animate it with Claude. Every credit you use builds your SPYDA rewards.
            </p>
            <div className="mt-8 text-left">{composer}</div>
            {notice ? <p className="mt-3 text-xs text-red-200">{notice}</p> : null}
            <div className="mt-5 grid gap-3 text-left sm:grid-cols-3">
              {SUGGESTIONS.map(item => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => applySuggestion(item.prompt, item.mode)}
                  className="group rounded-[20px] border border-white/[0.07] bg-surface/90 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold"><item.icon className="h-4 w-4 text-primary" /> {item.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.copy}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-7 pb-6">
              {messages.map((message, index) => (
                <MessageRow key={message.id} message={message} live={!thinking && index === lastReplyIndex}>
                  {message.error && index === messages.length - 1 ? (
                    <button type="button" onClick={retryLast} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
                  ) : null}
                  {message.motion ? (
                    <MotionCard
                      motion={message.motion}
                      onRetry={() => {
                        updateMessage(message.id, current => ({ ...current, motion: { ...current.motion!, status: 'generating', error: undefined } }))
                        runMotion(message.id, { ...message.motion!, status: 'generating' })
                      }}
                      onFix={runtimeError => {
                        const broken = message.motion!
                        const fix: ChatMessage = {
                          id: newId(),
                          role: 'assistant',
                          text: '',
                          createdAt: new Date().toISOString(),
                          motion: { ...broken, status: 'generating', code: undefined, title: undefined, error: undefined, tokensAwarded: undefined },
                        }
                        setConversation(current => ({ ...current, updatedAt: new Date().toISOString(), messages: [...current.messages, fix] }))
                        runMotion(fix.id, fix.motion!, { code: broken.code!, runtimeError })
                      }}
                    />
                  ) : null}
                  {message.edit ? (
                    <EditCard
                      edit={message.edit}
                      canAfford={canAfford}
                      onGenerate={() => generate(message)}
                      onDecline={() => updateMessage(message.id, current => ({ ...current, edit: { ...current.edit!, status: 'declined' } }))}
                      onOpenWallet={onOpenWallet}
                      onOpenCanvas={image => openCanvas(image)}
                    />
                  ) : null}
                </MessageRow>
              ))}
              {thinking ? <ThinkingRow /> : null}
            </div>
          </div>
          <div className="relative px-4 pb-4 pt-2">
            <div className="mx-auto max-w-3xl">
              {notice ? <p className="mb-2 text-xs text-red-200">{notice}</p> : null}
              {composer}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
