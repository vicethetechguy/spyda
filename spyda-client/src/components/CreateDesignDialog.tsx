import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ChevronRight,
  Clapperboard,
  Layers,
  LayoutTemplate,
  FileImage,
  Maximize2,
  Rocket,
  Search,
  Smartphone,
  Sparkles,
  Wand2,
  X,
  type LucideIcon,
} from './ui/icons'
import { blankBreakdown, type CanvasPreset } from '../lib/editor-objects'
import { saveProject } from '../lib/project-store'

/**
 * "Create a design": what Canvas mode opens over the blurred workspace. Search,
 * a category list on the left, quick actions and format cards on the right,
 * and — when the chat already has a flyer — a way to carry that work into the
 * canvas instead of starting blank.
 */

type Art = 'post' | 'story' | 'square' | 'wide' | 'flyer' | 'poster' | 'card' | 'banner' | 'thumbnail' | 'logo' | 'motion'
type Category = 'for-you' | 'social' | 'print' | 'ads' | 'motion' | 'custom'

type Format = CanvasPreset & { category: Exclude<Category, 'for-you' | 'custom' | 'motion'>; art: Art }

const FORMATS: Format[] = [
  { id: 'ig-post', name: 'Instagram post', detail: '4:5 · 1080 × 1350', width: 1080, height: 1350, category: 'social', art: 'post' },
  { id: 'story', name: 'Story or reel', detail: '9:16 · 1080 × 1920', width: 1080, height: 1920, category: 'social', art: 'story' },
  { id: 'square', name: 'Square post', detail: '1:1 · 1080 × 1080', width: 1080, height: 1080, category: 'social', art: 'square' },
  { id: 'fb-post', name: 'Facebook post', detail: '1200 × 630', width: 1200, height: 630, category: 'social', art: 'wide' },
  { id: 'x-post', name: 'X post', detail: '16:9 · 1600 × 900', width: 1600, height: 900, category: 'social', art: 'wide' },
  { id: 'yt-thumb', name: 'YouTube thumbnail', detail: '1280 × 720', width: 1280, height: 720, category: 'social', art: 'thumbnail' },
  { id: 'fb-cover', name: 'Facebook cover', detail: '1640 × 624', width: 1640, height: 624, category: 'social', art: 'banner' },
  { id: 'a4', name: 'A4 flyer', detail: 'Portrait · 1240 × 1754', width: 1240, height: 1754, category: 'print', art: 'flyer' },
  { id: 'a5', name: 'A5 flyer', detail: 'Portrait · 874 × 1240', width: 874, height: 1240, category: 'print', art: 'flyer' },
  { id: 'letter', name: 'US Letter flyer', detail: '8.5 × 11 in · 1275 × 1650', width: 1275, height: 1650, category: 'print', art: 'flyer' },
  { id: 'poster', name: 'Poster', detail: '18 × 24 in · 1800 × 2400', width: 1800, height: 2400, category: 'print', art: 'poster' },
  { id: 'invite', name: 'Invitation', detail: '5 × 7 in · 1500 × 2100', width: 1500, height: 2100, category: 'print', art: 'card' },
  { id: 'biz-card', name: 'Business card', detail: '3.5 × 2 in · 1050 × 600', width: 1050, height: 600, category: 'print', art: 'card' },
  { id: 'web-banner', name: 'Web banner', detail: '16:9 · 1920 × 1080', width: 1920, height: 1080, category: 'ads', art: 'wide' },
  { id: 'leaderboard', name: 'Leaderboard ad', detail: '728 × 90 @2x · 1456 × 180', width: 1456, height: 180, category: 'ads', art: 'banner' },
  { id: 'email-header', name: 'Email header', detail: '1200 × 400', width: 1200, height: 400, category: 'ads', art: 'banner' },
  { id: 'square-ad', name: 'Square ad', detail: '1200 × 1200', width: 1200, height: 1200, category: 'ads', art: 'square' },
  { id: 'logo', name: 'Logo', detail: '1000 × 1000', width: 1000, height: 1000, category: 'ads', art: 'logo' },
]

const FREQUENT = ['ig-post', 'a4', 'story', 'square', 'yt-thumb', 'web-banner', 'poster']
const POPULAR_FLYERS = ['a4', 'letter', 'a5', 'poster', 'invite', 'fb-post', 'leaderboard']

const MOTION: { id: 'portrait' | 'story' | 'square'; name: string; detail: string; width: number; height: number }[] = [
  { id: 'story', name: 'Motion story', detail: '9:16 · animated by Claude', width: 1080, height: 1920 },
  { id: 'portrait', name: 'Motion post', detail: '4:5 · animated by Claude', width: 1080, height: 1350 },
  { id: 'square', name: 'Motion square', detail: '1:1 · animated by Claude', width: 1080, height: 1080 },
]

const CATEGORIES: { id: Category; label: string; icon: LucideIcon; tint: string }[] = [
  { id: 'for-you', label: 'For you', icon: Sparkles, tint: 'text-primary' },
  { id: 'social', label: 'Social media', icon: Smartphone, tint: 'text-[#ff7aa8]' },
  { id: 'print', label: 'Flyers & print', icon: FileImage, tint: 'text-[#8bd3ff]' },
  { id: 'ads', label: 'Banners & ads', icon: Rocket, tint: 'text-[#ffb36b]' },
  { id: 'motion', label: 'Motion designs', icon: Clapperboard, tint: 'text-[#c4a3ff]' },
  { id: 'custom', label: 'Custom size', icon: Maximize2, tint: 'text-foreground/80' },
]

export type CurrentWork = { image: string; title: string; hasLayers: boolean }

type CreateDesignDialogProps = {
  open: boolean
  onClose: () => void
  /** The flyer the person is working on in Spyda AI, if any. */
  current?: CurrentWork | null
  onContinue?: () => void
  /** Upload a flyer and split it into editable layers. */
  onMagicLayers?: (file: File) => void
  /** Hand back to the chat: edit by asking, or animate with Claude. */
  onChat?: (mode: 'flyer' | 'motion') => void
}

function newProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `spyda-${crypto.randomUUID()}`
    : `spyda-${Date.now().toString(36)}`
}

/* ── Card art: a lit frame of the format's shape with a hint of a layout ── */

function FormatArt({ art, width, height }: { art: Art; width: number; height: number }) {
  // Fit the format's true ratio into one box, so every card reads at the same weight.
  const fit = Math.min(128 / width, 92 / height)
  const w = Math.max(28, width * fit)
  const h = Math.max(18, height * fit)
  const accent = { post: '#9dfab0', story: '#ff7aa8', square: '#8bd3ff', wide: '#ffb36b', flyer: '#9dfab0', poster: '#c4a3ff', card: '#ffd36b', banner: '#8bd3ff', thumbnail: '#ff6b6b', logo: '#9dfab0', motion: '#c4a3ff' }[art]

  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {/* the soft offset page behind, like a stacked sheet */}
      <span className="absolute rounded-[6px] bg-white/[0.06]" style={{ width: w, height: h, transform: 'translate(7px, 7px)' }} />
      <span
        className="relative flex flex-col overflow-hidden rounded-[6px] bg-[#f4f6f5] shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03]"
        style={{ width: w, height: h }}
      >
        {art === 'logo' ? (
          <span className="m-auto flex h-1/2 w-1/2 items-center justify-center rounded-full" style={{ background: accent }}>
            <span className="h-1/2 w-1/2 rounded-sm bg-[#0b1210]" />
          </span>
        ) : art === 'banner' ? (
          <span className="flex h-full items-center gap-[6%] px-[6%]">
            <span className="h-[56%] w-[16%] shrink-0 rounded-sm" style={{ background: accent }} />
            <span className="flex flex-1 flex-col gap-[3px]">
              <span className="h-[5px] w-3/4 rounded-full bg-[#0b1210]/80" />
              <span className="h-[3px] w-1/2 rounded-full bg-[#0b1210]/30" />
            </span>
          </span>
        ) : (
          <>
            <span className="relative flex-[1.3]" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}88)` }}>
              {art === 'motion' || art === 'thumbnail' ? (
                <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55">
                  <span className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
                </span>
              ) : (
                <span className="absolute bottom-[12%] right-[12%] h-[34%] w-[34%] rounded-full bg-white/45" />
              )}
            </span>
            <span className="flex flex-1 flex-col justify-center gap-[3px] px-[10%]">
              <span className="h-[5px] w-4/5 rounded-full bg-[#0b1210]/80" />
              <span className="h-[3px] w-3/5 rounded-full bg-[#0b1210]/30" />
              {h > 60 ? <span className="mt-[3px] h-[7px] w-2/5 rounded-full" style={{ background: accent }} /> : null}
            </span>
          </>
        )}
      </span>
    </span>
  )
}

function FormatCard({ name, detail, art, width, height, onClick }: { name: string; detail: string; art: Art; width: number; height: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group w-[178px] shrink-0 snap-start text-left sm:w-[188px]">
      <span className="flex h-[132px] w-full items-center justify-center rounded-[14px] bg-[#17191c] ring-1 ring-white/[0.05] transition-colors group-hover:bg-[#1c1f22] group-hover:ring-primary/30 group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <FormatArt art={art} width={width} height={height} />
      </span>
      <span className="mt-2.5 block truncate text-[14px] text-foreground">{name}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
    </button>
  )
}

/** A horizontal row of cards with a round arrow, scrolling a page at a time. */
function Carousel({ title, children }: { title: string; children: React.ReactNode }) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const update = () => {
    const row = rowRef.current
    if (!row) return
    setEdges({ start: row.scrollLeft < 4, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 4 })
  }
  useEffect(update, [])
  const page = (direction: 1 | -1) => rowRef.current?.scrollBy({ left: direction * (rowRef.current.clientWidth - 60), behavior: 'smooth' })

  return (
    <section className="mt-9">
      <h3 className="font-heading text-[18px] font-semibold">{title}</h3>
      <div className="relative mt-4">
        <div ref={rowRef} onScroll={update} className="flex snap-x gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {!edges.start ? (
          <button type="button" onClick={() => page(-1)} aria-label={`Scroll ${title} back`} className="absolute left-0 top-[66px] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#202226] text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.45)] transition-colors hover:bg-[#2a2d31]">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
        ) : null}
        {!edges.end ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0f1012] to-transparent" />
            <button type="button" onClick={() => page(1)} aria-label={`Scroll ${title} forward`} className="absolute right-0 top-[66px] flex h-10 w-10 -translate-y-1/2 translate-x-1/3 items-center justify-center rounded-full border border-white/10 bg-[#202226] text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.45)] transition-colors hover:bg-[#2a2d31]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}

function QuickAction({ label, icon: Icon, gradient, onClick }: { label: string; icon: LucideIcon; gradient: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-[84px] shrink-0 flex-col items-center gap-2 text-center">
      <span className={`flex h-[60px] w-[60px] items-center justify-center rounded-full shadow-[0_8px_20px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 ${gradient}`}>
        <Icon className="h-6 w-6 text-white drop-shadow" strokeWidth={1.8} />
      </span>
      <span className="text-[12px] leading-4 text-foreground/80 group-hover:text-foreground">{label}</span>
    </button>
  )
}

export default function CreateDesignDialog({ open, onClose, current, onContinue, onMagicLayers, onChat }: CreateDesignDialogProps) {
  const navigate = useNavigate()
  const [category, setCategory] = useState<Category>('for-you')
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState({ width: '1080', height: '1350' })
  const searchRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    const timer = window.setTimeout(() => searchRef.current?.focus(), 60)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose, open])

  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (!words.length) return null
    return FORMATS.filter(format => {
      const text = `${format.name} ${format.detail} ${format.category} ${format.category === 'print' ? 'flyer print' : ''}`.toLowerCase()
      return words.every(word => text.includes(word))
    })
  }, [query])

  if (!open) return null

  const start = (preset: CanvasPreset) => {
    const id = newProjectId()
    const now = new Date().toISOString()
    saveProject({
      id,
      name: `Untitled ${preset.name.toLowerCase()}`,
      createdAt: now,
      updatedAt: now,
      referencePreview: null,
      generatedImage: null,
      breakdown: blankBreakdown(preset),
    })
    onClose()
    navigate(`/editor/${encodeURIComponent(id)}`)
  }
  const byId = (id: string) => FORMATS.find(format => format.id === id)!
  const card = (format: Format) => <FormatCard key={format.id} {...format} onClick={() => start(format)} />
  const toChat = (mode: 'flyer' | 'motion') => { onClose(); onChat?.(mode) }

  const customWidth = Math.round(Number(custom.width))
  const customHeight = Math.round(Number(custom.height))
  const customValid = customWidth >= 100 && customHeight >= 100 && customWidth <= 8000 && customHeight <= 8000

  const grid = (formats: Format[]) => (
    <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-6">
      {formats.map(format => <FormatCard key={format.id} {...format} onClick={() => start(format)} />)}
    </div>
  )

  const customPanel = (
    <section className="mt-2 max-w-md">
      <h3 className="font-heading text-[18px] font-semibold">Custom size</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">Any size from 100 to 8000 pixels on each side.</p>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        {(['width', 'height'] as const).map((side, index) => (
          <label key={side} className={index === 1 ? 'col-start-3' : ''}>
            <span className="text-[12px] font-medium capitalize text-muted-foreground">{side}</span>
            <span className="mt-1.5 flex h-11 items-center rounded-xl border border-white/[0.1] bg-[#17191c] px-3 focus-within:border-primary/60">
              <input
                inputMode="numeric"
                value={custom[side]}
                onChange={event => setCustom(currentSize => ({ ...currentSize, [side]: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                onKeyDown={event => { if (event.key === 'Enter' && customValid) start({ id: 'custom', name: 'Custom design', detail: '', width: customWidth, height: customHeight }) }}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                aria-label={`${side} in pixels`}
              />
              <span className="text-[12px] text-muted-foreground">px</span>
            </span>
          </label>
        )).flatMap((field, index) => (index === 0 ? [field, <span key="x" className="pb-3 text-muted-foreground">×</span>] : [field]))}
      </div>
      <button
        type="button"
        disabled={!customValid}
        onClick={() => start({ id: 'custom', name: 'Custom design', detail: '', width: customWidth, height: customHeight })}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.99] disabled:opacity-40"
      >
        Create new design <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  )

  const motionRow = MOTION.map(item => (
    <FormatCard key={item.id} name={item.name} detail={item.detail} art="motion" width={item.width} height={item.height} onClick={() => toChat('motion')} />
  ))

  const forYou = (
    <>
      {current ? (
        <section>
          <h3 className="font-heading text-[18px] font-semibold">Continue your current work</h3>
          <button
            type="button"
            onClick={() => { onClose(); onContinue?.() }}
            className="group mt-4 flex w-full items-center gap-4 rounded-[18px] border border-primary/25 bg-[linear-gradient(120deg,rgba(157,250,176,0.10),rgba(18,134,111,0.06)_45%,rgba(255,255,255,0.02))] p-3 text-left transition-colors hover:border-primary/50 sm:gap-5 sm:p-4"
          >
            <img src={current.image} alt="" className="h-[92px] w-[74px] shrink-0 rounded-[10px] object-cover ring-1 ring-white/10 sm:h-[108px] sm:w-[86px]" />
            <span className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">From Spyda AI</span>
              <span className="mt-1 block truncate font-heading text-[17px] font-semibold">{current.title}</span>
              <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
                {current.hasLayers ? 'Its layers are ready. Pick up where you left off.' : 'Spyda splits it into editable layers, then opens it on the canvas.'}
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5 sm:inline-flex">
              Open in canvas <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </section>
      ) : null}

      <section className={current ? 'mt-9' : ''}>
        <h3 className="font-heading text-[18px] font-semibold">Quick actions</h3>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {onMagicLayers ? <QuickAction label="Magic Layers" icon={Layers} gradient="bg-[linear-gradient(140deg,#9dfab0,#12866f)]" onClick={() => fileRef.current?.click()} /> : null}
          <QuickAction label="Blank canvas" icon={LayoutTemplate} gradient="bg-[linear-gradient(140deg,#8bd3ff,#2a5bd7)]" onClick={() => start(byId('ig-post'))} />
          <QuickAction label="Custom size" icon={Maximize2} gradient="bg-[linear-gradient(140deg,#ffd36b,#e0762b)]" onClick={() => setCategory('custom')} />
          {onChat ? <QuickAction label="Make it yours" icon={Wand2} gradient="bg-[linear-gradient(140deg,#ff9ac0,#c2185b)]" onClick={() => toChat('flyer')} /> : null}
          {onChat ? <QuickAction label="Animate it" icon={Clapperboard} gradient="bg-[linear-gradient(140deg,#c4a3ff,#5b34d6)]" onClick={() => toChat('motion')} /> : null}
        </div>
      </section>

      <Carousel title="Frequently used">{FREQUENT.map(id => card(byId(id)))}</Carousel>
      <Carousel title="Popular for flyers">{POPULAR_FLYERS.map(id => card(byId(id)))}</Carousel>
      {onChat ? <Carousel title="Motion design with Claude">{motionRow}</Carousel> : null}
    </>
  )

  const heading = CATEGORIES.find(item => item.id === category)?.label
  const body = results
    ? (
      <section>
        <h3 className="font-heading text-[18px] font-semibold">{results.length ? `Results for “${query.trim()}”` : `Nothing matches “${query.trim()}”`}</h3>
        {results.length ? grid(results) : (
          <button type="button" onClick={() => { setQuery(''); setCategory('custom') }} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-[13px] text-foreground/90 hover:border-primary/40">
            <Maximize2 className="h-4 w-4 text-primary" /> Make a custom size instead
          </button>
        )}
      </section>
    )
    : category === 'for-you' ? forYou
      : category === 'custom' ? customPanel
        : category === 'motion'
          ? (
            <section>
              <h3 className="font-heading text-[18px] font-semibold">{heading}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Claude Opus 5.5 animates your flyer in Spyda AI. Pick a shape and say what should move.</p>
              <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-6">{motionRow}</div>
            </section>
          )
          : (
            <section>
              <h3 className="font-heading text-[18px] font-semibold">{heading}</h3>
              {grid(FORMATS.filter(format => format.category === category))}
            </section>
          )

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-0 backdrop-blur-md sm:p-6 lg:p-10" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file && onMagicLayers) { onClose(); onMagicLayers(file) }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-design-title"
        className="relative flex h-full w-full max-w-[1260px] flex-col overflow-hidden bg-[#0f1012] text-foreground shadow-[0_40px_120px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.07] sm:h-[min(88vh,760px)] sm:rounded-[28px] md:flex-row"
      >
        {/* Left: title and categories */}
        <aside className="flex shrink-0 flex-col border-white/[0.06] px-4 pb-2 pt-5 md:w-[290px] md:border-r md:px-7 md:pb-6 md:pt-9">
          <div className="flex items-center justify-between">
            <h2 id="create-design-title" className="font-heading text-[26px] font-semibold tracking-[-0.02em] md:text-[32px]">Create a design</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-foreground md:hidden">
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav aria-label="Design types" className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] md:mx-0 md:mt-7 md:flex-col md:overflow-visible [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map(item => {
              const active = !results && category === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setQuery(''); setCategory(item.id) }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[14px] transition-colors md:h-11 ${active ? 'bg-primary/[0.12] font-medium text-foreground' : 'text-foreground/80 hover:bg-white/[0.05] hover:text-foreground'}`}
                >
                  <item.icon className={`h-[18px] w-[18px] ${item.tint}`} strokeWidth={1.8} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <p className="mt-auto hidden text-[12px] leading-5 text-muted-foreground md:block">
            Every design opens in canvas mode, with Spyda AI beside it.
          </p>
        </aside>

        {/* Right: search and content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pb-2 pt-2 md:px-9 md:pt-9">
            <label className="flex h-12 items-center gap-3 rounded-xl border border-white/[0.12] bg-[#141518] px-4 transition-colors focus-within:border-primary/70 focus-within:shadow-[0_0_0_3px_rgba(157,250,176,0.12)]">
              <Search className="h-[18px] w-[18px] text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="What would you like to create?"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                aria-label="Search design types"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              ) : null}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6 md:px-9">
            {body}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 hidden h-11 w-11 items-center justify-center rounded-full bg-white text-[#0b1210] shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 md:flex lg:right-5 lg:top-5"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

