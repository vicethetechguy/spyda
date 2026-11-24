import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clapperboard, Copy, Download, ImagePlus, Layers, Loader2, LogOut, Maximize2, Palette, Pause, Play, Plus, Redo2, Sparkles, Trash2, Type, Undo2, Upload, Wand2, X,
  ListCheck, Store, Transition, Zap,
} from '../components/ui/icons'
import SpydaSelect from '../components/ui/SpydaSelect'
import { useDownload } from '../components/DownloadProvider'
import WindowControls from '../components/editor/WindowControls'
import {
  EFFECTS, IDENTITY_TRANSFORM, NEUTRAL_GRADE, TRANSITIONS, VideoRenderer,
  type ClipFit, type ClipLayer, type ClipTransform, type EffectId, type Grade, type TransitionId,
} from '../lib/video/renderer'
import {
  CLIP_MOTIONS, FORMATS, TITLE_DEFAULTS, activeAt, audioFade, clipLength, clipOpacity, clipTransformAt, formatFor, formatTime, layout, makeClip, makeTitle,
  newId, sourceTime, splitAt, titleFrame,
  splitAudioAt, type AudioTrackItem, type Clip, type ClipMotion, type MediaItem, type Placed, type Title, type TitleAnimation, type VideoProject,
} from '../lib/video/timeline'
import { BUNDLED_FAMILIES, loadFontPreviews, previewFamily } from '../lib/fonts'
import { renderSoundEffects } from '../lib/video/sound-effects'
import SellDesignDialog from '../components/marketplace/SellDesignDialog'
import PageBar from '../components/video/PageBar'
import { PAGE_KEYS, type StudioPage } from '../lib/video/studio-pages'
import MediaPage from '../components/video/MediaPage'
import ExportPage, { type ExportRecord, type ExportRequest } from '../components/video/ExportPage'
import {
  VIDEO_PROJECTS_EVENT, blankVideoProject, currentVideoProjectId, deleteVideoProject, forgetMediaFile, listVideoProjects,
  loadMediaFile, readVideoProject, saveVideoProject, setCurrentVideoProject, storeMediaFile, type SavedVideoProject,
} from '../lib/video/video-projects'
import { decodePackage, encodePackage, type PackageFile } from '../lib/design-package'
import { deleteAsset, getAssetBlob } from '../lib/asset-store'

/** What a video project package carries besides the media files. */
type VideoPackageData = {
  format: string
  fps: number
  quality: string
  project: VideoProject
  media: Array<{ key: string; name: string; kind: MediaItem['kind']; sfx?: boolean }>
}

/**
 * Spyda's video editor: import clips, cut them on a timeline, frame and move
 * them, grade them (exposure to hue), add effects, transitions, titles and
 * music, and export an MP4 (WebM where MP4 is unavailable) with sound.
 * Rendering runs on the GPU, so preview and export look the same.
 */

type Selection = { kind: 'clip' | 'title' | 'audio' | 'transition'; id: string } | null
const transportButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground'
const toolButton = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium leading-none transition-colors hover:bg-white/[0.08] disabled:opacity-40'

/** Matching playback icons, drawn on the same grid so they line up. */
function TransportGlyph({ name }: { name: 'start' | 'back' | 'forward' | 'end' }) {
  const paths = {
    start: <><path d="M6 6v12" /><path d="M18 6.5v11a.6.6 0 0 1-.92.5L9.5 12.5a.6.6 0 0 1 0-1l7.58-5.5a.6.6 0 0 1 .92.5Z" fill="currentColor" stroke="none" /></>,
    back: <path d="M14.5 6.5 9 12l5.5 5.5" />,
    forward: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
    end: <><path d="M18 6v12" /><path d="M6 6.5v11a.6.6 0 0 0 .92.5l7.58-5.5a.6.6 0 0 0 0-1L6.92 6a.6.6 0 0 0-.92.5Z" fill="currentColor" stroke="none" /></>,
  }
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

/** A small waveform drawing for a sound effect card, the same for the same name. */
function SoundWave({ seed }: { seed: string }) {
  let value = [...seed].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0
  const bars = Array.from({ length: 22 }, () => { value = (value * 1103515245 + 12345) >>> 0; return 0.2 + ((value >>> 8) % 100) / 125 })
  return (
    <span className="flex h-full items-center justify-center gap-[2px] bg-[radial-gradient(circle_at_50%_40%,rgba(124,199,255,0.18),transparent_70%)] px-3" aria-hidden="true">
      {bars.map((height, index) => <span key={index} className="w-[3px] rounded-full bg-[#7cc7ff]/80" style={{ height: `${height * 60}%` }} />)}
    </span>
  )
}

type LeftTab = 'media' | 'timeline' | 'effects' | 'transitions' | 'titles'
type MediaFilter = 'all' | 'video' | 'image' | 'audio' | 'sfx' | 'unused'
type AudioLane = 'music' | 'sfx'
type Format = (typeof FORMATS)[number]

/** Drag payloads inside the editor. */
const MEDIA_MIME = 'application/x-spyda-media'
const CLIP_MIME = 'application/x-spyda-clip'

const MIN_ZOOM = 2
const MAX_ZOOM = 400
const TRACK_HEAD = 92
/** Space before 0:00 and after the end, shared by the timeline and its scrubber so both start in line. */
const GUTTER = 12

const GRADE_CONTROLS: Array<{ key: keyof Grade; label: string; min: number; max: number; step: number }> = [
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01 },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01 },
  { key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01 },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.01 },
  { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.01 },
  { key: 'tint', label: 'Tint', min: -1, max: 1, step: 0.01 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 1, step: 0.01 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01 },
]

const GRADE_PRESETS: Array<{ name: string; grade: Partial<Grade> }> = [
  { name: 'Natural', grade: {} },
  { name: 'Punchy', grade: { contrast: 0.25, saturation: 0.2, vibrance: 0.3, shadows: -0.1 } },
  { name: 'Warm sunset', grade: { temperature: 0.55, tint: 0.1, exposure: 0.1, highlights: -0.15, vignette: 0.3 } },
  { name: 'Cool night', grade: { temperature: -0.55, exposure: -0.2, contrast: 0.15, saturation: -0.15, vignette: 0.35 } },
  { name: 'Moody', grade: { exposure: -0.3, contrast: 0.3, saturation: -0.3, shadows: -0.2, fade: 0.15, vignette: 0.45 } },
  { name: 'Bright & airy', grade: { exposure: 0.35, contrast: -0.15, highlights: -0.2, shadows: 0.25, saturation: -0.05, fade: 0.1 } },
  { name: 'Matte film', grade: { contrast: -0.1, fade: 0.3, saturation: -0.2, temperature: 0.1 } },
  { name: 'Neon pop', grade: { saturation: 0.45, vibrance: 0.4, contrast: 0.2, hue: -8 } },
]

const TITLE_PRESETS: Array<{ name: string; patch: Partial<Title> }> = [
  { name: 'Big title', patch: { text: 'Big title', size: 0.13, y: 0.5, weight: 800, animation: 'pop' } },
  { name: 'Lower third', patch: { text: 'Name Surname\nRole · Company', size: 0.045, y: 0.82, x: 0.3, background: true, animation: 'slide', weight: 600, align: 'left', paragraphSpacing: 0.15 } },
  { name: 'Caption', patch: { text: 'Say it in a caption', size: 0.055, y: 0.88, background: true, animation: 'fade', weight: 600 } },
  { name: 'Typewriter', patch: { text: 'Typed out, letter by letter', size: 0.06, y: 0.5, animation: 'typewriter', font: 'Space Grotesk', weight: 500 } },
  { name: 'Zoom headline', patch: { text: 'GRAND OPENING', size: 0.11, y: 0.42, animation: 'zoom', font: 'Bebas Neue', weight: 400, color: '#9DFAB0', letterSpacing: 0.06 } },
  { name: 'Outlined', patch: { text: 'BOLD MOVE', size: 0.12, y: 0.5, weight: 800, animation: 'rise', color: '#FFFFFF', outlineColor: '#7C3AED', outlineWidth: 0.06, uppercase: true } },
]

const TITLE_ANIMATIONS: TitleAnimation[] = ['fade', 'rise', 'pop', 'slide', 'zoom', 'typewriter']
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const QUALITIES = [
  { value: 'standard', label: 'Standard', bits: 0.5 },
  { value: 'high', label: 'High', bits: 1 },
  { value: 'max', label: 'Maximum', bits: 2 },
] as const
const FRAME_RATES = [24, 30, 60] as const
const FITS: Array<{ id: ClipFit; name: string }> = [
  { id: 'contain', name: 'Fit inside' },
  { id: 'blur', name: 'Blur fill' },
  { id: 'cover', name: 'Fill frame' },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function Slider({ label, value, min, max, step, onChange, format, reset }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; format?: (value: number) => string; reset?: number }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="w-[72px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} onDoubleClick={() => onChange(reset ?? (min < 0 ? 0 : min))} className="min-w-0 flex-1 accent-[#9dfab0]" aria-label={label} />
      <span className="w-10 text-right font-mono text-foreground/80">{format ? format(value) : Math.round(value * 100) / 100}</span>
    </label>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Toggle({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={`flex h-7 min-w-7 flex-1 items-center justify-center rounded px-1.5 text-[11px] transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>
      {children}
    </button>
  )
}

function ScissorsGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5 20 18M8.5 16.5 20 6" />
    </svg>
  )
}

function readMedia(file: File): Promise<MediaItem> {
  const url = URL.createObjectURL(file)
  const kind: MediaItem['kind'] = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image'
  const base = { id: newId('media'), name: file.name.replace(/\.[a-z0-9]+$/i, ''), kind, url }
  return new Promise((resolve, reject) => {
    if (kind === 'image') {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * image.naturalHeight / image.naturalWidth))
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve({ ...base, duration: 4, width: image.naturalWidth, height: image.naturalHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.7) })
      }
      image.onerror = () => reject(new Error(`${file.name} could not be opened.`))
      image.src = url
      return
    }
    const element = document.createElement(kind === 'video' ? 'video' : 'audio') as HTMLVideoElement
    element.preload = 'auto'
    element.muted = true
    element.src = url
    element.onerror = () => reject(new Error(`${file.name} could not be opened.`))
    element.onloadedmetadata = async () => {
      // Recordings (MediaRecorder WebM, some phone exports) report no duration
      // until the end is sought once.
      if (!Number.isFinite(element.duration)) {
        await new Promise<void>(done => {
          const check = () => { if (Number.isFinite(element.duration)) { element.removeEventListener('durationchange', check); element.removeEventListener('timeupdate', check); done() } }
          element.addEventListener('durationchange', check)
          element.addEventListener('timeupdate', check)
          window.setTimeout(done, 4000)
          element.currentTime = 1e7
        })
      }
      const duration = Number.isFinite(element.duration) ? element.duration : 0
      if (!duration) { reject(new Error(`${file.name} has no readable length.`)); return }
      if (kind === 'audio') { resolve({ ...base, duration, width: 0, height: 0, thumbnail: null }); return }
      element.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * element.videoHeight / Math.max(1, element.videoWidth)))
        canvas.getContext('2d')!.drawImage(element, 0, 0, canvas.width, canvas.height)
        resolve({ ...base, duration, width: element.videoWidth, height: element.videoHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.7) })
      }
      element.currentTime = Math.min(0.5, duration / 3)
    }
  })
}

function waitSeek(element: HTMLMediaElement, time: number) {
  if (Math.abs(element.currentTime - time) < 0.02 && element.readyState >= 2) return Promise.resolve()
  return new Promise<void>(resolve => {
    const done = () => { element.removeEventListener('seeked', done); resolve() }
    element.addEventListener('seeked', done)
    window.setTimeout(done, 700)
    element.currentTime = time
  })
}

/** Word-wraps each paragraph of `text` at `width` with the context's current font. */
function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const out: Array<{ text: string; paragraph: number }> = []
  text.split('\n').forEach((paragraph, index) => {
    const words = paragraph.split(/(\s+)/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line + word
      if (line.trim() && context.measureText(candidate.trimEnd()).width > width) {
        out.push({ text: line.trimEnd(), paragraph: index })
        line = word.trimStart()
      } else line = candidate
    }
    out.push({ text: line.trimEnd(), paragraph: index })
  })
  return out
}

/** Draws a title onto the output at its frame of animation. */
function drawTitle(context: CanvasRenderingContext2D, raw: Title, t: number, W: number, H: number) {
  const title = { ...TITLE_DEFAULTS, ...raw }
  const frame = titleFrame(title, t)
  if (!frame || frame.opacity <= 0.001) return
  const size = title.size * H * frame.scale
  context.save()
  context.globalAlpha = frame.opacity
  context.font = `${title.italic ? 'italic ' : ''}${title.weight} ${size}px "${title.font}", sans-serif`
  ;(context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${title.letterSpacing * size}px`
  context.textBaseline = 'middle'
  const text = title.uppercase ? title.text.toUpperCase() : title.text
  const lines = wrapText(context, text, Math.max(size * 2, title.maxWidth * W))
  // Typewriter: reveal characters across the wrapped lines.
  let budget = Math.ceil(text.replace(/\n/g, '').length * frame.reveal)
  const shown = lines.map(line => { const part = line.text.slice(0, Math.max(0, budget)); budget -= line.text.length; return { ...line, text: part } })
  const lineGap = size * title.lineHeight
  const paragraphGap = size * title.paragraphSpacing
  const paragraphs = lines.length ? lines[lines.length - 1].paragraph : 0
  const height = lines.length * lineGap + paragraphs * paragraphGap
  const widest = Math.max(1, ...lines.map(line => context.measureText(line.text).width))
  const cx = (title.x + frame.dx) * W, cy = (title.y + frame.dy) * H
  const padX = size * 0.45, padY = size * 0.25
  // Keep the block (and its pill) inside a small safe margin of the frame.
  const margin = W * 0.04 + (title.background ? padX : 0)
  const left = widest + margin * 2 <= W ? clamp(cx - widest / 2, margin, W - margin - widest) : cx - widest / 2
  if (title.background) {
    context.fillStyle = title.backgroundColor
    context.globalAlpha = frame.opacity * 0.62
    context.beginPath()
    context.roundRect(left - padX, cy - height / 2 - padY, widest + padX * 2, height + padY * 2, size * 0.3)
    context.fill()
    context.globalAlpha = frame.opacity
  }
  context.textAlign = title.align
  const anchor = title.align === 'left' ? left : title.align === 'right' ? left + widest : cx
  let y = cy - height / 2 + lineGap / 2
  shown.forEach((line, index) => {
    if (index > 0 && line.paragraph !== shown[index - 1].paragraph) y += paragraphGap
    if (title.outlineWidth > 0) {
      context.save()
      context.strokeStyle = title.outlineColor
      context.lineWidth = title.outlineWidth * size * 2
      context.lineJoin = 'round'
      context.strokeText(line.text, anchor, y)
      context.restore()
    }
    if (title.shadow) { context.shadowColor = 'rgba(0,0,0,0.45)'; context.shadowBlur = size * 0.15; context.shadowOffsetY = size * 0.03 }
    context.fillStyle = title.color
    context.fillText(line.text, anchor, y)
    context.shadowColor = 'transparent'
    y += lineGap
  })
  context.restore()
}

/**
 * The timeline's scrollbar, as a mini-map: the whole edit in miniature (clips
 * in green, music in amber, the playhead in pink) under a glowing Spyda-green
 * lens showing the part in view. Drag the lens to scroll; click to jump.
 */
function TimelineScrubber({ scroller, left, view, content, lane, zoom, time, placed, music }: {
  scroller: { current: HTMLDivElement | null }
  left: number
  view: number
  content: number
  /** Width of the timeline itself (without its gutters): the mini-map's scale. */
  lane: number
  zoom: number
  time: number
  placed: Placed[]
  music: AudioTrackItem[]
}) {
  const track = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const node = track.current
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    setWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])
  const span = Math.max(1, lane)
  const range = Math.max(0, content - view)
  const lens = Math.min(width, Math.max(44, (view / Math.max(1, content)) * width))
  const travel = Math.max(1, width - lens)
  const x = range > 0 ? (left / range) * travel : 0
  const at = (seconds: number) => `${((seconds * zoom) / span) * 100}%`

  const grab = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const node = scroller.current
    if (!node || range <= 0) return
    const x0 = event.clientX, start = node.scrollLeft
    setDragging(true)
    const move = (moveEvent: PointerEvent) => { node.scrollLeft = start + ((moveEvent.clientX - x0) * range) / travel }
    const up = () => { setDragging(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const jump = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scroller.current
    if (!node || range <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    node.scrollTo({ left: ((event.clientX - rect.left - lens / 2) / travel) * range, behavior: 'smooth' })
  }

  return (
    <div className="shrink-0 pb-2 pt-1" style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
      <div
        ref={track}
        role="scrollbar"
        aria-label="Scroll the timeline"
        aria-orientation="horizontal"
        aria-controls="spyda-timeline"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={range > 0 ? Math.round((left / range) * 100) : 0}
        onPointerDown={jump}
        className="group relative h-3.5 cursor-pointer rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.05))] ring-1 ring-inset ring-white/[0.06]"
      >
        {/* The edit in miniature */}
        {placed.map(item => <span key={item.clip.id} className="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#9dfab0]/30" style={{ left: at(item.start), width: `max(2px, ${at(item.length)})` }} />)}
        {music.map(item => <span key={item.id} className="pointer-events-none absolute bottom-[2px] h-[2px] rounded-full bg-[#ffb36b]/40" style={{ left: at(item.start), width: `max(2px, ${at(item.out - item.in)})` }} />)}
        <span className="pointer-events-none absolute inset-y-[2px] w-[2px] rounded-full bg-[#ff4fd8] shadow-[0_0_6px_#ff4fd8]" style={{ left: at(time) }} />
        {/* The lens over the part in view */}
        <div
          onPointerDown={grab}
          className={`absolute inset-y-0 flex items-center justify-center gap-[3px] rounded-full border border-[#c9ffd5]/60 bg-[linear-gradient(180deg,rgba(157,250,176,0.42),rgba(61,220,151,0.22))] shadow-[0_0_14px_rgba(157,250,176,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-[1px] transition-[box-shadow,transform,opacity] duration-200 ${range > 0 ? 'cursor-grab active:cursor-grabbing' : 'opacity-60'} ${dragging ? 'scale-y-[1.25] shadow-[0_0_22px_rgba(157,250,176,0.6),inset_0_1px_0_rgba(255,255,255,0.4)]' : 'group-hover:scale-y-[1.15]'}`}
          style={{ left: x, width: lens }}
        >
          {[0, 1, 2].map(index => <span key={index} className="h-[6px] w-[2px] rounded-full bg-[#0b1210]/55" />)}
        </div>
      </div>
    </div>
  )
}

/** A readable tick spacing for the ruler at `zoom` pixels per second. */
function tickStep(zoom: number) {
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(step => step * zoom >= 64) ?? 600
}

function VideoStudio({ projectId, onOpenProject, onNewProject }: { projectId: string; onOpenProject: (id: string) => void; onNewProject: () => void }) {
  const navigate = useNavigate()
  const download = useDownload()
  // The saved project this studio opened (a blank one when it is new).
  const [initial] = useState<SavedVideoProject>(() => readVideoProject(projectId) ?? { ...blankVideoProject(), id: projectId })
  const [format, setFormat] = useState<Format>(() => FORMATS.find(item => item.id === initial.format) ?? FORMATS[0])
  const [project, setProject] = useState<VideoProject>(initial.project)
  const [projectName, setProjectName] = useState(initial.name)
  const [folders, setFolders] = useState<string[]>(initial.folders ?? [])
  const [page, setPage] = useState<StudioPage>(() => (initial.project.clips.length ? 'edit' : 'media'))
  const [loaded, setLoaded] = useState(false)
  const [projects, setProjects] = useState<SavedVideoProject[]>(() => listVideoProjects())
  const [exportsDone, setExportsDone] = useState<ExportRecord[]>([])
  const [cover, setCover] = useState<string | null>(initial.cover ?? null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<LeftTab>('media')
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const previewAudio = useRef<HTMLAudioElement | null>(null)
  const [mediaQuery, setMediaQuery] = useState('')
  const [zoomState, setZoomState] = useState<{ fit: boolean; value: number }>({ fit: true, value: 60 })
  const [viewWidth, setViewWidth] = useState(900)
  const [exporting, setExporting] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [dropMarker, setDropMarker] = useState<{ track: 'video' | AudioLane; x: number } | null>(null)
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]['value']>(() => QUALITIES.find(item => item.value === initial.quality)?.value ?? 'high')
  const [fps, setFps] = useState<(typeof FRAME_RATES)[number]>(() => FRAME_RATES.find(rate => rate === initial.fps) ?? 30)
  const [, setHistoryTick] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const outputRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const glCanvas = useRef<HTMLCanvasElement | null>(null)
  const renderer = useRef<VideoRenderer | null>(null)
  const elements = useRef(new Map<string, HTMLVideoElement | HTMLImageElement>())
  const musicElements = useRef(new Map<string, HTMLAudioElement>())
  const audio = useRef<{ context: AudioContext; recorder: MediaStreamAudioDestinationNode; gains: Map<HTMLMediaElement, GainNode> } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const lastSeek = useRef(new WeakMap<HTMLMediaElement, number>())
  const clock = useRef({ startedAt: 0, from: 0 })
  const history = useRef({ past: [] as VideoProject[], future: [] as VideoProject[], key: '', at: 0 })
  const pendingScroll = useRef<number | null>(null)
  const dragIndex = useRef<number | null>(null)
  const trimming = useRef(false)
  const projectRef = useRef(project)
  projectRef.current = project
  const mediaRef = useRef(media)
  mediaRef.current = media
  const timeRef = useRef(time)
  timeRef.current = time

  const { placed, total } = useMemo(() => layout(project.clips), [project.clips])
  const placedRef = useRef(placed)
  placedRef.current = placed
  const end = Math.max(total, ...project.titles.map(title => title.start + title.duration), ...project.audio.map(item => item.start + item.out - item.in), 0)
  // The timeline fits the whole edit by default; Shift/Ctrl + wheel (or the slider) zooms.
  const lane = Math.max(100, viewWidth - GUTTER * 2)
  const zoom = zoomState.fit ? clamp((lane * 0.94) / Math.max(end, 8), MIN_ZOOM, MAX_ZOOM) : zoomState.value
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  /* ── history (undo / redo) ───────────────────────────────────────── */

  /** Every edit goes through here. Edits with the same `key` in quick succession (a slider drag) are one undo step. */
  const change = useCallback((update: (current: VideoProject) => VideoProject, key = '') => {
    const current = projectRef.current
    const next = update(current)
    if (next === current) return
    const memory = history.current
    const now = performance.now()
    if (!(key && key === memory.key && now - memory.at < 900)) {
      memory.past.push(current)
      if (memory.past.length > 200) memory.past.shift()
    }
    memory.key = key
    memory.at = now
    memory.future = []
    projectRef.current = next
    setProject(next)
    setHistoryTick(n => n + 1)
  }, [])

  const undo = useCallback(() => {
    const memory = history.current
    const previous = memory.past.pop()
    if (!previous) return
    const current = projectRef.current
    memory.future.push(current)
    memory.key = ''
    const next = { ...previous, width: current.width, height: current.height }
    projectRef.current = next
    setProject(next)
    setHistoryTick(n => n + 1)
  }, [])

  const redo = useCallback(() => {
    const memory = history.current
    const following = memory.future.pop()
    if (!following) return
    const current = projectRef.current
    memory.past.push(current)
    memory.key = ''
    const next = { ...following, width: current.width, height: current.height }
    projectRef.current = next
    setProject(next)
    setHistoryTick(n => n + 1)
  }, [])

  /* ── canvas and renderer ─────────────────────────────────────────── */

  useEffect(() => {
    const canvas = document.createElement('canvas')
    glCanvas.current = canvas
    try { renderer.current = new VideoRenderer(canvas) } catch (error) { setNotice(error instanceof Error ? error.message : 'The video renderer could not start.') }
    const clipElements = elements.current
    const music = musicElements.current
    return () => {
      for (const element of clipElements.values()) if (element instanceof HTMLVideoElement) { element.pause(); element.removeAttribute('src'); element.load() }
      for (const element of music.values()) { element.pause(); element.removeAttribute('src') }
      void audio.current?.context.close()
    }
  }, [])

  useEffect(() => {
    setProject(current => ({ ...current, width: format.width, height: format.height }))
    if (glCanvas.current) { glCanvas.current.width = format.width; glCanvas.current.height = format.height }
    if (outputRef.current) { outputRef.current.width = format.width; outputRef.current.height = format.height }
  }, [format])

  // Leaving with unsaved work asks first: the editor keeps media in memory only.
  useEffect(() => {
    if (!project.clips.length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [project.clips.length])

  // The timeline's visible width, for fitting the edit into view.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const observer = new ResizeObserver(() => setViewWidth(scroller.clientWidth))
    observer.observe(scroller)
    setViewWidth(scroller.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Zooming keeps the moment under the cursor in place.
  useLayoutEffect(() => {
    if (pendingScroll.current == null || !scrollerRef.current) return
    scrollerRef.current.scrollLeft = Math.max(0, pendingScroll.current)
    pendingScroll.current = null
  }, [zoom])

  // Shift or Ctrl/⌘ + wheel zooms the timeline; the plain wheel scrolls it sideways.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const x = event.clientX - scroller.getBoundingClientRect().left
        const at = Math.max(0, (scroller.scrollLeft + x - GUTTER) / zoomRef.current)
        const next = clamp(zoomRef.current * Math.exp(-delta * 0.0025), MIN_ZOOM, MAX_ZOOM)
        pendingScroll.current = at * next + GUTTER - x
        setZoomState({ fit: false, value: next })
      } else if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault()
        scroller.scrollLeft += event.deltaY
      }
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor: number) => {
    const scroller = scrollerRef.current
    const x = scroller ? scroller.clientWidth / 2 : 0
    const at = Math.max(0, ((scroller?.scrollLeft ?? 0) + x - GUTTER) / zoom)
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM)
    pendingScroll.current = at * next + GUTTER - x
    setZoomState({ fit: false, value: next })
  }

  /* ── media elements and sound ────────────────────────────────────── */

  const mediaFor = useCallback((clip: Clip) => mediaRef.current.find(item => item.id === clip.mediaId), [])

  const elementFor = useCallback((clip: Clip) => {
    let element = elements.current.get(clip.id)
    const item = mediaFor(clip)
    if (!item) return null
    if (!element) {
      if (item.kind === 'image') {
        const image = new Image()
        image.src = item.url
        element = image
      } else {
        const video = document.createElement('video')
        video.src = item.url
        video.preload = 'auto'
        video.playsInline = true
        video.crossOrigin = 'anonymous'
        element = video
      }
      elements.current.set(clip.id, element)
    }
    return element
  }, [mediaFor])

  /** Sound goes through WebAudio, so the export can record it as well as play it. */
  const route = useCallback((element: HTMLMediaElement, volume: number) => {
    if (!audio.current) {
      const context = new AudioContext()
      audio.current = { context, recorder: context.createMediaStreamDestination(), gains: new Map() }
    }
    const graph = audio.current
    let gain = graph.gains.get(element)
    if (!gain) {
      const source = graph.context.createMediaElementSource(element)
      gain = graph.context.createGain()
      source.connect(gain)
      gain.connect(graph.context.destination)
      gain.connect(graph.recorder)
      graph.gains.set(element, gain)
    }
    gain.gain.value = volume
    if (graph.context.state === 'suspended') void graph.context.resume()
  }, [])

  /* ── drawing a frame ─────────────────────────────────────────────── */

  const draw = useCallback((t: number) => {
    const output = outputRef.current
    const gl = renderer.current
    if (!output || !gl || !glCanvas.current) return
    const { a, b, progress } = activeAt(placedRef.current, t)
    const layerOf = (item: Placed): ClipLayer | null => {
      const element = elementFor(item.clip)
      const info = mediaFor(item.clip)
      if (!element || !info) return null
      if (element instanceof HTMLVideoElement && element.readyState < 2) return null
      if (element instanceof HTMLImageElement && !element.complete) return null
      return {
        source: element,
        width: element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth,
        height: element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight,
        fit: item.clip.fit,
        grade: item.clip.grade,
        effect: item.clip.effect,
        amount: item.clip.amount,
        time: t - item.start,
        transform: clipTransformAt(item, t),
        opacity: clipOpacity(item, t),
      }
    }
    const la = a ? layerOf(a) : null
    const lb = b ? layerOf(b) : null
    // A clip still decoding (just seeked) keeps the last good frame rather than flashing black.
    if (!(a && !la)) gl.draw(la, la && lb ? lb : null, a?.clip.transition.type ?? 'cut', progress)
    const context = output.getContext('2d')!
    context.drawImage(glCanvas.current, 0, 0, output.width, output.height)
    for (const title of projectRef.current.titles) drawTitle(context, title, t, output.width, output.height)
  }, [elementFor, mediaFor])

  /** Puts every element at the right moment for `t`, playing or still. */
  const sync = useCallback(async (t: number, play: boolean) => {
    const list = placedRef.current
    const { a, b } = activeAt(list, t)
    const active = new Set([a?.clip.id, b?.clip.id].filter(Boolean) as string[])
    const waits: Promise<void>[] = []
    for (const item of list) {
      const element = elementFor(item.clip)
      if (!(element instanceof HTMLVideoElement)) continue
      if (!active.has(item.clip.id)) { if (!element.paused) element.pause(); continue }
      const target = sourceTime(item, t)
      element.playbackRate = item.clip.speed
      route(element, item.clip.muted ? 0 : item.clip.volume * clipOpacity(item, t))
      if (play) {
        // Re-sync only on real drift, and not again while the last seek settles.
        const now = performance.now()
        if (Math.abs(element.currentTime - target) > 0.3 && now - (lastSeek.current.get(element) ?? 0) > 1000) {
          lastSeek.current.set(element, now)
          element.currentTime = target
        }
        if (element.paused) void element.play().catch(() => undefined)
      } else {
        if (!element.paused) element.pause()
        waits.push(waitSeek(element, target))
      }
    }
    for (const track of projectRef.current.audio) {
      const item = mediaRef.current.find(entry => entry.id === track.mediaId)
      if (!item) continue
      let element = musicElements.current.get(track.id)
      if (!element) { element = new Audio(item.url); element.crossOrigin = 'anonymous'; musicElements.current.set(track.id, element) }
      const local = t - track.start
      const on = local >= 0 && local < track.out - track.in
      if (!on) { if (!element.paused) element.pause(); continue }
      route(element, track.volume * audioFade(track, local))
      const target = track.in + local
      if (play) {
        if (Math.abs(element.currentTime - target) > 0.3) element.currentTime = target
        if (element.paused) void element.play().catch(() => undefined)
      } else {
        if (!element.paused) element.pause()
        element.currentTime = target
      }
    }
    if (waits.length) await Promise.all(waits)
  }, [elementFor, route])

  /* ── the clock ───────────────────────────────────────────────────── */

  const stop = useCallback(() => {
    setPlaying(false)
    for (const element of elements.current.values()) if (element instanceof HTMLVideoElement) element.pause()
    for (const element of musicElements.current.values()) element.pause()
  }, [])

  const play = useCallback(() => {
    if (!placedRef.current.length) return
    const from = timeRef.current >= end - 0.05 ? 0 : timeRef.current
    clock.current = { startedAt: performance.now(), from }
    setPlaying(true)
    void sync(from, true)
  }, [end, sync])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const t = clock.current.from + (performance.now() - clock.current.startedAt) / 1000
      if (t >= end) {
        setTime(end)
        stop()
        draw(end - 0.001)
        return
      }
      setTime(t)
      void sync(t, true)
      draw(t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [draw, end, playing, stop, sync])

  // Still: every change of time or of the project redraws the exact frame.
  useEffect(() => {
    if (playing || exporting != null) return
    let cancelled = false
    void sync(time, false).then(() => { if (!cancelled) draw(time) })
    return () => { cancelled = true }
  }, [draw, exporting, playing, project, sync, time, media])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!playing || !scroller) return
    const x = GUTTER + time * zoom
    if (x > scroller.scrollLeft + scroller.clientWidth - 40 || x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - 80)
  }, [playing, time, zoom])

  const seek = useCallback((t: number) => {
    const next = Math.max(0, Math.min(end, t))
    if (playing) clock.current = { startedAt: performance.now(), from: next }
    setTime(next)
  }, [end, playing])

  /* ── editing ─────────────────────────────────────────────────────── */

  const updateClip = (id: string, patch: Partial<Clip> | ((clip: Clip) => Partial<Clip>), key?: string) => change(current => ({
    ...current,
    clips: current.clips.map(clip => (clip.id === id ? { ...clip, ...(typeof patch === 'function' ? patch(clip) : patch) } : clip)),
  }), key ?? `clip:${id}:${typeof patch === 'function' ? 'fn' : Object.keys(patch).join(',')}`)
  const updateTitle = (id: string, patch: Partial<Title>, key?: string) => change(current => ({ ...current, titles: current.titles.map(title => (title.id === id ? { ...title, ...patch } : title)) }), key ?? `title:${id}:${Object.keys(patch).join(',')}`)
  const updateAudio = (id: string, patch: Partial<AudioTrackItem>, key?: string) => change(current => ({ ...current, audio: current.audio.map(item => (item.id === id ? { ...item, ...patch } : item)) }), key ?? `audio:${id}:${Object.keys(patch).join(',')}`)
  const updateTransform = (clip: Clip, patch: Partial<ClipTransform>, key?: string) => updateClip(clip.id, current => ({ transform: { ...IDENTITY_TRANSFORM, ...current.transform, ...patch } }), key ?? `clip:${clip.id}:transform:${Object.keys(patch).join(',')}`)

  /** Places footage on the timeline (at `index`, else the end); music goes on the music track at `at`. */
  const placeMedia = useCallback((item: MediaItem, options: { index?: number; at?: number; lane?: AudioLane } = {}) => {
    if (item.kind === 'audio') {
      const lane: AudioLane = options.lane ?? (item.sfx ? 'sfx' : 'music')
      const track: AudioTrackItem = { id: newId('audio'), mediaId: item.id, start: Math.max(0, options.at ?? 0), volume: item.sfx ? 1 : 0.8, in: 0, out: item.duration, fadeIn: 0, fadeOut: 0, lane }
      change(current => ({ ...current, audio: [...current.audio, track] }))
      setSelection({ kind: 'audio', id: track.id })
      return
    }
    // The first footage sets the project's shape, so nothing is cropped or boxed in.
    if (!projectRef.current.clips.length && item.width && item.height) {
      const best = formatFor(item.width, item.height)
      if (best.id !== format.id) {
        setFormat(best)
        setNotice(`Matched the size to your ${item.kind === 'image' ? 'picture' : 'video'} (${best.name.split(' · ')[0]}). Change it in the size menu.`)
      }
    }
    const clip = makeClip(item)
    change(current => {
      const clips = [...current.clips]
      clips.splice(clamp(options.index ?? clips.length, 0, clips.length), 0, clip)
      return { ...current, clips }
    })
    setSelection({ kind: 'clip', id: clip.id })
  }, [change, format.id])

  // Spyda's own sound effects sit in the media library beside imported files.
  useEffect(() => {
    let cancelled = false
    void renderSoundEffects().then(async effects => {
      const items: MediaItem[] = []
      for (const { effect, file } of effects) {
        if (mediaRef.current.some(item => item.sfx && item.name === effect.name)) continue
        try { items.push({ ...(await readMedia(file)), id: `sfx-${effect.id}`, sfx: true }) } catch { /* skip one that will not decode */ }
      }
      if (cancelled) { for (const item of items) URL.revokeObjectURL(item.url); return }
      mediaRef.current = [...mediaRef.current, ...items]
      setMedia(mediaRef.current)
    })
    return () => { cancelled = true }
  }, [])

  // The project's own files come back from this device's storage.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const items: MediaItem[] = []
      let missing = 0
      for (const meta of initial.media) {
        if (meta.sfx) continue
        const blob = await loadMediaFile(meta.id).catch(() => undefined)
        if (!blob) { missing += 1; continue }
        items.push({ ...meta, url: URL.createObjectURL(blob) })
      }
      if (cancelled) { for (const item of items) URL.revokeObjectURL(item.url); return }
      mediaRef.current = [...items, ...mediaRef.current.filter(item => !items.some(entry => entry.id === item.id))]
      setMedia(mediaRef.current)
      setLoaded(true)
      if (missing) setNotice(`${missing} ${missing === 1 ? 'file' : 'files'} of this project are no longer on this device. Import ${missing === 1 ? 'it' : 'them'} again to fill the gaps.`)
    })()
    return () => { cancelled = true }
    // Loads once, for the project this studio opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapshot = useCallback((): SavedVideoProject => ({
    id: projectId,
    name: projectName.trim() || 'Untitled video',
    createdAt: initial.createdAt,
    updatedAt: new Date().toISOString(),
    format: format.id,
    fps,
    quality,
    project,
    media: media.filter(item => !item.sfx).map(({ url: _url, ...rest }) => rest),
    folders,
    cover: media.find(item => item.id === project.clips[0]?.mediaId)?.thumbnail ?? cover ?? null,
  }), [cover, folders, format.id, fps, initial.createdAt, media, project, projectId, projectName, quality])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved')
  useEffect(() => {
    if (!loaded) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      const ok = saveVideoProject(snapshotRef.current())
      setSaveState(ok ? 'saved' : 'failed')
      if (ok) setCurrentVideoProject(projectId)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [loaded, snapshot, projectId])
  // Leaving the page saves straight away, not after the delay.
  useEffect(() => {
    const flush = () => { if (loaded) saveVideoProject(snapshotRef.current()) }
    window.addEventListener('beforeunload', flush)
    return () => { window.removeEventListener('beforeunload', flush); flush() }
  }, [loaded])
  useEffect(() => {
    const refresh = () => setProjects(listVideoProjects())
    window.addEventListener(VIDEO_PROJECTS_EVENT, refresh)
    return () => window.removeEventListener(VIDEO_PROJECTS_EVENT, refresh)
  }, [])

  const updateMedia = (id: string, patch: Partial<MediaItem>) => {
    mediaRef.current = mediaRef.current.map(item => (item.id === id ? { ...item, ...patch } : item))
    setMedia(mediaRef.current)
  }

  const previewSound = (item: MediaItem) => {
    previewAudio.current?.pause()
    if (previewing === item.id) { setPreviewing(null); return }
    const audio = new Audio(item.url)
    previewAudio.current = audio
    setPreviewing(item.id)
    audio.onended = () => setPreviewing(current => (current === item.id ? null : current))
    void audio.play().catch(() => setPreviewing(null))
  }

  const importFiles = async (files: File[], place?: { index?: number; at?: number }) => {
    const usable = files.filter(file => /^(video|image|audio)\//.test(file.type))
    if (!usable.length) { setNotice('Add video (MP4, WebM, MOV), image or audio files.'); return }
    setImporting(true)
    let index = place?.index
    try {
      for (const file of usable) {
        const item = { ...(await readMedia(file)), size: file.size, addedAt: new Date().toISOString() }
        void storeMediaFile(item.id, file).catch(() => setNotice('This device is out of space: the file is in the edit but will not be there after a refresh.'))
        mediaRef.current = [...mediaRef.current, item]
        setMedia(mediaRef.current)
        if (place) {
          placeMedia(item, { index, at: place.at })
          if (index != null && item.kind !== 'audio') index += 1
        } else if (item.kind !== 'audio' && !projectRef.current.clips.length) {
          // The first footage goes straight onto the timeline, so there is something to edit at once.
          placeMedia(item)
        }
      }
      if (!place) setNotice(current => current?.startsWith('Matched') ? current : null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be opened.')
    } finally {
      setImporting(false)
    }
  }

  const removeSelected = () => {
    if (!selection) return
    if (selection.kind === 'clip' || selection.kind === 'transition') {
      if (selection.kind === 'transition') { updateClip(selection.id, { transition: { type: 'cut', duration: 0 } }); setSelection(null); return }
      change(current => ({ ...current, clips: current.clips.filter(clip => clip.id !== selection.id) }))
    }
    if (selection.kind === 'title') change(current => ({ ...current, titles: current.titles.filter(title => title.id !== selection.id) }))
    if (selection.kind === 'audio') {
      musicElements.current.get(selection.id)?.pause()
      change(current => ({ ...current, audio: current.audio.filter(item => item.id !== selection.id) }))
    }
    setSelection(null)
  }

  /** Splits the selected music or sound effect at the playhead, else the clip there, else music there. */
  const split = () => {
    const splitAudio = (item: AudioTrackItem) => {
      const parts = splitAudioAt(item, time, () => newId('audio'))
      if (!parts) return false
      change(current => {
        const index = current.audio.findIndex(entry => entry.id === item.id)
        if (index < 0) return current
        const audio = [...current.audio]
        audio.splice(index, 1, ...parts)
        return { ...current, audio }
      })
      setSelection({ kind: 'audio', id: parts[1].id })
      return true
    }
    if (selection?.kind === 'audio') {
      const item = project.audio.find(entry => entry.id === selection.id)
      if (item && splitAudio(item)) return
      setNotice('Move the playhead inside the selected music to split it.')
      return
    }
    const next = splitAt(project.clips, time)
    if (next) { change(current => ({ ...current, clips: next })); return }
    const under = project.audio.find(item => time > item.start && time < item.start + item.out - item.in)
    if (under && splitAudio(under)) return
    setNotice('Move the playhead inside a clip or music to split it.')
  }

  const duplicateSelected = () => {
    if (selection?.kind === 'clip') {
      const copyId = newId('clip')
      change(current => {
        const index = current.clips.findIndex(clip => clip.id === selection.id)
        if (index < 0) return current
        const clips = [...current.clips]
        clips.splice(index + 1, 0, { ...structuredClone(current.clips[index]), id: copyId })
        return { ...current, clips }
      })
      setSelection({ kind: 'clip', id: copyId })
    } else if (selection?.kind === 'title') {
      const source = project.titles.find(title => title.id === selection.id)
      if (!source) return
      const copy = { ...structuredClone(source), id: newId('title'), start: source.start + source.duration }
      change(current => ({ ...current, titles: [...current.titles, copy] }))
      setSelection({ kind: 'title', id: copy.id })
    }
  }

  const moveClip = (from: number, to: number) => change(current => {
    if (to < 0 || to >= current.clips.length || from === to) return current
    const clips = [...current.clips]
    const [moved] = clips.splice(from, 1)
    clips.splice(to, 0, moved)
    return { ...current, clips }
  })

  const addTitle = (patch: Partial<Title> = {}) => {
    const title = { ...makeTitle(time, project.width, project.height), ...patch }
    change(current => ({ ...current, titles: [...current.titles, title] }))
    setSelection({ kind: 'title', id: title.id })
  }

  const selectedClip = selection?.kind === 'clip' || selection?.kind === 'transition' ? project.clips.find(clip => clip.id === selection.id) ?? null : null
  const selectedTitle = selection?.kind === 'title' ? project.titles.find(title => title.id === selection.id) ?? null : null
  const selectedAudio = selection?.kind === 'audio' ? project.audio.find(item => item.id === selection.id) ?? null : null
  const target = selectedClip ?? (placed.length ? activeAt(placed, time).a?.clip ?? null : null)

  /* ── export ──────────────────────────────────────────────────────── */

  const [sellOpen, setSellOpen] = useState(false)

  /** The cover buyers see: the frame under the playhead (the first frame if it is at the end). */
  const makeVideoCover = async () => {
    const output = outputRef.current
    if (!output) throw new Error('The preview is not ready yet.')
    if (time >= end - 0.05) await seek(Math.min(0.5, end / 2))
    return new Promise<Blob>((resolve, reject) => output.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The cover could not be made.'))), 'image/jpeg', 0.88))
  }

  /** The whole edit and only the media it uses, as one Spyda design file. */
  const makeVideoPackage = async () => {
    const current = projectRef.current
    const used = new Set([...current.clips.map(clip => clip.mediaId), ...current.audio.map(track => track.mediaId)])
    const items = mediaRef.current.filter(item => used.has(item.id))
    const files: PackageFile[] = []
    for (const item of items) {
      const blob = await fetch(item.url).then(response => response.blob())
      files.push({ key: item.id, name: item.name, type: blob.type || (item.kind === 'audio' ? 'audio/wav' : item.kind === 'image' ? 'image/png' : 'video/mp4'), blob })
    }
    const data: VideoPackageData = {
      format: format.id, fps, quality, project: current,
      media: items.map(item => ({ key: item.id, name: item.name, kind: item.kind, sfx: item.sfx })),
    }
    return encodePackage({ kind: 'video', name: 'Spyda video project', data, files })
  }

  // A project bought on the marketplace arrives as `/video?open=<key>`.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('open')
    if (!key) return
    let cancelled = false
    void (async () => {
      try {
        setImporting(true)
        const blob = await getAssetBlob(key)
        if (!blob) throw new Error('That project is no longer on this device. Open it again from the marketplace.')
        const pkg = await decodePackage(blob)
        if (pkg.kind !== 'video') throw new Error('That design is a flyer. It opens in the canvas.')
        const data = pkg.data as VideoPackageData
        const ids = new Map<string, string>()
        const added: MediaItem[] = []
        for (const file of pkg.files) {
          const meta = data.media.find(item => item.key === file.key)
          const existing = meta?.sfx ? mediaRef.current.find(item => item.sfx && item.name === meta.name) : undefined
          if (existing) { ids.set(file.key, existing.id); continue }
          const item = await readMedia(new File([file.blob], `${meta?.name ?? file.name}.${(file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '')}`, { type: file.type }))
          const named = { ...item, name: meta?.name ?? item.name, sfx: meta?.sfx, size: file.blob.size, addedAt: new Date().toISOString() }
          if (!named.sfx) void storeMediaFile(named.id, file.blob).catch(() => undefined)
          ids.set(file.key, named.id)
          added.push(named)
        }
        if (cancelled) return
        mediaRef.current = [...mediaRef.current, ...added]
        setMedia(mediaRef.current)
        const remap = (id: string) => ids.get(id) ?? id
        const next: VideoProject = {
          ...data.project,
          clips: data.project.clips.map(clip => ({ ...clip, mediaId: remap(clip.mediaId) })),
          audio: data.project.audio.map(track => ({ ...track, mediaId: remap(track.mediaId) })),
        }
        const nextFormat = FORMATS.find(item => item.id === data.format)
        if (nextFormat) setFormat(nextFormat)
        if (FRAME_RATES.includes(data.fps as (typeof FRAME_RATES)[number])) setFps(data.fps as (typeof FRAME_RATES)[number])
        const nextQuality = QUALITIES.find(item => item.value === data.quality)
        if (nextQuality) setQuality(nextQuality.value)
        history.current = { past: [], future: [], key: '', at: 0 }
        projectRef.current = next
        setProject(next)
        setProjectName('Marketplace project')
        setPage('edit')
        setLoaded(true)
        setNotice('Opened your copy of this project. It is saved on this device: edit anything, then export.')
        void deleteAsset(key)
        navigate('/video', { replace: true })
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : 'That project could not be opened.')
      } finally {
        if (!cancelled) setImporting(false)
      }
    })()
    return () => { cancelled = true }
    // Runs once, when the editor opens with a project to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveFrame = () => {
    const output = outputRef.current
    if (!output) return
    void download({
      name: `spyda-frame-${formatTime(time).replace(/[:.]/g, '-')}.png`,
      kind: 'image',
      title: 'Download this frame',
      produce: () => new Promise<Blob>((resolve, reject) => output.toBlob(blob => (blob ? resolve(blob) : reject(new Error('This frame could not be saved.'))), 'image/png')),
    })
  }

  const goToPage = (next: StudioPage) => {
    if (next === 'photo') {
      saveVideoProject(snapshotRef.current())
      let back = '/editor/new'
      try { back = window.sessionStorage.getItem('spyda.lastCanvas') || back } catch { /* storage off */ }
      navigate(back)
      return
    }
    if (next !== 'edit' && playing) stop()
    if (next === 'export') {
      const output = outputRef.current
      try { if (output && placed.length) setCover(output.toDataURL('image/jpeg', 0.7)) } catch { /* the frame stays the last one */ }
    }
    setPage(next)
  }

  const exportVideo = async (request: ExportRequest = { from: 0, to: end, name: projectName }) => {
    const output = outputRef.current
    if (!output || !placed.length || exporting != null) return
    const from = Math.max(0, Math.min(request.from, end))
    const to = Math.max(from + 0.1, Math.min(request.to, end))
    const length = to - from
    const fileBase = request.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || `spyda-video-${format.id}`
    if (typeof MediaRecorder === 'undefined') { setNotice('This browser cannot record video. Try Chrome or Edge.'); return }
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(candidate => MediaRecorder.isTypeSupported(candidate))
    if (!type) { setNotice('This browser cannot record video.'); return }
    // The download card records the edit, compresses it when asked, then charges for it.
    const saved = await download({
      name: `${fileBase}.${type.includes('mp4') ? 'mp4' : 'webm'}`,
      kind: 'video',
      title: 'Download your video',
      produce: async report => {
        stop()
        setSelection(null)
        setExporting(0)
        try {
          // Make sure the sound graph exists before recording starts.
          for (const item of placed) { const element = elementFor(item.clip); if (element instanceof HTMLVideoElement) route(element, item.clip.muted ? 0 : item.clip.volume) }
          await sync(from, false)
          draw(from)
          const stream = output.captureStream(fps)
          const recorderAudio = audio.current?.recorder.stream.getAudioTracks() ?? []
          for (const track of recorderAudio) stream.addTrack(track)
          const bits = QUALITIES.find(item => item.value === quality)?.bits ?? 1
          const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(project.width * project.height * fps * 0.27 * bits) })
          const chunks: Blob[] = []
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
          const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
          recorder.start(250)
          const startedAt = performance.now()
          await sync(from, true)
          await new Promise<void>(resolve => {
            const frame = () => {
              const t = from + (performance.now() - startedAt) / 1000
              if (t >= to) { resolve(); return }
              void sync(t, true)
              draw(t)
              const done = (t - from) / length
              setExporting(done)
              report(done, 'Rendering your video…')
              setTime(t)
              requestAnimationFrame(frame)
            }
            requestAnimationFrame(frame)
          })
          recorder.stop()
          await finished
          for (const track of recorderAudio) stream.removeTrack(track)
          const result = new Blob(chunks, { type: type.split(';')[0] })
          const megabytes = result.size / 1024 / 1024
          setExportsDone(current => [{ name: `${fileBase}.${type.includes('mp4') ? 'mp4' : 'webm'}`, length, size: megabytes < 1 ? `${Math.max(1, Math.round(result.size / 1024))} KB` : `${megabytes.toFixed(1)} MB`, at: new Date().toISOString() }, ...current].slice(0, 8))
          return result
        } finally {
          stop()
          setExporting(null)
        }
      },
    })
    if (saved) setNotice(`Exported a ${formatTime(length)} video at ${project.width} × ${project.height}, ${fps} fps.`)
  }

  /* ── keyboard ────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement | null)?.tagName ?? '') || (event.target as HTMLElement | null)?.getAttribute('role') === 'combobox'
      if (typing || exporting != null) return
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && /^Digit[1-7]$/.test(event.code)) {
        const next = PAGE_KEYS[event.code.slice(5)]
        if (next) { event.preventDefault(); goToPage(next) }
        return
      }
      if (page !== 'edit') return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (mod && key === 'y') { event.preventDefault(); redo(); return }
      if (mod && key === 'd') { event.preventDefault(); duplicateSelected(); return }
      if (mod) return
      if (event.key === ' ') { event.preventDefault(); if (playing) stop(); else play() }
      if (key === 's') { event.preventDefault(); split() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); seek(timeRef.current - (event.shiftKey ? 1 : 1 / 30)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); seek(timeRef.current + (event.shiftKey ? 1 : 1 / 30)) }
      if (event.key === 'Home') { event.preventDefault(); seek(0) }
      if (event.key === 'End') { event.preventDefault(); seek(end) }
      if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomBy(1.4) }
      if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(1 / 1.4) }
      if (event.key === '\\') { event.preventDefault(); setZoomState(current => ({ ...current, fit: true })) }
      if (event.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ── timeline dragging (trim edges, move titles and music) ────────── */

  /** Snaps a time to the playhead and clip, title and music edges within a few pixels. */
  const snap = (value: number, ignore?: string) => {
    const points = [0, time, ...placed.flatMap(item => [item.start, item.end]), ...project.titles.filter(title => title.id !== ignore).flatMap(title => [title.start, title.start + title.duration]), ...project.audio.filter(item => item.id !== ignore).flatMap(item => [item.start, item.start + item.out - item.in])]
    let best = value
    let distance = 8 / zoom
    for (const point of points) if (Math.abs(point - value) < distance) { best = point; distance = Math.abs(point - value) }
    return best
  }

  const dragStart = (event: ReactPointerEvent, apply: (dx: number) => void, key: string) => {
    event.preventDefault()
    event.stopPropagation()
    const x0 = event.clientX
    history.current.key = ''
    const move = (moveEvent: PointerEvent) => apply((moveEvent.clientX - x0) / zoomRef.current)
    const up = () => {
      trimming.current = false
      history.current.key = ''
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    void key
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const trimClip = (event: ReactPointerEvent, clip: Clip, side: 'in' | 'out') => {
    trimming.current = true
    const info = mediaFor(clip)
    const start = { in: clip.in, out: clip.out }
    const limit = info?.kind === 'image' ? 600 : info?.duration ?? clip.out
    dragStart(event, dx => {
      const delta = dx * clip.speed
      if (side === 'in') updateClip(clip.id, { in: Math.min(start.out - 0.2, Math.max(0, start.in + delta)) }, `trim:${clip.id}`)
      else updateClip(clip.id, { out: Math.max(start.in + 0.2, Math.min(limit, start.out + delta)) }, `trim:${clip.id}`)
    }, `trim:${clip.id}`)
  }

  const trimAudio = (event: ReactPointerEvent, track: AudioTrackItem, side: 'in' | 'out') => {
    const info = media.find(item => item.id === track.mediaId)
    const start = { in: track.in, out: track.out, at: track.start }
    dragStart(event, dx => {
      if (side === 'in') {
        const next = clamp(start.in + dx, 0, start.out - 0.3)
        updateAudio(track.id, { in: next, start: Math.max(0, start.at + (next - start.in)) }, `trim:${track.id}`)
      } else updateAudio(track.id, { out: clamp(start.out + dx, start.in + 0.3, info?.duration ?? start.out) }, `trim:${track.id}`)
    }, `trim:${track.id}`)
  }

  /** Where a drop at timeline time `t` lands among the clips. */
  const insertIndex = (t: number) => placed.filter(item => (item.start + item.end) / 2 < t).length

  const trackTime = (event: ReactDragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.max(0, (event.clientX - rect.left) / zoom)
  }

  const acceptsDrop = (event: ReactDragEvent) => {
    const types = [...event.dataTransfer.types]
    return types.includes(MEDIA_MIME) || types.includes(CLIP_MIME) || types.includes('Files')
  }

  const onTrackDragOver = (track: 'video' | AudioLane) => (event: ReactDragEvent<HTMLElement>) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = [...event.dataTransfer.types].includes(CLIP_MIME) ? 'move' : 'copy'
    const t = trackTime(event)
    const x = track === 'video' ? (() => { const index = insertIndex(t); return (index < placed.length ? placed[index].start : total) * zoom })() : t * zoom
    setDropMarker({ track, x })
    setDropping(false)
  }

  const onTrackDrop = (track: 'video' | AudioLane) => (event: ReactDragEvent<HTMLElement>) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDropMarker(null)
    setDropping(false)
    const t = trackTime(event)
    const mediaId = event.dataTransfer.getData(MEDIA_MIME)
    if (mediaId) {
      const item = mediaRef.current.find(entry => entry.id === mediaId)
      if (item) placeMedia(item, item.kind === 'audio' ? { at: snap(t), lane: track === 'video' ? undefined : track } : { index: insertIndex(t) })
      return
    }
    if (dragIndex.current != null && track === 'video') {
      const from = dragIndex.current
      dragIndex.current = null
      let to = insertIndex(t)
      if (to > from) to -= 1
      moveClip(from, to)
      return
    }
    if (event.dataTransfer.files.length) void importFiles([...event.dataTransfer.files], track === 'music' ? { at: t, index: insertIndex(t) } : { index: insertIndex(t), at: t })
  }

  /* ── dragging titles and clips in the preview ────────────────────── */

  const onPreviewPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x0 = event.clientX, y0 = event.clientY
    const title = selectedTitle
    const clip = selection?.kind === 'clip' ? selectedClip : null
    const origin = title ? { x: title.x, y: title.y } : clip ? { x: clip.transform?.x ?? 0, y: clip.transform?.y ?? 0 } : null
    let moved = false
    history.current.key = ''
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - x0) / rect.width, dy = (moveEvent.clientY - y0) / rect.height
      if (!moved && Math.hypot(moveEvent.clientX - x0, moveEvent.clientY - y0) < 4) return
      moved = true
      if (!origin) return
      // Snap to the centre lines.
      const snapTo = (value: number, centre: number) => (Math.abs(value - centre) < 0.012 ? centre : value)
      if (title) updateTitle(title.id, { x: snapTo(origin.x + dx, 0.5), y: snapTo(origin.y + dy, 0.5) }, `move:${title.id}`)
      else if (clip) updateTransform(clip, { x: snapTo(origin.x + dx, 0), y: snapTo(origin.y + dy, 0) }, `move:${clip.id}`)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      history.current.key = ''
      if (!moved) { if (playing) stop(); else play() }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* ── layout ──────────────────────────────────────────────────────── */

  // Fit shows exactly the visible width (nothing to scroll); zoomed in, a little room past the end.
  const timelineWidth = zoomState.fit ? lane : Math.max(lane, (end + Math.max(2, end * 0.08)) * zoom)
  const step = tickStep(zoom)
  const tabs: Array<{ id: LeftTab; label: string; icon: typeof Layers }> = [
    { id: 'media', label: 'Media', icon: ImagePlus },
    { id: 'timeline', label: 'In use', icon: ListCheck },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Transition },
    { id: 'titles', label: 'Titles', icon: Type },
  ]
  // Where each imported file is used: clips on the video track, items on the music track.
  const usage = new Map<string, number>()
  for (const clip of project.clips) usage.set(clip.mediaId, (usage.get(clip.mediaId) ?? 0) + 1)
  for (const track of project.audio) usage.set(track.mediaId, (usage.get(track.mediaId) ?? 0) + 1)
  const imported = media.filter(item => !item.sfx)
  const effects = media.filter(item => item.sfx)
  const mediaCounts = {
    all: imported.length,
    video: imported.filter(item => item.kind === 'video').length,
    image: imported.filter(item => item.kind === 'image').length,
    audio: imported.filter(item => item.kind === 'audio').length,
    sfx: effects.length,
    unused: imported.filter(item => !usage.get(item.id)).length,
  }
  const shownMedia = (mediaFilter === 'sfx' ? effects : imported).filter(item => (mediaFilter === 'all' || mediaFilter === 'sfx' || (mediaFilter === 'unused' ? !usage.get(item.id) : item.kind === mediaFilter)) && (!mediaQuery.trim() || item.name.toLowerCase().includes(mediaQuery.trim().toLowerCase())))
  /** Selects where a file is used and moves the playhead there. */
  const locateMedia = (item: MediaItem) => {
    const clip = placed.find(entry => entry.clip.mediaId === item.id)
    if (clip) { setSelection({ kind: 'clip', id: clip.clip.id }); seek(clip.start + 0.01); return }
    const track = project.audio.find(entry => entry.mediaId === item.id)
    if (track) { setSelection({ kind: 'audio', id: track.id }); seek(track.start + 0.01) }
  }
  const removeMedia = (item: MediaItem) => {
    if (usage.get(item.id) || item.sfx) return
    URL.revokeObjectURL(item.url)
    void forgetMediaFile(item.id)
    mediaRef.current = mediaRef.current.filter(entry => entry.id !== item.id)
    setMedia(mediaRef.current)
  }
  const jumpTo = (next: Selection, at: number) => { setSelection(next); seek(at + 0.01) }

  const fontOptions = BUNDLED_FAMILIES.map(font => ({ value: font.family, label: font.family, style: { fontFamily: previewFamily(font.family) } }))
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0

  return (
    <main
      className="spyda-editor mac-ui flex h-[100dvh] flex-col overflow-hidden bg-[#0b0c0e] text-foreground"
      onDragOver={event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); setDropping(true) } }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDropping(false) }}
      onDrop={event => { event.preventDefault(); setDropping(false); setDropMarker(null); if (event.dataTransfer.files.length) void importFiles([...event.dataTransfer.files]) }}
    >
      {sellOpen ? <SellDesignDialog kind="video" defaultName={`${format.name.split(' · ')[0]} video`} makePreview={makeVideoCover} makePackage={makeVideoPackage} onClose={() => setSellOpen(false)} /> : null}
      {/* Top bar */}
      <header className="mac-menubar flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#111214] px-2">
        <WindowControls onClose={() => navigate('/workspace')} onFit={() => setZoomState(current => ({ ...current, fit: true }))} fitLabel="Fit the whole edit in the timeline" />
        <button type="button" onClick={() => navigate('/workspace')} aria-label="Back to Spyda AI" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08]">
          <img src="/assets/spyda-logo.png" alt="" className="h-5 w-5 object-contain" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Clapperboard className="h-4 w-4 shrink-0 text-primary" />
          <input
            value={projectName}
            onChange={event => setProjectName(event.target.value)}
            onBlur={() => { if (!projectName.trim()) setProjectName('Untitled video') }}
            onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
            aria-label="Project name"
            title="Click to rename this project"
            className="w-[170px] min-w-0 rounded-md bg-transparent px-1.5 py-1 text-[13px] font-semibold outline-none hover:bg-white/[0.05] focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/50"
          />
          <span className={`hidden shrink-0 text-[10px] md:inline ${saveState === 'failed' ? 'text-amber-300' : 'text-muted-foreground'}`} title={saveState === 'failed' ? 'This device has no room left to save the project' : 'Saved on this device'}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved' : 'Saved'}
          </span>
        </div>
        <div role="tablist" aria-label="Editor" className="ml-3 hidden items-center gap-0.5 rounded-lg bg-black/30 p-0.5 sm:flex">
          <button type="button" role="tab" aria-selected="false" onClick={() => { let back = '/editor/new'; try { back = window.sessionStorage.getItem('spyda.lastCanvas') || back } catch { /* storage off */ } navigate(back) }} title="Switch to Canvas mode" className="inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <Palette className="h-3 w-3" /> Design
          </button>
          <button type="button" role="tab" aria-selected="true" className="inline-flex h-6 items-center gap-1.5 rounded-md bg-white/[0.1] px-2.5 text-[11px] font-semibold">
            <Clapperboard className="h-3 w-3 text-primary" /> Video
          </button>
        </div>
        <div className="ml-2 flex items-center gap-0.5">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08] disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08] disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </div>
        <SpydaSelect
          ariaLabel="Video size"
          value={format.id as string}
          onChange={value => setFormat(FORMATS.find(item => item.id === value) ?? FORMATS[0])}
          options={FORMATS.map(item => ({ value: item.id as string, label: item.name }))}
          menuWidth={200}
          className="ml-1 h-7 rounded-md bg-white/[0.06] px-2.5 text-[11px] hover:bg-white/[0.1]"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <SpydaSelect ariaLabel="Frame rate" value={fps} onChange={setFps} options={FRAME_RATES.map(rate => ({ value: rate, label: `${rate} fps` }))} className="hidden h-8 rounded-md bg-white/[0.06] px-2.5 text-[11px] hover:bg-white/[0.1] md:inline-flex" />
          <SpydaSelect ariaLabel="Export quality" value={quality} onChange={setQuality} options={QUALITIES.map(item => ({ value: item.value, label: `${item.label} quality` }))} menuWidth={170} className="hidden h-8 rounded-md bg-white/[0.06] px-2.5 text-[11px] hover:bg-white/[0.1] md:inline-flex" />
          <button type="button" onClick={() => setSellOpen(true)} disabled={!placed.length} title="Sell this project, editable, on the marketplace" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/[0.08] px-3 text-[11px] font-semibold text-primary hover:bg-primary/[0.15] disabled:opacity-40">
            <Store className="h-3.5 w-3.5" /> Sell
          </button>
          <button type="button" onClick={() => navigate('/workspace')} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.1] px-3 text-[11px] font-semibold hover:bg-white/[0.08]">
            <LogOut className="h-3.5 w-3.5" /> Done
          </button>
          <button type="button" onClick={() => goToPage('export')} disabled={exporting != null} title="Open the Export page" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">
            {exporting != null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting != null ? `Exporting ${Math.round(exporting * 100)}%` : 'Export video'}
          </button>
        </div>
      </header>

      {page === 'media' ? (
        <MediaPage
          media={media}
          usage={usage}
          folders={folders}
          onFoldersChange={setFolders}
          importing={importing}
          onImport={() => fileRef.current?.click()}
          onAdd={item => placeMedia(item, item.kind === 'audio' ? { at: time } : {})}
          onLocate={item => { goToPage('edit'); locateMedia(item) }}
          onRemove={removeMedia}
          onUpdate={updateMedia}
          projects={projects}
          projectId={projectId}
          onOpenProject={id => { saveVideoProject(snapshotRef.current()); onOpenProject(id) }}
          onNewProject={() => { saveVideoProject(snapshotRef.current()); onNewProject() }}
          onDeleteProject={id => { void deleteVideoProject(id).then(() => setProjects(listVideoProjects())) }}
        />
      ) : null}
      {page === 'export' ? (
        <ExportPage
          projectName={projectName}
          format={format.id}
          onFormat={id => setFormat(FORMATS.find(item => item.id === id) ?? FORMATS[0])}
          fps={fps}
          onFps={setFps}
          quality={quality}
          qualities={QUALITIES}
          onQuality={value => setQuality((QUALITIES.find(item => item.value === value) ?? QUALITIES[1]).value)}
          end={end}
          clipCount={placed.length}
          cover={cover}
          exporting={exporting}
          onExport={request => { void exportVideo(request) }}
          history={exportsDone}
        />
      ) : null}
      <div className={`mac-workspace min-h-0 flex-1 ${page === 'edit' ? 'flex' : 'hidden'}`}>
        {/* Left: media, effects, transitions, titles */}
        <aside className="mac-sidebar flex w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#111214]">
          <div role="tablist" className="grid grid-cols-5 gap-0.5 border-b border-white/[0.06] p-1">
            {tabs.map(item => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[9px] font-medium ${tab === item.id ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <item.icon className={`h-4 w-4 ${tab === item.id ? 'text-primary' : ''}`} /> {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'media' ? (
              <div className="space-y-3">
                <input ref={fileRef} type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={event => { void importFiles([...(event.target.files ?? [])]); event.target.value = '' }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] px-3 py-5 text-center hover:border-primary/50">
                  {importing ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
                  <span className="text-[12px] font-semibold">Import media</span>
                  <span className="text-[10px] text-muted-foreground">Video, images or music. Or drop files anywhere.</span>
                </button>
                {media.length ? (
                  <>
                    <input type="search" value={mediaQuery} onChange={event => setMediaQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search your media…" aria-label="Search your media" className="h-8 w-full rounded-md bg-white/[0.05] px-2.5 text-[11px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/60" />
                    <div className="flex flex-wrap gap-1">
                      {([['all', 'All'], ['video', 'Videos'], ['image', 'Pictures'], ['audio', 'Music'], ['sfx', 'Sound effects'], ['unused', 'Not used']] as const).map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setMediaFilter(id)} aria-pressed={mediaFilter === id} className={`h-6 rounded-md px-2 text-[10px] font-medium ${mediaFilter === id ? 'bg-primary/15 text-primary' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}>
                          {label} <span className="opacity-60">{mediaCounts[id]}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {shownMedia.map(item => {
                    const used = usage.get(item.id) ?? 0
                    return (
                      <div key={item.id} className={`group relative overflow-hidden rounded-lg border bg-black/30 ${used ? 'border-primary/30' : 'border-white/[0.08]'} hover:border-primary/60`}>
                        <button
                          type="button"
                          draggable
                          onDragStart={event => { event.dataTransfer.setData(MEDIA_MIME, item.id); event.dataTransfer.effectAllowed = 'copy' }}
                          onDragEnd={() => setDropMarker(null)}
                          onClick={() => placeMedia(item, item.kind === 'audio' ? { at: time } : {})}
                          title={item.sfx ? `Drag onto the SFX track, or click to add ${item.name} at the playhead` : `Drag onto the timeline, or click to add ${item.name}`}
                          className="block w-full cursor-grab text-left active:cursor-grabbing"
                        >
                          <span className="relative block aspect-video bg-[#16171a]">
                            {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} className="h-full w-full object-contain" /> : item.sfx ? <SoundWave seed={item.name} /> : <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">♪ Music</span>}
                            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[9px]">{item.kind === 'image' ? 'Picture' : formatTime(item.duration)}</span>
                            {used || !item.sfx ? <span className={`absolute left-1 top-1 rounded px-1 text-[8px] font-semibold ${used ? 'bg-primary text-primary-foreground' : 'bg-black/70 text-muted-foreground'}`}>{used ? `In use · ${used}` : 'Not used'}</span> : null}
                            <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex"><Plus className="h-5 w-5" /></span>
                          </span>
                          <span className="block truncate px-1.5 pt-1 text-[10px]">{item.name}</span>
                          <span className="block px-1.5 pb-1 text-[9px] capitalize text-muted-foreground">{item.sfx ? 'Sound effect' : item.kind === 'audio' ? 'Music' : item.kind === 'image' ? 'Picture' : 'Video'}{item.width ? ` · ${item.width}×${item.height}` : ''}</span>
                        </button>
                        {item.sfx ? (
                          <button type="button" onClick={() => previewSound(item)} title={previewing === item.id ? 'Stop' : `Listen to ${item.name}`} aria-label={previewing === item.id ? `Stop ${item.name}` : `Listen to ${item.name}`} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full ${previewing === item.id ? 'bg-primary text-primary-foreground' : 'bg-black/75 text-foreground hover:bg-primary hover:text-primary-foreground'}`}>
                            {previewing === item.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[1px]" />}
                          </button>
                        ) : null}
                        <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                          {used ? <button type="button" onClick={() => locateMedia(item)} title="Show where it is used" aria-label={`Show where ${item.name} is used`} className="rounded bg-black/75 px-1 text-[9px] font-semibold text-primary hover:bg-black">Show</button> : null}
                          {!used && !item.sfx ? <button type="button" onClick={() => removeMedia(item)} title="Remove from your media" aria-label={`Remove ${item.name}`} className="rounded bg-black/75 p-0.5 text-muted-foreground hover:bg-red-500/40 hover:text-foreground"><Trash2 className="h-3 w-3" /></button> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {media.length && !shownMedia.length ? <p className="text-[10px] text-muted-foreground">Nothing here. Try another filter or search.</p> : null}
                <p className="text-[10px] leading-4 text-muted-foreground">{media.length ? 'Drag a file onto the video, music or SFX track to place it, or click it to add it. Green files are in your edit. Press S to split the selected clip or music at the playhead.' : 'Imported files stay on this device.'}</p>
              </div>
            ) : tab === 'timeline' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {[[formatTime(end), 'Length'], [String(project.clips.length), 'Clips'], [String(project.titles.length + project.audio.length), 'Titles & music']].map(([value, label]) => (
                    <div key={label} className="rounded-lg bg-white/[0.03] px-1 py-2"><p className="font-mono text-[12px] font-semibold">{value}</p><p className="text-[9px] text-muted-foreground">{label}</p></div>
                  ))}
                </div>
                {[
                  {
                    title: 'Video track',
                    empty: 'No clips yet. Add media from the Media tab.',
                    rows: placed.map(item => {
                      const info = mediaFor(item.clip)
                      const tags = [item.clip.speed !== 1 ? `${item.clip.speed}×` : '', item.clip.effect !== 'none' ? EFFECTS.find(effect => effect.id === item.clip.effect)?.name ?? '' : '', item.index < placed.length - 1 && item.clip.transition.type !== 'cut' ? `→ ${TRANSITIONS.find(transition => transition.id === item.clip.transition.type)?.name}` : ''].filter(Boolean)
                      return { key: item.clip.id, selected: selection?.kind === 'clip' && selection.id === item.clip.id, thumb: info?.thumbnail ?? null, label: `${item.index + 1}. ${info?.name ?? 'Clip'}`, detail: `${formatTime(item.start)} – ${formatTime(item.end)}${tags.length ? ` · ${tags.join(' · ')}` : ''}`, onClick: () => jumpTo({ kind: 'clip', id: item.clip.id }, item.start), onRemove: () => { setSelection({ kind: 'clip', id: item.clip.id }); change(current => ({ ...current, clips: current.clips.filter(clip => clip.id !== item.clip.id) })) } }
                    }),
                  },
                  {
                    title: 'Titles',
                    empty: 'No titles yet. Add one from the Titles tab.',
                    rows: [...project.titles].sort((a, b) => a.start - b.start).map(title => ({ key: title.id, selected: selection?.kind === 'title' && selection.id === title.id, thumb: null, label: title.text.split('\n')[0] || 'Title', detail: `${formatTime(title.start)} – ${formatTime(title.start + title.duration)} · ${title.animation}`, onClick: () => jumpTo({ kind: 'title', id: title.id }, title.start), onRemove: () => change(current => ({ ...current, titles: current.titles.filter(item => item.id !== title.id) })) })),
                  },
                  {
                    title: 'Music',
                    empty: 'No music yet. Drag a song onto the music track.',
                    rows: [...project.audio].sort((a, b) => a.start - b.start).map(track => ({ key: track.id, selected: selection?.kind === 'audio' && selection.id === track.id, thumb: null, label: `♪ ${media.find(item => item.id === track.mediaId)?.name ?? 'Music'}`, detail: `${formatTime(track.start)} – ${formatTime(track.start + track.out - track.in)} · ${Math.round(track.volume * 100)}%`, onClick: () => jumpTo({ kind: 'audio', id: track.id }, track.start), onRemove: () => { musicElements.current.get(track.id)?.pause(); change(current => ({ ...current, audio: current.audio.filter(item => item.id !== track.id) })) } })),
                  },
                ].map(section => (
                  <section key={section.title}>
                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{section.title} <span className="ml-1 rounded bg-white/[0.06] px-1 font-mono text-[9px] normal-case tracking-normal">{section.rows.length}</span></h3>
                    {section.rows.length ? (
                      <ul className="space-y-1">
                        {section.rows.map(row => (
                          <li key={row.key} className={`group flex items-center gap-2 rounded-lg border px-1.5 py-1 ${row.selected ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06] hover:border-white/20'}`}>
                            <button type="button" onClick={row.onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left" title="Select it and jump to it">
                              {row.thumb ? <img src={row.thumb} alt="" className="h-7 w-11 shrink-0 rounded bg-black object-contain" /> : <span className="h-7 w-11 shrink-0 rounded bg-white/[0.05]" />}
                              <span className="min-w-0">
                                <span className="block truncate text-[11px] font-medium">{row.label}</span>
                                <span className="block truncate font-mono text-[9px] text-muted-foreground">{row.detail}</span>
                              </span>
                            </button>
                            <button type="button" onClick={row.onRemove} aria-label={`Remove ${row.label}`} title="Remove from the edit" className="hidden rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-foreground group-hover:block"><Trash2 className="h-3 w-3" /></button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="rounded-md bg-white/[0.02] px-2 py-2 text-[10px] text-muted-foreground">{section.empty}</p>}
                  </section>
                ))}
              </div>
            ) : tab === 'effects' ? (
              <div>
                <p className="mb-2 text-[10px] text-muted-foreground">{target ? `Applies to ${mediaFor(target)?.name ?? 'the clip'}.` : 'Add a clip first.'}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {EFFECTS.map((effect, index) => (
                    <button key={effect.id} type="button" disabled={!target} onClick={() => target && updateClip(target.id, { effect: effect.id as EffectId })} className={`h-14 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-40 ${target?.effect === effect.id ? 'border-primary bg-primary/15 text-primary' : 'border-white/[0.08] hover:border-white/25'}`} style={{ backgroundImage: index ? `linear-gradient(135deg, hsla(${(index * 47) % 360}, 70%, 45%, 0.25), transparent)` : undefined }}>
                      {effect.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : tab === 'transitions' ? (
              <div>
                <p className="mb-2 text-[10px] text-muted-foreground">{target ? 'Sets how the selected clip hands over to the next. Click a ◆ on the timeline to pick a cut.' : 'Add two clips first.'}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {TRANSITIONS.map(transition => (
                    <button key={transition.id} type="button" disabled={!target} onClick={() => target && updateClip(target.id, clip => ({ transition: { type: transition.id as TransitionId, duration: transition.id === 'cut' ? 0 : clip.transition.duration || 0.6 } }))} className={`h-11 rounded-lg border text-[11px] font-medium disabled:opacity-40 ${target?.transition.type === transition.id ? 'border-primary bg-primary/15 text-primary' : 'border-white/[0.08] hover:border-white/25'}`}>
                      {transition.name}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={project.clips.length < 2 || !target} onClick={() => target && change(current => ({ ...current, clips: current.clips.map(clip => ({ ...clip, transition: { ...target.transition } })) }))} className="mt-2 h-8 w-full rounded-md bg-white/[0.06] text-[11px] font-semibold hover:bg-white/[0.1] disabled:opacity-40">Use on every cut</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button type="button" onClick={() => addTitle()} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Add title at playhead</button>
                {TITLE_PRESETS.map(preset => (
                  <button key={preset.name} type="button" onClick={() => addTitle(preset.patch)} className="block w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left hover:border-primary/40">
                    <span className="block text-[12px] font-semibold" style={{ fontFamily: preset.patch.font, WebkitTextStroke: preset.patch.outlineWidth ? `1px ${preset.patch.outlineColor}` : undefined }}>{preset.name}</span>
                    <span className="block text-[10px] capitalize text-muted-foreground">{preset.patch.animation} in</span>
                  </button>
                ))}
                <p className="pt-1 text-[10px] leading-4 text-muted-foreground">Select a title, then drag it in the preview to place it.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Centre: preview and transport */}
        <section className="mac-window flex min-w-0 flex-1 flex-col">
          <div ref={previewRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-[#16171a] p-4">
            <canvas
              ref={node => {
                outputRef.current = node
                if (node && node.width !== format.width) { node.width = format.width; node.height = format.height }
              }}
              className={`max-h-full max-w-full rounded-md bg-black shadow-[0_20px_60px_rgba(0,0,0,0.5)] ${selectedTitle || selection?.kind === 'clip' ? 'cursor-move' : 'cursor-pointer'}`}
              style={{ aspectRatio: `${format.width} / ${format.height}` }}
              onPointerDown={onPreviewPointerDown}
            />
            {!project.clips.length ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 m-auto flex h-40 w-72 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.18] bg-black/40 text-center backdrop-blur">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-[13px] font-semibold">Import your first clip</span>
                <span className="px-6 text-[10px] text-muted-foreground">MP4, WebM or MOV, plus images and music. Drop them anywhere.</span>
              </button>
            ) : null}
            {dropping ? <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-black/60 text-[14px] font-semibold">Drop to import</div> : null}
            {notice ? (
              <div role="status" className="absolute inset-x-4 top-3 mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-white/[0.1] bg-[#17181b] px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg">
                <Sparkles className="h-3 w-3 text-primary" /><span className="flex-1">{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-3 w-3" /></button>
              </div>
            ) : null}

          </div>
          <div className="video-transport flex h-12 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-t border-white/[0.06] bg-[#111214] px-3">
            {/* Playback: step buttons either side of a round play button, then the time. */}
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => seek(0)} aria-label="Go to start" title="Go to start (Home)" className={transportButton}><TransportGlyph name="start" /></button>
              <button type="button" onClick={() => seek(time - 1 / 30)} aria-label="Back one frame" title="Back one frame (←)" className={transportButton}><TransportGlyph name="back" /></button>
              <button type="button" onClick={() => (playing ? stop() : play())} disabled={!placed.length} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} className="mx-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_14px_rgba(157,250,176,0.3)] transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
              </button>
              <button type="button" onClick={() => seek(time + 1 / 30)} aria-label="Forward one frame" title="Forward one frame (→)" className={transportButton}><TransportGlyph name="forward" /></button>
              <button type="button" onClick={() => seek(end)} aria-label="Go to end" title="Go to end (End)" className={transportButton}><TransportGlyph name="end" /></button>
            </div>
            <span className="ml-1.5 shrink-0 rounded-md bg-black/30 px-2 py-1 font-mono text-[11px] tabular-nums leading-none"><span className="text-foreground">{formatTime(time)}</span><span className="text-muted-foreground"> / {formatTime(end)}</span></span>
            <span className="mx-1.5 h-5 w-px shrink-0 bg-white/10" />
            {/* Editing: icon and label on one line; labels show when there is room. */}
            <div className="flex min-w-0 shrink-0 items-center gap-0.5">
              <button type="button" onClick={split} disabled={!placed.length && !project.audio.length} title="Split the selected clip or music at the playhead (S)" aria-label="Split at playhead" className={toolButton}><ScissorsGlyph /><span className="transport-label">Split</span></button>
              <button type="button" onClick={() => addTitle()} title="Add a title at the playhead" aria-label="Add a title" className={toolButton}><Type className="h-3.5 w-3.5 shrink-0" /><span className="transport-label">Title</span></button>
              <button type="button" onClick={() => fileRef.current?.click()} title="Import media" aria-label="Import media" className={toolButton}><Plus className="h-3.5 w-3.5 shrink-0" /><span className="transport-label">Media</span></button>
              <button type="button" onClick={saveFrame} disabled={!placed.length} title="Save this frame as a PNG" aria-label="Save this frame as a PNG" className={`${toolButton} hidden lg:inline-flex`}><ImagePlus className="h-3.5 w-3.5 shrink-0" /><span className="transport-label">Save frame</span></button>
              <button type="button" onClick={() => { void previewRef.current?.requestFullscreen?.() }} title="Full-screen preview" aria-label="Full-screen preview" className={`${transportButton} hidden lg:flex`}><Maximize2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom timeline out" title="Zoom out (−)" className="h-7 w-7 rounded-md text-[13px] hover:bg-white/[0.08] hover:text-foreground">−</button>
              <input type="range" min={Math.log(MIN_ZOOM)} max={Math.log(MAX_ZOOM)} step={0.01} value={Math.log(zoom)} onChange={event => setZoomState({ fit: false, value: Math.exp(Number(event.target.value)) })} className="w-16 accent-[#9dfab0] xl:w-24" aria-label="Timeline zoom" title="Shift or Ctrl + mouse wheel also zooms" />
              <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom timeline in" title="Zoom in (+)" className="h-7 w-7 rounded-md text-[13px] hover:bg-white/[0.08] hover:text-foreground">+</button>
              <button type="button" onClick={() => setZoomState(current => ({ ...current, fit: true }))} title="Fit the whole edit (\)" className={`h-7 rounded-md px-2 text-[10px] font-semibold ${zoomState.fit ? 'bg-primary/15 text-primary' : 'hover:bg-white/[0.08] hover:text-foreground'}`}>Fit</button>
            </div>
          </div>
        </section>

        {/* Right: inspector */}
        <aside className="mac-sidebar w-[300px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[#111214]">
          {selectedClip && selection?.kind === 'clip' ? (() => {
            const clip = selectedClip
            const info = mediaFor(clip)
            const index = project.clips.findIndex(item => item.id === clip.id)
            const move = { ...IDENTITY_TRANSFORM, ...clip.transform }
            return (
              <>
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
                  {info?.thumbnail ? <img src={info.thumbnail} alt="" className="h-9 w-14 rounded bg-black object-contain" /> : null}
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{info?.name ?? 'Clip'}</p>
                    <p className="text-[10px] text-muted-foreground">{formatTime(clipLength(clip))} on the timeline · clip {index + 1} of {project.clips.length}</p>
                  </div>
                </div>
                <Section title="Clip">
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="text-[10px] text-muted-foreground">Start at
                      <input type="number" step={0.1} min={0} value={Math.round(clip.in * 10) / 10} onChange={event => updateClip(clip.id, { in: Math.min(clip.out - 0.2, Math.max(0, Number(event.target.value))) })} className="mt-0.5 h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] text-foreground outline-none" />
                    </label>
                    <label className="text-[10px] text-muted-foreground">End at
                      <input type="number" step={0.1} min={0} value={Math.round(clip.out * 10) / 10} onChange={event => updateClip(clip.id, { out: Math.max(clip.in + 0.2, Math.min(info?.kind === 'image' ? 600 : info?.duration ?? clip.out, Number(event.target.value))) })} className="mt-0.5 h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] text-foreground outline-none" />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-[72px] shrink-0">Speed</span>
                    <div className="flex flex-1 flex-wrap gap-1">
                      {SPEEDS.map(speed => <button key={speed} type="button" onClick={() => updateClip(clip.id, { speed })} className={`h-6 rounded px-1.5 text-[10px] ${clip.speed === speed ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{speed}×</button>)}
                    </div>
                  </div>
                  {info?.kind === 'video' ? (
                    <>
                      <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.01} reset={1} onChange={volume => updateClip(clip.id, { volume })} format={value => `${Math.round(value * 100)}%`} />
                      <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={clip.muted} onChange={event => updateClip(clip.id, { muted: event.target.checked })} className="accent-[#9dfab0]" /> Mute this clip</label>
                    </>
                  ) : null}
                  <Slider label="Fade in" value={clip.fadeIn ?? 0} min={0} max={Math.min(5, clipLength(clip) / 2)} step={0.05} onChange={fadeIn => updateClip(clip.id, { fadeIn })} format={value => `${value.toFixed(1)}s`} />
                  <Slider label="Fade out" value={clip.fadeOut ?? 0} min={0} max={Math.min(5, clipLength(clip) / 2)} step={0.05} onChange={fadeOut => updateClip(clip.id, { fadeOut })} format={value => `${value.toFixed(1)}s`} />
                </Section>
                <Section title="Framing & transform" action={<button type="button" onClick={() => updateClip(clip.id, { transform: { ...IDENTITY_TRANSFORM }, motion: 'none' })} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>}>
                  <div className="flex gap-1">
                    {FITS.map(fit => <button key={fit.id} type="button" onClick={() => updateClip(clip.id, { fit: fit.id })} className={`h-7 flex-1 rounded text-[10px] ${clip.fit === fit.id ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{fit.name}</button>)}
                  </div>
                  <Slider label="Scale" value={move.scale} min={0.2} max={4} step={0.01} reset={1} onChange={scale => updateTransform(clip, { scale })} format={value => `${Math.round(value * 100)}%`} />
                  <Slider label="Position X" value={move.x} min={-1} max={1} step={0.005} onChange={x => updateTransform(clip, { x })} format={value => `${Math.round(value * 100)}`} />
                  <Slider label="Position Y" value={move.y} min={-1} max={1} step={0.005} onChange={y => updateTransform(clip, { y })} format={value => `${Math.round(value * 100)}`} />
                  <Slider label="Rotate" value={move.rotate} min={-180} max={180} step={1} onChange={rotate => updateTransform(clip, { rotate })} format={value => `${Math.round(value)}°`} />
                  <div className="flex gap-1">
                    <Toggle label="Flip horizontally" active={move.flipX} onClick={() => updateTransform(clip, { flipX: !move.flipX })}>⇋ Flip H</Toggle>
                    <Toggle label="Flip vertically" active={move.flipY} onClick={() => updateTransform(clip, { flipY: !move.flipY })}>⇵ Flip V</Toggle>
                    <Toggle label="Rotate 90 degrees" active={false} onClick={() => updateTransform(clip, { rotate: ((move.rotate + 90 + 180) % 360) - 180 })}>↻ 90°</Toggle>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-[72px] shrink-0">Motion</span>
                    <SpydaSelect ariaLabel="Clip motion" value={clip.motion ?? 'none'} onChange={(motion: ClipMotion) => updateClip(clip.id, { motion })} options={CLIP_MOTIONS.map(item => ({ value: item.id, label: item.name }))} className="flex h-7 flex-1 rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]" />
                  </div>
                  <p className="text-[9px] leading-3 text-muted-foreground">Tip: with the clip selected, drag it in the preview to move it.</p>
                </Section>
                <Section title="Colour" action={<button type="button" onClick={() => updateClip(clip.id, { grade: { ...NEUTRAL_GRADE } })} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>}>
                  <div className="mb-1.5 grid grid-cols-4 gap-1">
                    {GRADE_PRESETS.map(preset => <button key={preset.name} type="button" onClick={() => updateClip(clip.id, { grade: { ...NEUTRAL_GRADE, ...preset.grade } })} className="h-7 rounded bg-white/[0.05] px-1 text-[9px] font-medium hover:bg-white/[0.1]">{preset.name}</button>)}
                  </div>
                  {GRADE_CONTROLS.map(control => (
                    <Slider key={control.key} label={control.label} value={clip.grade[control.key]} min={control.min} max={control.max} step={control.step} onChange={value => updateClip(clip.id, current => ({ grade: { ...current.grade, [control.key]: value } }), `grade:${clip.id}:${control.key}`)} />
                  ))}
                  <button type="button" disabled={project.clips.length < 2} onClick={() => change(current => ({ ...current, clips: current.clips.map(item => ({ ...item, grade: { ...clip.grade } })) }))} className="mt-1 h-7 w-full rounded-md bg-white/[0.05] text-[10px] font-semibold hover:bg-white/[0.1] disabled:opacity-40">Apply this colour to every clip</button>
                  <p className="text-[9px] text-muted-foreground">Double-click a slider to reset it.</p>
                </Section>
                <Section title="Effect">
                  <SpydaSelect ariaLabel="Effect" value={clip.effect} onChange={(effect: EffectId) => updateClip(clip.id, { effect })} options={EFFECTS.map(effect => ({ value: effect.id as EffectId, label: effect.name }))} className="flex h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]" />
                  {clip.effect !== 'none' ? <Slider label="Intensity" value={clip.amount} min={0} max={1} step={0.01} reset={0.7} onChange={amount => updateClip(clip.id, { amount })} format={value => `${Math.round(value * 100)}%`} /> : null}
                </Section>
                {index < project.clips.length - 1 ? (
                  <Section title="Transition to next">
                    <SpydaSelect ariaLabel="Transition" value={clip.transition.type} onChange={(type: TransitionId) => updateClip(clip.id, current => ({ transition: { type, duration: type === 'cut' ? 0 : current.transition.duration || 0.6 } }))} options={TRANSITIONS.map(transition => ({ value: transition.id as TransitionId, label: transition.name }))} className="flex h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]" />
                    {clip.transition.type !== 'cut' ? <Slider label="Duration" value={clip.transition.duration} min={0.1} max={2.5} step={0.05} reset={0.6} onChange={duration => updateClip(clip.id, current => ({ transition: { ...current.transition, duration } }), `transition:${clip.id}`)} format={value => `${value.toFixed(2)}s`} /> : null}
                  </Section>
                ) : null}
                <Section title="Arrange">
                  <div className="grid grid-cols-4 gap-1">
                    <button type="button" onClick={() => moveClip(index, index - 1)} disabled={index === 0} title="Move earlier" className="h-8 rounded bg-white/[0.05] text-[11px] hover:bg-white/[0.1] disabled:opacity-30">◀</button>
                    <button type="button" onClick={() => moveClip(index, index + 1)} disabled={index === project.clips.length - 1} title="Move later" className="h-8 rounded bg-white/[0.05] text-[11px] hover:bg-white/[0.1] disabled:opacity-30">▶</button>
                    <button type="button" onClick={duplicateSelected} title="Duplicate (Ctrl+D)" aria-label="Duplicate clip" className="flex h-8 items-center justify-center rounded bg-white/[0.05] hover:bg-white/[0.1]"><Copy className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={removeSelected} title="Delete (Del)" aria-label="Delete clip" className="flex h-8 items-center justify-center rounded bg-white/[0.05] hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </Section>
              </>
            )
          })() : selectedClip && selection?.kind === 'transition' ? (
            <Section title="Transition">
              <p className="text-[11px] text-muted-foreground">Between clip {project.clips.findIndex(clip => clip.id === selectedClip.id) + 1} and the next.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TRANSITIONS.map(transition => (
                  <button key={transition.id} type="button" onClick={() => updateClip(selectedClip.id, current => ({ transition: { type: transition.id as TransitionId, duration: transition.id === 'cut' ? 0 : current.transition.duration || 0.6 } }))} className={`h-9 rounded-lg border text-[11px] ${selectedClip.transition.type === transition.id ? 'border-primary bg-primary/15 text-primary' : 'border-white/[0.08] hover:border-white/25'}`}>{transition.name}</button>
                ))}
              </div>
              {selectedClip.transition.type !== 'cut' ? <Slider label="Duration" value={selectedClip.transition.duration} min={0.1} max={2.5} step={0.05} reset={0.6} onChange={duration => updateClip(selectedClip.id, current => ({ transition: { ...current.transition, duration } }), `transition:${selectedClip.id}`)} format={value => `${value.toFixed(2)}s`} /> : null}
            </Section>
          ) : selectedTitle ? (() => {
            const title = { ...TITLE_DEFAULTS, ...selectedTitle }
            const set = (patch: Partial<Title>) => updateTitle(title.id, patch)
            return (
              <>
                <Section title="Title">
                  <textarea value={title.text} onChange={event => set({ text: event.target.value })} rows={3} className="w-full resize-y rounded-md bg-white/[0.05] px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-primary/60" aria-label="Title text" />
                  <div className="grid grid-cols-[1fr_96px] gap-1.5">
                    <SpydaSelect ariaLabel="Font" onOpen={loadFontPreviews} value={title.font} onChange={font => set({ font })} options={fontOptions} menuWidth={220} className="flex h-7 rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]" />
                    <SpydaSelect ariaLabel="Font weight" value={title.weight} onChange={weight => set({ weight })} options={[300, 400, 500, 600, 700, 800].map(weight => ({ value: weight, label: ({ 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' } as Record<number, string>)[weight], style: { fontWeight: weight } }))} className="flex h-7 rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]" />
                  </div>
                  <div className="flex gap-1">
                    <Toggle label="Bold" active={title.weight >= 600} onClick={() => set({ weight: title.weight >= 600 ? 400 : 700 })}><b>B</b></Toggle>
                    <Toggle label="Italic" active={title.italic} onClick={() => set({ italic: !title.italic })}><i className="font-serif">I</i></Toggle>
                    <Toggle label="Uppercase" active={title.uppercase} onClick={() => set({ uppercase: !title.uppercase })}>AA</Toggle>
                    {(['left', 'center', 'right'] as const).map(align => (
                      <Toggle key={align} label={`Align ${align}`} active={title.align === align} onClick={() => set({ align })}>
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                          {align === 'left' ? <path d="M2 4h12M2 8h8M2 12h10" /> : align === 'center' ? <path d="M2 4h12M4 8h8M3 12h10" /> : <path d="M2 4h12M6 8h8M4 12h10" />}
                        </svg>
                      </Toggle>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[72px]">Colour</span><input type="color" value={title.color} onChange={event => set({ color: event.target.value.toUpperCase() })} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" /><span className="font-mono text-foreground/80">{title.color}</span></label>
                  <Slider label="Size" value={title.size} min={0.02} max={0.25} step={0.005} reset={0.085} onChange={size => set({ size })} format={value => `${Math.round(value * 100)}%`} />
                </Section>
                <Section title="Spacing">
                  <Slider label="Line spacing" value={title.lineHeight} min={0.7} max={3} step={0.05} reset={1.2} onChange={lineHeight => set({ lineHeight })} format={value => `${value.toFixed(2)}×`} />
                  <Slider label="Paragraph" value={title.paragraphSpacing} min={0} max={2} step={0.05} reset={0} onChange={paragraphSpacing => set({ paragraphSpacing })} format={value => `${value.toFixed(2)}×`} />
                  <Slider label="Letters" value={title.letterSpacing} min={-0.1} max={0.5} step={0.005} reset={0} onChange={letterSpacing => set({ letterSpacing })} format={value => `${Math.round(value * 100)}`} />
                  <Slider label="Wrap width" value={title.maxWidth} min={0.2} max={1} step={0.01} reset={0.86} onChange={maxWidth => set({ maxWidth })} format={value => `${Math.round(value * 100)}%`} />
                  <p className="text-[9px] leading-3 text-muted-foreground">Paragraph spacing adds room after each line break (Enter).</p>
                </Section>
                <Section title="Style & position">
                  <Slider label="Outline" value={title.outlineWidth} min={0} max={0.15} step={0.005} reset={0} onChange={outlineWidth => set({ outlineWidth })} format={value => `${Math.round(value * 100)}`} />
                  {title.outlineWidth > 0 ? <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[72px]">Outline colour</span><input type="color" value={title.outlineColor} onChange={event => set({ outlineColor: event.target.value.toUpperCase() })} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" /></label> : null}
                  <div className="flex gap-1">
                    <Toggle label="Drop shadow" active={title.shadow} onClick={() => set({ shadow: !title.shadow })}>Shadow</Toggle>
                    <Toggle label="Background pill" active={title.background} onClick={() => set({ background: !title.background })}>Background</Toggle>
                    {title.background ? <input type="color" value={title.backgroundColor} onChange={event => set({ backgroundColor: event.target.value.toUpperCase() })} aria-label="Background colour" className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent" /> : null}
                  </div>
                  <Slider label="Across" value={title.x} min={0} max={1} step={0.005} reset={0.5} onChange={x => set({ x })} format={value => `${Math.round(value * 100)}%`} />
                  <Slider label="Down" value={title.y} min={0} max={1} step={0.005} reset={0.5} onChange={y => set({ y })} format={value => `${Math.round(value * 100)}%`} />
                  <p className="text-[9px] leading-3 text-muted-foreground">Or drag the title in the preview.</p>
                </Section>
                <Section title="Timing & animation">
                  <div className="grid grid-cols-3 gap-1">
                    {TITLE_ANIMATIONS.map(animation => <button key={animation} type="button" onClick={() => set({ animation })} className={`h-7 rounded text-[10px] capitalize ${title.animation === animation ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{animation}</button>)}
                  </div>
                  <Slider label="Starts at" value={title.start} min={0} max={Math.max(1, end)} step={0.05} onChange={start => set({ start })} format={formatTime} />
                  <Slider label="Lasts" value={title.duration} min={0.5} max={30} step={0.1} reset={3} onChange={duration => set({ duration })} format={value => `${value.toFixed(1)}s`} />
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button type="button" onClick={duplicateSelected} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] hover:bg-white/[0.1]"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                    <button type="button" onClick={removeSelected} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </Section>
              </>
            )
          })() : selectedAudio ? (() => {
            const info = media.find(item => item.id === selectedAudio.mediaId)
            const length = selectedAudio.out - selectedAudio.in
            return (
              <Section title="Music">
                <p className="truncate text-[12px] font-semibold">{info?.name}</p>
                <Slider label="Volume" value={selectedAudio.volume} min={0} max={1.5} step={0.01} reset={0.8} onChange={volume => updateAudio(selectedAudio.id, { volume })} format={value => `${Math.round(value * 100)}%`} />
                <Slider label="Starts at" value={selectedAudio.start} min={0} max={Math.max(1, end)} step={0.05} onChange={start => updateAudio(selectedAudio.id, { start })} format={formatTime} />
                <Slider label="Trim start" value={selectedAudio.in} min={0} max={Math.max(0, selectedAudio.out - 0.3)} step={0.05} onChange={value => updateAudio(selectedAudio.id, { in: value })} format={formatTime} />
                <Slider label="Trim end" value={selectedAudio.out} min={selectedAudio.in + 0.3} max={info?.duration ?? selectedAudio.out} step={0.05} reset={info?.duration ?? selectedAudio.out} onChange={value => updateAudio(selectedAudio.id, { out: value })} format={formatTime} />
                <Slider label="Fade in" value={selectedAudio.fadeIn} min={0} max={Math.min(10, length / 2)} step={0.1} onChange={fadeIn => updateAudio(selectedAudio.id, { fadeIn })} format={value => `${value.toFixed(1)}s`} />
                <Slider label="Fade out" value={selectedAudio.fadeOut} min={0} max={Math.min(10, length / 2)} step={0.1} onChange={fadeOut => updateAudio(selectedAudio.id, { fadeOut })} format={value => `${value.toFixed(1)}s`} />
                <button type="button" onClick={() => end > 0 && updateAudio(selectedAudio.id, { start: 0, out: Math.min(info?.duration ?? selectedAudio.out, selectedAudio.in + total), fadeOut: Math.max(selectedAudio.fadeOut, 1.5) })} disabled={!total} className="h-7 w-full rounded-md bg-white/[0.05] text-[10px] font-semibold hover:bg-white/[0.1] disabled:opacity-40">Fit to the video, with a fade out</button>
                <button type="button" onClick={removeSelected} className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /> Remove music</button>
              </Section>
            )
          })() : (
            <div className="space-y-3 p-4 text-[11px] leading-5 text-muted-foreground">
              <p className="flex items-center gap-2 text-[12px] font-semibold text-foreground"><Wand2 className="h-4 w-4 text-primary" /> Edit like a pro</p>
              <p>Select a clip to trim it, frame and move it, change its speed and sound, grade its colour and give it an effect. Click a ◆ between clips to choose the transition.</p>
              <ul className="space-y-1 text-[10px]">
                <li><b className="text-foreground">Space</b> play · <b className="text-foreground">S</b> split · <b className="text-foreground">Del</b> delete</li>
                <li><b className="text-foreground">Ctrl+Z</b> undo · <b className="text-foreground">Ctrl+Shift+Z</b> redo · <b className="text-foreground">Ctrl+D</b> duplicate</li>
                <li><b className="text-foreground">← →</b> one frame · <b className="text-foreground">Shift</b> one second</li>
                <li><b className="text-foreground">Shift/Ctrl + wheel</b> zoom the timeline · <b className="text-foreground">\</b> fit</li>
                <li>Drag media onto a track · drag a clip&apos;s edges to trim · drag clips to reorder</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Timeline */}
      <div className={`mac-timeline h-[268px] shrink-0 border-t border-white/[0.06] bg-[#0f1012] ${page === 'edit' ? '' : 'hidden'}`}>
        <div className="flex h-full">
          <div className="shrink-0 border-r border-white/[0.06] pt-6 text-[10px] text-muted-foreground" style={{ width: TRACK_HEAD }}>
            <p className="flex h-[78px] items-center gap-1.5 px-3"><Clapperboard className="h-3.5 w-3.5" /> Video</p>
            <p className="flex h-[44px] items-center gap-1.5 px-3"><Type className="h-3.5 w-3.5" /> Titles</p>
            <p className="flex h-[44px] items-center gap-1.5 px-3">♪ Music</p>
            <p className="flex h-[44px] items-center gap-1.5 px-3"><Zap className="h-3.5 w-3.5" /> SFX</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollerRef} id="spyda-timeline" onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)} className="relative min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain">
            <div className="h-full" style={{ width: timelineWidth + GUTTER * 2, paddingLeft: GUTTER, paddingRight: GUTTER }}>
            <div className="relative h-full" style={{ width: timelineWidth }}>
              {/* Ruler: click or drag to move the playhead. */}
              <div
                className="sticky top-0 h-6 cursor-pointer overflow-hidden border-b border-white/[0.06] bg-[#111214]"
                onPointerDown={event => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  const at = (event.clientX - rect.left) / zoom
                  seek(at)
                  dragStart(event, dx => seek(at + dx), 'seek')
                }}
              >
                {Array.from({ length: Math.floor(timelineWidth / zoom / step) + 1 }, (_, index) => {
                  const second = index * step
                  return (
                    <span key={index} className="absolute top-0 h-full border-l border-white/[0.1] pl-1 font-mono text-[9px] text-muted-foreground" style={{ left: second * zoom }}>
                      {step < 1 ? formatTime(second) : formatTime(second).replace(/\.0$/, '')}
                      {[1, 2, 3].map(minor => <span key={minor} className="absolute bottom-0 h-1.5 border-l border-white/[0.07]" style={{ left: (minor * step * zoom) / 4 - 4 }} />)}
                    </span>
                  )
                })}
              </div>

              {/* Video track */}
              <div
                className="relative h-[78px] border-b border-white/[0.04]"
                onPointerDown={event => { if (event.target === event.currentTarget) setSelection(null) }}
                onDragOver={onTrackDragOver('video')}
                onDragLeave={event => { if (event.currentTarget === event.target) setDropMarker(null) }}
                onDrop={onTrackDrop('video')}
              >
                {!placed.length ? <p className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[10px] text-muted-foreground">Drag video or pictures here</p> : null}
                {placed.map(item => {
                  const info = mediaFor(item.clip)
                  const selected = selection?.kind === 'clip' && selection.id === item.clip.id
                  const tileWidth = info?.width && info.height ? Math.max(24, 58 * info.width / info.height) : 100
                  return (
                    <div
                      key={item.clip.id}
                      draggable
                      onDragStart={event => {
                        if (trimming.current) { event.preventDefault(); return }
                        dragIndex.current = item.index
                        event.dataTransfer.setData(CLIP_MIME, item.clip.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => { dragIndex.current = null; setDropMarker(null) }}
                      onClick={() => setSelection({ kind: 'clip', id: item.clip.id })}
                      className={`absolute top-2 h-[62px] cursor-pointer overflow-hidden rounded-md border-2 ${selected ? 'border-primary' : 'border-white/[0.12] hover:border-white/30'}`}
                      style={{ left: item.start * zoom, width: Math.max(8, item.length * zoom), backgroundImage: info?.thumbnail ? `url(${info.thumbnail})` : undefined, backgroundSize: `${tileWidth}px 100%`, backgroundRepeat: 'repeat-x', backgroundColor: '#1f2a26' }}
                    >
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-0.5 text-[9px]">
                        {info?.name}{item.clip.speed !== 1 ? ` · ${item.clip.speed}×` : ''}{item.clip.effect !== 'none' ? ` · ${EFFECTS.find(effect => effect.id === item.clip.effect)?.name}` : ''}
                      </span>
                      {item.clip.fadeIn ? <span className="pointer-events-none absolute left-0 top-0 h-full bg-gradient-to-r from-black/60 to-transparent" style={{ width: item.clip.fadeIn * zoom }} /> : null}
                      {item.clip.fadeOut ? <span className="pointer-events-none absolute right-0 top-0 h-full bg-gradient-to-l from-black/60 to-transparent" style={{ width: item.clip.fadeOut * zoom }} /> : null}
                      <span onPointerDown={event => trimClip(event, item.clip, 'in')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-primary/60" title="Drag to trim the start" />
                      <span onPointerDown={event => trimClip(event, item.clip, 'out')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-primary/60" title="Drag to trim the end" />
                    </div>
                  )
                })}
                {/* Transition handles between clips */}
                {placed.slice(0, -1).map(item => (
                  <button
                    key={`t-${item.clip.id}`}
                    type="button"
                    onClick={() => setSelection({ kind: 'transition', id: item.clip.id })}
                    title={`${TRANSITIONS.find(transition => transition.id === item.clip.transition.type)?.name}${item.clip.transition.type !== 'cut' ? ` · ${item.transitionOut.toFixed(2)}s` : ''}`}
                    className={`absolute top-[30px] z-10 flex h-5 w-5 -translate-x-1/2 rotate-45 items-center justify-center rounded-sm border text-[0px] ${selection?.kind === 'transition' && selection.id === item.clip.id ? 'border-white bg-primary' : item.clip.transition.type === 'cut' ? 'border-white/40 bg-[#26282d]' : 'border-primary/70 bg-[#173226]'}`}
                    style={{ left: (item.end - item.transitionOut / 2) * zoom }}
                  >
                    transition
                  </button>
                ))}
                {dropMarker?.track === 'video' ? <span className="pointer-events-none absolute inset-y-1 z-20 w-0.5 -translate-x-1/2 rounded bg-primary shadow-[0_0_10px_#9dfab0]" style={{ left: dropMarker.x }} /> : null}
              </div>

              {/* Titles */}
              <div className="relative h-[44px] border-b border-white/[0.04]" onPointerDown={event => { if (event.target === event.currentTarget) setSelection(null) }}>
                {project.titles.map(title => {
                  const selected = selection?.kind === 'title' && selection.id === title.id
                  return (
                    <div
                      key={title.id}
                      onPointerDown={event => {
                        setSelection({ kind: 'title', id: title.id })
                        const start = title.start
                        dragStart(event, dx => updateTitle(title.id, { start: snap(Math.max(0, start + dx), title.id) }, `drag:${title.id}`), `drag:${title.id}`)
                      }}
                      className={`absolute top-2 flex h-7 cursor-grab items-center truncate rounded-md border px-2 text-[10px] font-medium ${selected ? 'border-primary bg-primary/25' : 'border-[#c4a3ff]/40 bg-[#c4a3ff]/15'}`}
                      style={{ left: title.start * zoom, width: Math.max(16, title.duration * zoom) }}
                    >
                      {title.text.split('\n')[0]}
                      <span onPointerDown={event => { const duration = title.duration; dragStart(event, dx => updateTitle(title.id, { duration: Math.max(0.5, snap(title.start + duration + dx, title.id) - title.start) }, `len:${title.id}`), `len:${title.id}`) }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-primary/60" />
                    </div>
                  )
                })}
              </div>

              {(['music', 'sfx'] as const).map(lane => {
                const items = project.audio.filter(track => (track.lane ?? 'music') === lane)
                const tint = lane === 'music' ? 'border-[#ffb36b]/40 bg-[#ffb36b]/15' : 'border-[#7cc7ff]/45 bg-[#7cc7ff]/15'
                return (
                  <div
                    key={lane}
                    className="relative h-[44px]"
                    onPointerDown={event => { if (event.target === event.currentTarget) setSelection(null) }}
                    onDragOver={onTrackDragOver(lane)}
                    onDragLeave={event => { if (event.currentTarget === event.target) setDropMarker(null) }}
                    onDrop={onTrackDrop(lane)}
                  >
                    {!items.length ? <p className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[10px] text-muted-foreground">{lane === 'music' ? 'Drag music here' : 'Drag sound effects here'}</p> : null}
                    {items.map(track => {
                      const info = media.find(item => item.id === track.mediaId)
                      const selected = selection?.kind === 'audio' && selection.id === track.id
                      return (
                        <div
                          key={track.id}
                          onPointerDown={event => {
                            setSelection({ kind: 'audio', id: track.id })
                            const start = track.start
                            dragStart(event, dx => updateAudio(track.id, { start: snap(Math.max(0, start + dx), track.id) }, `drag:${track.id}`), `drag:${track.id}`)
                          }}
                          className={`absolute top-2 flex h-7 cursor-grab items-center truncate rounded-md border px-2 text-[10px] ${selected ? 'border-primary bg-primary/25' : tint}`}
                          style={{ left: track.start * zoom, width: Math.max(16, (track.out - track.in) * zoom) }}
                          title={`${info?.name ?? 'Audio'} · select it and press S to split at the playhead`}
                        >
                          {lane === 'music' ? '♪' : '⚡'} {info?.name}
                          <span onPointerDown={event => trimAudio(event, track, 'in')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-primary/60" title="Drag to trim the start" />
                          <span onPointerDown={event => trimAudio(event, track, 'out')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-primary/60" title="Drag to trim the end" />
                        </div>
                      )
                    })}
                    {dropMarker?.track === lane ? <span className="pointer-events-none absolute inset-y-1 z-20 w-0.5 -translate-x-1/2 rounded shadow-[0_0_10px_currentColor]" style={{ left: dropMarker.x, background: lane === 'music' ? '#ffb36b' : '#7cc7ff', color: lane === 'music' ? '#ffb36b' : '#7cc7ff' }} /> : null}
                  </div>
                )
              })}

              {/* Playhead */}
              <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-[#ff4fd8]" style={{ left: time * zoom }}>
                <span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-[#ff4fd8]" />
              </div>
            </div>
            </div>
          </div>
          <TimelineScrubber scroller={scrollerRef} left={scrollLeft} view={viewWidth} content={timelineWidth + GUTTER * 2} lane={timelineWidth} zoom={zoom} time={time} placed={placed} music={project.audio} />
          </div>
        </div>
      </div>
      <PageBar page={page} onChange={goToPage} />
    </main>
  )
}

/**
 * The video studio opens the project you were last working on (or a new one),
 * and reopens itself fresh whenever you switch project from the Media page.
 */
export default function VideoEditor() {
  const [projectId, setProjectId] = useState(() => {
    const opening = new URLSearchParams(window.location.search).has('open')
    const current = currentVideoProjectId()
    if (!opening && current && readVideoProject(current)) return current
    const fresh = blankVideoProject(opening ? 'Marketplace project' : 'Untitled video')
    saveVideoProject(fresh)
    setCurrentVideoProject(fresh.id)
    return fresh.id
  })
  const open = (id: string) => { setCurrentVideoProject(id); setProjectId(id) }
  const create = () => {
    const fresh = blankVideoProject(`Untitled video ${listVideoProjects().length + 1}`)
    saveVideoProject(fresh)
    open(fresh.id)
  }
  return <VideoStudio key={projectId} projectId={projectId} onOpenProject={open} onNewProject={create} />
}
