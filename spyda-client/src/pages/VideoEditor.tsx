import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clapperboard, Copy, Download, ImagePlus, Layers, Loader2, LogOut, Palette, Pause, Play, Plus, Sparkles, Trash2, Type, Upload, Wand2, X,
} from '../components/ui/icons'
import { EFFECTS, NEUTRAL_GRADE, TRANSITIONS, VideoRenderer, type ClipLayer, type EffectId, type Grade, type TransitionId } from '../lib/video/renderer'
import {
  FORMATS, activeAt, clipLength, formatTime, layout, makeClip, makeTitle, newId, sourceTime, splitAt, titleFrame,
  type AudioTrackItem, type Clip, type MediaItem, type Title, type TitleAnimation, type VideoProject,
} from '../lib/video/timeline'
import { BUNDLED_FAMILIES } from '../lib/fonts'

/**
 * Spyda's video editor: import clips, cut them on a timeline, grade them
 * (exposure to hue), add effects, transitions, titles and music, and export
 * an MP4 (WebM where MP4 is unavailable) with sound. Rendering runs on the GPU
 * in one shader pass per frame, so preview and export look the same.
 */

type Selection = { kind: 'clip' | 'title' | 'audio' | 'transition'; id: string } | null
type LeftTab = 'media' | 'effects' | 'transitions' | 'titles'

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
  { name: 'Lower third', patch: { text: 'Name Surname · Role', size: 0.05, y: 0.84, x: 0.32, background: true, animation: 'slide', weight: 600 } },
  { name: 'Caption', patch: { text: 'Say it in a caption', size: 0.055, y: 0.88, background: true, animation: 'fade', weight: 600 } },
  { name: 'Typewriter', patch: { text: 'Typed out, letter by letter', size: 0.06, y: 0.5, animation: 'typewriter', font: 'Space Grotesk', weight: 500 } },
  { name: 'Zoom headline', patch: { text: 'GRAND OPENING', size: 0.11, y: 0.42, animation: 'zoom', font: 'Bebas Neue', weight: 400, color: '#9DFAB0' } },
]

const TITLE_ANIMATIONS: TitleAnimation[] = ['fade', 'rise', 'pop', 'slide', 'zoom', 'typewriter']
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; format?: (value: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="w-[68px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} onDoubleClick={() => onChange(min < 0 ? 0 : min)} className="min-w-0 flex-1 accent-[#9dfab0]" aria-label={label} />
      <span className="w-9 text-right font-mono text-foreground/80">{format ? format(value) : Math.round(value * 100) / 100}</span>
    </label>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
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
        canvas.width = 160; canvas.height = Math.round(160 * image.naturalHeight / image.naturalWidth)
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
      element.currentTime = Math.min(0.5, duration / 3)
      element.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * element.videoHeight / Math.max(1, element.videoWidth)))
        canvas.getContext('2d')!.drawImage(element, 0, 0, canvas.width, canvas.height)
        resolve({ ...base, duration, width: element.videoWidth, height: element.videoHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.7) })
      }
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

export default function VideoEditor() {
  const navigate = useNavigate()
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(FORMATS[0])
  const [project, setProject] = useState<VideoProject>({ width: 1920, height: 1080, clips: [], titles: [], audio: [] })
  const [media, setMedia] = useState<MediaItem[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<LeftTab>('media')
  const [zoom, setZoom] = useState(70)
  const [exporting, setExporting] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dropping, setDropping] = useState(false)

  const outputRef = useRef<HTMLCanvasElement | null>(null)
  const glCanvas = useRef<HTMLCanvasElement | null>(null)
  const renderer = useRef<VideoRenderer | null>(null)
  const elements = useRef(new Map<string, HTMLVideoElement | HTMLImageElement>())
  const musicElements = useRef(new Map<string, HTMLAudioElement>())
  const audio = useRef<{ context: AudioContext; recorder: MediaStreamAudioDestinationNode; gains: Map<HTMLMediaElement, GainNode> } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const lastSeek = useRef(new WeakMap<HTMLMediaElement, number>())
  const clock = useRef({ startedAt: 0, from: 0 })
  const projectRef = useRef(project)
  projectRef.current = project
  const mediaRef = useRef(media)
  mediaRef.current = media
  const timeRef = useRef(time)
  timeRef.current = time

  const { placed, total } = useMemo(() => layout(project.clips), [project.clips])
  const placedRef = useRef(placed)
  placedRef.current = placed
  const end = Math.max(total, ...project.titles.map(title => title.start + title.duration), 0)

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
    const layerOf = (item: NonNullable<typeof a>): ClipLayer | null => {
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
      }
    }
    const la = a ? layerOf(a) : null
    const lb = b ? layerOf(b) : null
    // A clip still decoding (just seeked) keeps the last good frame rather than flashing black.
    if (a && !la) { /* keep the previous picture */ }
    else gl.draw(la, la && lb ? lb : null, a?.clip.transition.type ?? 'cut', progress)
    const context = output.getContext('2d')!
    context.drawImage(glCanvas.current, 0, 0, output.width, output.height)

    // Titles, drawn over the picture with their entrance and exit.
    for (const title of projectRef.current.titles) {
      const frame = titleFrame(title, t)
      if (!frame || frame.opacity <= 0.001) continue
      const H = output.height, W = output.width
      const size = title.size * H * frame.scale
      context.save()
      context.globalAlpha = frame.opacity
      context.font = `${title.weight} ${size}px "${title.font}", sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const text = title.text.slice(0, Math.ceil(title.text.length * frame.reveal))
      const x = (title.x + frame.dx) * W, y = (title.y + frame.dy) * H
      const lines = text.split('\n')
      if (title.background) {
        const width = Math.max(...lines.map(line => context.measureText(line).width)) + size * 0.9
        const height = lines.length * size * 1.2 + size * 0.5
        context.fillStyle = 'rgba(0,0,0,0.55)'
        context.beginPath()
        context.roundRect(x - width / 2, y - height / 2, width, height, size * 0.3)
        context.fill()
      }
      context.fillStyle = title.color
      context.shadowColor = 'rgba(0,0,0,0.45)'
      context.shadowBlur = size * 0.15
      lines.forEach((line, index) => context.fillText(line, x, y + (index - (lines.length - 1) / 2) * size * 1.2))
      context.restore()
    }
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
      route(element, item.clip.muted ? 0 : item.clip.volume)
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
      const on = local >= 0 && local < item.duration
      if (!on) { if (!element.paused) element.pause(); continue }
      route(element, track.volume)
      if (play) {
        if (Math.abs(element.currentTime - local) > 0.3) element.currentTime = local
        if (element.paused) void element.play().catch(() => undefined)
      } else {
        if (!element.paused) element.pause()
        element.currentTime = local
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

  const seek = (t: number) => {
    const next = Math.max(0, Math.min(end, t))
    if (playing) clock.current = { startedAt: performance.now(), from: next }
    setTime(next)
  }

  /* ── editing ─────────────────────────────────────────────────────── */

  const updateClip = (id: string, patch: Partial<Clip> | ((clip: Clip) => Partial<Clip>)) => setProject(current => ({
    ...current,
    clips: current.clips.map(clip => (clip.id === id ? { ...clip, ...(typeof patch === 'function' ? patch(clip) : patch) } : clip)),
  }))
  const updateTitle = (id: string, patch: Partial<Title>) => setProject(current => ({ ...current, titles: current.titles.map(title => (title.id === id ? { ...title, ...patch } : title)) }))
  const updateAudio = (id: string, patch: Partial<AudioTrackItem>) => setProject(current => ({ ...current, audio: current.audio.map(item => (item.id === id ? { ...item, ...patch } : item)) }))

  const addToTimeline = (item: MediaItem) => {
    if (item.kind === 'audio') {
      const track: AudioTrackItem = { id: newId('audio'), mediaId: item.id, start: 0, volume: 0.8 }
      setProject(current => ({ ...current, audio: [...current.audio, track] }))
      setSelection({ kind: 'audio', id: track.id })
      return
    }
    const clip = makeClip(item)
    setProject(current => ({ ...current, clips: [...current.clips, clip] }))
    setSelection({ kind: 'clip', id: clip.id })
  }

  const importFiles = async (files: File[]) => {
    const usable = files.filter(file => /^(video|image|audio)\//.test(file.type))
    if (!usable.length) { setNotice('Add video (MP4, WebM, MOV), image or audio files.'); return }
    setImporting(true)
    try {
      for (const file of usable) {
        const item = await readMedia(file)
        setMedia(current => [...current, item])
        mediaRef.current = [...mediaRef.current, item]
        // The first footage goes straight onto the timeline, so there is something to edit at once.
        if (item.kind !== 'audio' && !projectRef.current.clips.length) addToTimeline(item)
      }
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be opened.')
    } finally {
      setImporting(false)
    }
  }

  const removeSelected = () => {
    if (!selection) return
    if (selection.kind === 'clip') {
      elements.current.get(selection.id)?.removeAttribute('src')
      elements.current.delete(selection.id)
      setProject(current => ({ ...current, clips: current.clips.filter(clip => clip.id !== selection.id) }))
    }
    if (selection.kind === 'title') setProject(current => ({ ...current, titles: current.titles.filter(title => title.id !== selection.id) }))
    if (selection.kind === 'audio') {
      musicElements.current.get(selection.id)?.pause()
      setProject(current => ({ ...current, audio: current.audio.filter(item => item.id !== selection.id) }))
    }
    setSelection(null)
  }

  const split = () => {
    const next = splitAt(project.clips, time)
    if (!next) { setNotice('Move the playhead inside a clip to split it.'); return }
    setProject(current => ({ ...current, clips: next }))
  }

  const duplicateClip = (id: string) => setProject(current => {
    const index = current.clips.findIndex(clip => clip.id === id)
    if (index < 0) return current
    const copy = { ...structuredClone(current.clips[index]), id: newId('clip') }
    const clips = [...current.clips]
    clips.splice(index + 1, 0, copy)
    return { ...current, clips }
  })

  const moveClip = (from: number, to: number) => setProject(current => {
    if (to < 0 || to >= current.clips.length || from === to) return current
    const clips = [...current.clips]
    const [moved] = clips.splice(from, 1)
    clips.splice(to, 0, moved)
    return { ...current, clips }
  })

  const addTitle = (patch: Partial<Title> = {}) => {
    const title = { ...makeTitle(time, project.width, project.height), ...patch }
    setProject(current => ({ ...current, titles: [...current.titles, title] }))
    setSelection({ kind: 'title', id: title.id })
  }

  const selectedClip = selection?.kind === 'clip' || selection?.kind === 'transition' ? project.clips.find(clip => clip.id === selection.id) ?? null : null
  const selectedTitle = selection?.kind === 'title' ? project.titles.find(title => title.id === selection.id) ?? null : null
  const selectedAudio = selection?.kind === 'audio' ? project.audio.find(item => item.id === selection.id) ?? null : null
  const target = selectedClip ?? (placed.length ? activeAt(placed, time).a?.clip ?? null : null)

  /* ── export ──────────────────────────────────────────────────────── */

  const exportVideo = async () => {
    const output = outputRef.current
    if (!output || !placed.length || exporting != null) return
    if (typeof MediaRecorder === 'undefined') { setNotice('This browser cannot record video. Try Chrome or Edge.'); return }
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(candidate => MediaRecorder.isTypeSupported(candidate))
    if (!type) { setNotice('This browser cannot record video.'); return }
    stop()
    setSelection(null)
    setExporting(0)
    // Make sure the sound graph exists before recording starts.
    for (const item of placed) { const element = elementFor(item.clip); if (element instanceof HTMLVideoElement) route(element, item.clip.muted ? 0 : item.clip.volume) }
    await sync(0, false)
    draw(0)
    const stream = output.captureStream(30)
    const recorderAudio = audio.current?.recorder.stream.getAudioTracks() ?? []
    for (const track of recorderAudio) stream.addTrack(track)
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: project.width * project.height > 1_500_000 ? 16_000_000 : 10_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    recorder.start(250)
    const startedAt = performance.now()
    await sync(0, true)
    await new Promise<void>(resolve => {
      const frame = () => {
        const t = (performance.now() - startedAt) / 1000
        if (t >= end) { resolve(); return }
        void sync(t, true)
        draw(t)
        setExporting(t / end)
        setTime(t)
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    recorder.stop()
    await finished
    stop()
    for (const track of recorderAudio) stream.removeTrack(track)
    setExporting(null)
    const blob = new Blob(chunks, { type: type.split(';')[0] })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `spyda-video-${format.id}.${type.includes('mp4') ? 'mp4' : 'webm'}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000)
    setNotice(`Exported a ${formatTime(end)} ${type.includes('mp4') ? 'MP4' : 'WebM'} at ${project.width} × ${project.height}.`)
  }

  /* ── keyboard ────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement | null)?.tagName ?? '')
      if (typing || exporting != null) return
      if (event.key === ' ') { event.preventDefault(); if (playing) stop(); else play() }
      if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); split() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); seek(timeRef.current - (event.shiftKey ? 1 : 1 / 30)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); seek(timeRef.current + (event.shiftKey ? 1 : 1 / 30)) }
      if (event.key === 'Home') { event.preventDefault(); seek(0) }
      if (event.key === 'End') { event.preventDefault(); seek(end) }
      if (event.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ── timeline dragging (trim edges, move titles and music) ────────── */

  const dragStart = (event: ReactPointerEvent, apply: (dx: number) => void) => {
    event.preventDefault()
    event.stopPropagation()
    const x0 = event.clientX
    const move = (moveEvent: PointerEvent) => apply((moveEvent.clientX - x0) / zoom)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const trimClip = (event: ReactPointerEvent, clip: Clip, side: 'in' | 'out') => {
    const info = mediaFor(clip)
    const start = { in: clip.in, out: clip.out }
    const limit = info?.kind === 'image' ? 600 : info?.duration ?? clip.out
    dragStart(event, dx => {
      const delta = dx * clip.speed
      if (side === 'in') updateClip(clip.id, { in: Math.min(start.out - 0.2, Math.max(0, start.in + delta)) })
      else updateClip(clip.id, { out: Math.max(start.in + 0.2, Math.min(limit, start.out + delta)) })
    })
  }

  const dragIndex = useRef<number | null>(null)
  const timelineWidth = Math.max(end + 6, 20) * zoom

  /* ── layout ──────────────────────────────────────────────────────── */

  const tabs: Array<{ id: LeftTab; label: string; icon: typeof Layers }> = [
    { id: 'media', label: 'Media', icon: ImagePlus },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Layers },
    { id: 'titles', label: 'Titles', icon: Type },
  ]

  return (
    <main
      className="flex h-[100dvh] flex-col overflow-hidden bg-[#0b0c0e] text-foreground"
      onDragOver={event => { event.preventDefault(); setDropping(true) }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDropping(false) }}
      onDrop={event => { event.preventDefault(); setDropping(false); void importFiles([...event.dataTransfer.files]) }}
    >
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#111214] px-2">
        <button type="button" onClick={() => navigate('/workspace')} aria-label="Back to Spyda AI" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08]">
          <img src="/assets/spyda-logo.png" alt="" className="h-5 w-5 object-contain" />
        </button>
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <h1 className="text-[13px] font-semibold">Video editor</h1>
        </div>
        <div role="tablist" aria-label="Editor" className="ml-3 hidden items-center gap-0.5 rounded-lg bg-black/30 p-0.5 sm:flex">
          <button type="button" role="tab" aria-selected="false" onClick={() => { let back = '/editor/new'; try { back = window.sessionStorage.getItem('spyda.lastCanvas') || back } catch { /* storage off */ } navigate(back) }} title="Switch to Canvas mode" className="inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <Palette className="h-3 w-3" /> Design
          </button>
          <button type="button" role="tab" aria-selected="true" className="inline-flex h-6 items-center gap-1.5 rounded-md bg-white/[0.1] px-2.5 text-[11px] font-semibold">
            <Clapperboard className="h-3 w-3 text-primary" /> Video
          </button>
        </div>
        <select value={format.id} onChange={event => setFormat(FORMATS.find(item => item.id === event.target.value) ?? FORMATS[0])} aria-label="Video size" className="ml-3 h-7 rounded-md bg-white/[0.06] px-2 text-[11px] outline-none">
          {FORMATS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => navigate('/workspace')} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.1] px-3 text-[11px] font-semibold hover:bg-white/[0.08]">
            <LogOut className="h-3.5 w-3.5" /> Done
          </button>
          <button type="button" onClick={() => { void exportVideo() }} disabled={!placed.length || exporting != null} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">
            {exporting != null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting != null ? `Exporting ${Math.round(exporting * 100)}%` : 'Export video'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: media, effects, transitions, titles */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#111214]">
          <div role="tablist" className="grid grid-cols-4 gap-0.5 border-b border-white/[0.06] p-1">
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
                <div className="grid grid-cols-2 gap-2">
                  {media.map(item => (
                    <button key={item.id} type="button" onClick={() => addToTimeline(item)} title={`Add ${item.name} to the timeline`} className="group overflow-hidden rounded-lg border border-white/[0.08] bg-black/30 text-left hover:border-primary/50">
                      <span className="relative block aspect-video bg-[#16171a]">
                        {item.thumbnail ? <img src={item.thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">♪ Audio</span>}
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[9px]">{item.kind === 'image' ? 'Image' : formatTime(item.duration)}</span>
                        <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex"><Plus className="h-5 w-5" /></span>
                      </span>
                      <span className="block truncate px-1.5 py-1 text-[10px]">{item.name}</span>
                    </button>
                  ))}
                </div>
                {!media.length ? <p className="text-[10px] leading-4 text-muted-foreground">Imported files stay on this device. Click one to add it to the end of the timeline.</p> : null}
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
                <button type="button" disabled={project.clips.length < 2 || !target} onClick={() => target && setProject(current => ({ ...current, clips: current.clips.map(clip => ({ ...clip, transition: { ...target.transition } })) }))} className="mt-2 h-8 w-full rounded-md bg-white/[0.06] text-[11px] font-semibold hover:bg-white/[0.1] disabled:opacity-40">Use on every cut</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button type="button" onClick={() => addTitle()} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Add title at playhead</button>
                {TITLE_PRESETS.map(preset => (
                  <button key={preset.name} type="button" onClick={() => addTitle(preset.patch)} className="block w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left hover:border-primary/40">
                    <span className="block text-[12px] font-semibold" style={{ fontFamily: preset.patch.font }}>{preset.name}</span>
                    <span className="block text-[10px] capitalize text-muted-foreground">{preset.patch.animation} in</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Centre: preview and transport */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#16171a] p-4">
            <canvas
              ref={node => {
                outputRef.current = node
                if (node && node.width !== format.width) { node.width = format.width; node.height = format.height }
              }}
              className="max-h-full max-w-full rounded-md bg-black shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
              style={{ aspectRatio: `${format.width} / ${format.height}` }}
              onClick={() => (playing ? stop() : play())}
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
            {exporting != null ? (
              <div className="absolute inset-x-0 bottom-4 mx-auto w-80 rounded-xl border border-white/[0.1] bg-black/80 p-3 text-center backdrop-blur">
                <p className="text-[12px] font-semibold">Exporting your video…</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(exporting * 100)}%` }} /></div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">It records in real time, with sound. Keep this tab open.</p>
              </div>
            ) : null}
          </div>
          <div className="flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.06] bg-[#111214] px-3">
            <button type="button" onClick={() => seek(0)} aria-label="Go to start" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground">⏮</button>
            <button type="button" onClick={() => (playing ? stop() : play())} disabled={!placed.length} aria-label={playing ? 'Pause' : 'Play'} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button type="button" onClick={() => seek(end)} aria-label="Go to end" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground">⏭</button>
            <span className="ml-1 font-mono text-[11px]"><span className="text-foreground">{formatTime(time)}</span><span className="text-muted-foreground"> / {formatTime(end)}</span></span>
            <span className="mx-2 h-5 w-px bg-white/10" />
            <button type="button" onClick={split} disabled={!placed.length} title="Split at playhead (S)" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium hover:bg-white/[0.08] disabled:opacity-40"><ScissorsGlyph /> Split</button>
            <button type="button" onClick={() => addTitle()} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium hover:bg-white/[0.08]"><Type className="h-3.5 w-3.5" /> Title</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium hover:bg-white/[0.08]"><Plus className="h-3.5 w-3.5" /> Media</button>
            <label className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
              Zoom
              <input type="range" min={20} max={240} value={zoom} onChange={event => setZoom(Number(event.target.value))} className="w-28 accent-[#9dfab0]" aria-label="Timeline zoom" />
            </label>
          </div>
        </section>

        {/* Right: inspector */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[#111214]">
          {selectedClip && selection?.kind === 'clip' ? (() => {
            const clip = selectedClip
            const info = mediaFor(clip)
            const index = project.clips.findIndex(item => item.id === clip.id)
            return (
              <>
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
                  {info?.thumbnail ? <img src={info.thumbnail} alt="" className="h-9 w-14 rounded object-cover" /> : null}
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
                    <span className="w-[68px]">Speed</span>
                    <div className="flex flex-1 flex-wrap gap-1">
                      {SPEEDS.map(speed => <button key={speed} type="button" onClick={() => updateClip(clip.id, { speed })} className={`h-6 rounded px-1.5 text-[10px] ${clip.speed === speed ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{speed}×</button>)}
                    </div>
                  </div>
                  {info?.kind === 'video' ? (
                    <>
                      <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.01} onChange={volume => updateClip(clip.id, { volume })} format={value => `${Math.round(value * 100)}%`} />
                      <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={clip.muted} onChange={event => updateClip(clip.id, { muted: event.target.checked })} className="accent-[#9dfab0]" /> Mute this clip</label>
                    </>
                  ) : null}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-[68px]">Framing</span>
                    {(['cover', 'contain'] as const).map(fit => <button key={fit} type="button" onClick={() => updateClip(clip.id, { fit })} className={`h-6 flex-1 rounded text-[10px] ${clip.fit === fit ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{fit === 'cover' ? 'Fill frame' : 'Fit inside'}</button>)}
                  </div>
                </Section>
                <Section title="Colour" action={<button type="button" onClick={() => updateClip(clip.id, { grade: { ...NEUTRAL_GRADE } })} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>}>
                  <div className="mb-1.5 grid grid-cols-4 gap-1">
                    {GRADE_PRESETS.map(preset => <button key={preset.name} type="button" onClick={() => updateClip(clip.id, { grade: { ...NEUTRAL_GRADE, ...preset.grade } })} className="h-7 rounded bg-white/[0.05] px-1 text-[9px] font-medium hover:bg-white/[0.1]">{preset.name}</button>)}
                  </div>
                  {GRADE_CONTROLS.map(control => (
                    <Slider key={control.key} label={control.label} value={clip.grade[control.key]} min={control.min} max={control.max} step={control.step} onChange={value => updateClip(clip.id, current => ({ grade: { ...current.grade, [control.key]: value } }))} />
                  ))}
                  <p className="text-[9px] text-muted-foreground">Double-click a slider to reset it.</p>
                </Section>
                <Section title="Effect">
                  <select value={clip.effect} onChange={event => updateClip(clip.id, { effect: event.target.value as EffectId })} className="h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] outline-none">
                    {EFFECTS.map(effect => <option key={effect.id} value={effect.id}>{effect.name}</option>)}
                  </select>
                  {clip.effect !== 'none' ? <Slider label="Intensity" value={clip.amount} min={0} max={1} step={0.01} onChange={amount => updateClip(clip.id, { amount })} format={value => `${Math.round(value * 100)}%`} /> : null}
                </Section>
                {index < project.clips.length - 1 ? (
                  <Section title="Transition to next">
                    <select value={clip.transition.type} onChange={event => updateClip(clip.id, current => ({ transition: { type: event.target.value as TransitionId, duration: event.target.value === 'cut' ? 0 : current.transition.duration || 0.6 } }))} className="h-7 w-full rounded-md bg-white/[0.05] px-2 text-[11px] outline-none">
                      {TRANSITIONS.map(transition => <option key={transition.id} value={transition.id}>{transition.name}</option>)}
                    </select>
                    {clip.transition.type !== 'cut' ? <Slider label="Duration" value={clip.transition.duration} min={0.1} max={2.5} step={0.05} onChange={duration => updateClip(clip.id, current => ({ transition: { ...current.transition, duration } }))} format={value => `${value.toFixed(2)}s`} /> : null}
                  </Section>
                ) : null}
                <Section title="Arrange">
                  <div className="grid grid-cols-4 gap-1">
                    <button type="button" onClick={() => moveClip(index, index - 1)} disabled={index === 0} title="Move earlier" className="h-8 rounded bg-white/[0.05] text-[11px] hover:bg-white/[0.1] disabled:opacity-30">◀</button>
                    <button type="button" onClick={() => moveClip(index, index + 1)} disabled={index === project.clips.length - 1} title="Move later" className="h-8 rounded bg-white/[0.05] text-[11px] hover:bg-white/[0.1] disabled:opacity-30">▶</button>
                    <button type="button" onClick={() => duplicateClip(clip.id)} title="Duplicate" aria-label="Duplicate clip" className="flex h-8 items-center justify-center rounded bg-white/[0.05] hover:bg-white/[0.1]"><Copy className="h-3.5 w-3.5" /></button>
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
              {selectedClip.transition.type !== 'cut' ? <Slider label="Duration" value={selectedClip.transition.duration} min={0.1} max={2.5} step={0.05} onChange={duration => updateClip(selectedClip.id, current => ({ transition: { ...current.transition, duration } }))} format={value => `${value.toFixed(2)}s`} /> : null}
            </Section>
          ) : selectedTitle ? (
            <>
              <Section title="Title">
                <textarea value={selectedTitle.text} onChange={event => updateTitle(selectedTitle.id, { text: event.target.value })} rows={2} className="w-full rounded-md bg-white/[0.05] px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-primary/60" />
                <div className="grid grid-cols-2 gap-1.5">
                  <select value={selectedTitle.font} onChange={event => updateTitle(selectedTitle.id, { font: event.target.value })} className="h-7 rounded-md bg-white/[0.05] px-2 text-[11px] outline-none">
                    {BUNDLED_FAMILIES.map(font => <option key={font.family} value={font.family}>{font.family}</option>)}
                  </select>
                  <select value={selectedTitle.weight} onChange={event => updateTitle(selectedTitle.id, { weight: Number(event.target.value) })} className="h-7 rounded-md bg-white/[0.05] px-2 text-[11px] outline-none">
                    {[400, 500, 600, 700, 800].map(weight => <option key={weight} value={weight}>{weight}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[68px]">Colour</span><input type="color" value={selectedTitle.color} onChange={event => updateTitle(selectedTitle.id, { color: event.target.value.toUpperCase() })} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" /><span className="font-mono text-foreground/80">{selectedTitle.color}</span></label>
                <Slider label="Size" value={selectedTitle.size} min={0.02} max={0.25} step={0.005} onChange={size => updateTitle(selectedTitle.id, { size })} format={value => `${Math.round(value * 100)}%`} />
                <Slider label="Across" value={selectedTitle.x} min={0} max={1} step={0.01} onChange={x => updateTitle(selectedTitle.id, { x })} format={value => `${Math.round(value * 100)}%`} />
                <Slider label="Down" value={selectedTitle.y} min={0} max={1} step={0.01} onChange={y => updateTitle(selectedTitle.id, { y })} format={value => `${Math.round(value * 100)}%`} />
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={selectedTitle.background} onChange={event => updateTitle(selectedTitle.id, { background: event.target.checked })} className="accent-[#9dfab0]" /> Background pill</label>
              </Section>
              <Section title="Timing & animation">
                <div className="grid grid-cols-3 gap-1">
                  {TITLE_ANIMATIONS.map(animation => <button key={animation} type="button" onClick={() => updateTitle(selectedTitle.id, { animation })} className={`h-7 rounded text-[10px] capitalize ${selectedTitle.animation === animation ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{animation}</button>)}
                </div>
                <Slider label="Starts at" value={selectedTitle.start} min={0} max={Math.max(1, end)} step={0.05} onChange={start => updateTitle(selectedTitle.id, { start })} format={formatTime} />
                <Slider label="Lasts" value={selectedTitle.duration} min={0.5} max={20} step={0.1} onChange={duration => updateTitle(selectedTitle.id, { duration })} format={value => `${value.toFixed(1)}s`} />
                <button type="button" onClick={removeSelected} className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /> Delete title</button>
              </Section>
            </>
          ) : selectedAudio ? (
            <Section title="Music">
              <p className="truncate text-[12px] font-semibold">{media.find(item => item.id === selectedAudio.mediaId)?.name}</p>
              <Slider label="Volume" value={selectedAudio.volume} min={0} max={1.5} step={0.01} onChange={volume => updateAudio(selectedAudio.id, { volume })} format={value => `${Math.round(value * 100)}%`} />
              <Slider label="Starts at" value={selectedAudio.start} min={0} max={Math.max(1, end)} step={0.05} onChange={start => updateAudio(selectedAudio.id, { start })} format={formatTime} />
              <button type="button" onClick={removeSelected} className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /> Remove music</button>
            </Section>
          ) : (
            <div className="space-y-3 p-4 text-[11px] leading-5 text-muted-foreground">
              <p className="flex items-center gap-2 text-[12px] font-semibold text-foreground"><Wand2 className="h-4 w-4 text-primary" /> Edit like a pro</p>
              <p>Select a clip to trim it, change its speed and sound, grade its colour and give it an effect. Click a ◆ between clips to choose the transition.</p>
              <ul className="space-y-1 text-[10px]">
                <li><b className="text-foreground">Space</b> play · <b className="text-foreground">S</b> split · <b className="text-foreground">Del</b> delete</li>
                <li><b className="text-foreground">← →</b> one frame · <b className="text-foreground">Shift</b> one second</li>
                <li>Drag a clip's edges to trim, drag clips to reorder</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Timeline */}
      <div className="h-[208px] shrink-0 border-t border-white/[0.06] bg-[#0f1012]">
        <div className="flex h-full">
          <div className="w-[92px] shrink-0 border-r border-white/[0.06] pt-6 text-[10px] text-muted-foreground">
            <p className="flex h-[78px] items-center gap-1.5 px-3"><Clapperboard className="h-3.5 w-3.5" /> Video</p>
            <p className="flex h-[44px] items-center gap-1.5 px-3"><Type className="h-3.5 w-3.5" /> Titles</p>
            <p className="flex h-[44px] items-center gap-1.5 px-3">♪ Music</p>
          </div>
          <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="relative h-full" style={{ width: timelineWidth }}>
              {/* Ruler: click or drag to move the playhead. */}
              <div
                className="sticky top-0 h-6 cursor-pointer border-b border-white/[0.06] bg-[#111214]"
                onPointerDown={event => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  seek((event.clientX - rect.left) / zoom)
                  dragStart(event, dx => seek((event.clientX - rect.left) / zoom + dx))
                }}
              >
                {Array.from({ length: Math.ceil(timelineWidth / zoom) + 1 }, (_, second) => (
                  <span key={second} className="absolute top-0 h-full border-l border-white/[0.08] pl-1 font-mono text-[9px] text-muted-foreground" style={{ left: second * zoom }}>
                    {second % (zoom < 40 ? 5 : zoom < 90 ? 2 : 1) === 0 ? formatTime(second).replace(/\.0$/, '') : ''}
                  </span>
                ))}
              </div>

              {/* Video track */}
              <div className="relative h-[78px] border-b border-white/[0.04]" onPointerDown={event => { if (event.target === event.currentTarget) setSelection(null) }}>
                {placed.map(item => {
                  const info = mediaFor(item.clip)
                  const selected = selection?.kind === 'clip' && selection.id === item.clip.id
                  return (
                    <div
                      key={item.clip.id}
                      draggable
                      onDragStart={() => { dragIndex.current = item.index }}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => { event.preventDefault(); event.stopPropagation(); if (dragIndex.current != null) moveClip(dragIndex.current, item.index); dragIndex.current = null }}
                      onClick={() => setSelection({ kind: 'clip', id: item.clip.id })}
                      className={`absolute top-2 h-[62px] cursor-pointer overflow-hidden rounded-md border-2 ${selected ? 'border-primary' : 'border-white/[0.12] hover:border-white/30'}`}
                      style={{ left: item.start * zoom, width: Math.max(8, item.length * zoom), backgroundImage: info?.thumbnail ? `url(${info.thumbnail})` : undefined, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', backgroundColor: '#1f2a26' }}
                    >
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-0.5 text-[9px]">
                        {info?.name}{item.clip.speed !== 1 ? ` · ${item.clip.speed}×` : ''}{item.clip.effect !== 'none' ? ` · ${EFFECTS.find(effect => effect.id === item.clip.effect)?.name}` : ''}
                      </span>
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
              </div>

              {/* Titles */}
              <div className="relative h-[44px] border-b border-white/[0.04]">
                {project.titles.map(title => {
                  const selected = selection?.kind === 'title' && selection.id === title.id
                  return (
                    <div
                      key={title.id}
                      onPointerDown={event => {
                        setSelection({ kind: 'title', id: title.id })
                        const start = title.start
                        dragStart(event, dx => updateTitle(title.id, { start: Math.max(0, start + dx) }))
                      }}
                      className={`absolute top-2 flex h-7 cursor-grab items-center truncate rounded-md border px-2 text-[10px] font-medium ${selected ? 'border-primary bg-primary/25' : 'border-[#c4a3ff]/40 bg-[#c4a3ff]/15'}`}
                      style={{ left: title.start * zoom, width: Math.max(16, title.duration * zoom) }}
                    >
                      {title.text}
                      <span onPointerDown={event => { const duration = title.duration; dragStart(event, dx => updateTitle(title.id, { duration: Math.max(0.5, duration + dx) })) }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-primary/60" />
                    </div>
                  )
                })}
              </div>

              {/* Music */}
              <div className="relative h-[44px]">
                {project.audio.map(track => {
                  const info = media.find(item => item.id === track.mediaId)
                  const selected = selection?.kind === 'audio' && selection.id === track.id
                  return (
                    <div
                      key={track.id}
                      onPointerDown={event => {
                        setSelection({ kind: 'audio', id: track.id })
                        const start = track.start
                        dragStart(event, dx => updateAudio(track.id, { start: Math.max(0, start + dx) }))
                      }}
                      className={`absolute top-2 flex h-7 cursor-grab items-center truncate rounded-md border px-2 text-[10px] ${selected ? 'border-primary bg-primary/25' : 'border-[#ffb36b]/40 bg-[#ffb36b]/15'}`}
                      style={{ left: track.start * zoom, width: Math.max(16, (info?.duration ?? 1) * zoom) }}
                    >
                      ♪ {info?.name}
                    </div>
                  )
                })}
              </div>

              {/* Playhead */}
              <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[#ff4fd8]" style={{ left: time * zoom }}>
                <span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-[#ff4fd8]" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => navigate('/workspace')} className="sr-only"><ArrowLeft className="h-3 w-3" /> Back</button>
    </main>
  )
}
