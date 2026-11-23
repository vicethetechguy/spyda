import { NEUTRAL_GRADE, type EffectId, type Grade, type TransitionId } from './renderer'

/**
 * The video editor's timeline: a main track of clips (video or still image)
 * joined by transitions, a title track and a music track. Pure data and
 * maths; the editor page owns the media elements and the clock.
 */

export type MediaKind = 'video' | 'image' | 'audio'

export type MediaItem = {
  id: string
  name: string
  kind: MediaKind
  url: string
  duration: number
  width: number
  height: number
  thumbnail: string | null
}

export type Clip = {
  id: string
  mediaId: string
  /** Trim, in seconds of the source. */
  in: number
  out: number
  speed: number
  volume: number
  muted: boolean
  fit: 'cover' | 'contain'
  grade: Grade
  effect: EffectId
  amount: number
  /** How this clip hands over to the next one. */
  transition: { type: TransitionId; duration: number }
}

export type TitleAnimation = 'fade' | 'rise' | 'pop' | 'slide' | 'typewriter' | 'zoom'

export type Title = {
  id: string
  text: string
  start: number
  duration: number
  /** Centre, as a fraction of the frame. */
  x: number
  y: number
  /** Font size as a fraction of the frame height. */
  size: number
  color: string
  font: string
  weight: number
  animation: TitleAnimation
  /** A soft pill behind the text, for legibility over busy footage. */
  background: boolean
}

export type AudioTrackItem = { id: string; mediaId: string; start: number; volume: number }

export type VideoProject = {
  width: number
  height: number
  clips: Clip[]
  titles: Title[]
  audio: AudioTrackItem[]
}

export const FORMATS = [
  { id: 'landscape', name: '16:9 · 1920 × 1080', width: 1920, height: 1080 },
  { id: 'portrait', name: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  { id: 'square', name: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { id: 'post', name: '4:5 · 1080 × 1350', width: 1080, height: 1350 },
] as const

export const IMAGE_DURATION = 4

export function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`
}

export function makeClip(media: MediaItem): Clip {
  return {
    id: newId('clip'),
    mediaId: media.id,
    in: 0,
    out: media.kind === 'image' ? IMAGE_DURATION : media.duration,
    speed: 1,
    volume: 1,
    muted: false,
    fit: 'cover',
    grade: { ...NEUTRAL_GRADE },
    effect: 'none',
    amount: 0.7,
    transition: { type: 'crossfade', duration: 0.6 },
  }
}

export function makeTitle(start: number, width: number, height: number): Title {
  return {
    id: newId('title'),
    text: 'Your title',
    start,
    duration: 3,
    x: 0.5,
    y: width >= height ? 0.78 : 0.7,
    size: 0.085,
    color: '#FFFFFF',
    font: 'Space Grotesk',
    weight: 700,
    animation: 'rise',
    background: false,
  }
}

/** A clip's length on the timeline, after trim and speed. */
export function clipLength(clip: Clip) {
  return Math.max(0.1, (clip.out - clip.in) / clip.speed)
}

export type Placed = { clip: Clip; index: number; start: number; end: number; length: number; transitionIn: number; transitionOut: number }

/**
 * Where every clip sits. A transition overlaps the end of one clip with the
 * start of the next, so the timeline is shorter than the clips laid end to end.
 */
export function layout(clips: Clip[]): { placed: Placed[]; total: number } {
  const placed: Placed[] = []
  let cursor = 0
  clips.forEach((clip, index) => {
    const length = clipLength(clip)
    const next = clips[index + 1]
    const out = next && clip.transition.type !== 'cut'
      ? Math.min(clip.transition.duration, length / 2, clipLength(next) / 2)
      : 0
    const transitionIn = index > 0 ? placed[index - 1].transitionOut : 0
    const start = cursor - transitionIn
    placed.push({ clip, index, start, end: start + length, length, transitionIn, transitionOut: out })
    cursor = start + length
  })
  return { placed, total: Math.max(0, cursor) }
}

/** What is on screen at `t`: one clip, or two in a transition (with its progress). */
export function activeAt(placed: Placed[], t: number) {
  const on = placed.filter(item => t >= item.start && t < item.end)
  if (!on.length) {
    const last = placed[placed.length - 1]
    return last && t >= last.end ? { a: last, b: null, progress: 0 } : { a: null, b: null, progress: 0 }
  }
  if (on.length === 1) return { a: on[0], b: null, progress: 0 }
  const [a, b] = on
  return { a, b, progress: a.transitionOut ? (t - b.start) / a.transitionOut : 1 }
}

/** The source time a placed clip shows at timeline time `t`. */
export function sourceTime(item: Placed, t: number) {
  return Math.min(item.clip.out, Math.max(item.clip.in, item.clip.in + (t - item.start) * item.clip.speed))
}

/** A title's visibility (0..1), offset and scale at `t`, for its entrance and exit. */
export function titleFrame(title: Title, t: number) {
  const local = t - title.start
  if (local < 0 || local > title.duration) return null
  const edge = Math.min(0.5, title.duration / 3)
  const p = Math.min(1, local / edge)
  const q = Math.min(1, (title.duration - local) / edge)
  const ease = (x: number) => 1 - (1 - x) ** 3
  const inP = ease(p), outP = ease(q)
  const shown = Math.min(inP, outP)
  const frame = { opacity: shown, dx: 0, dy: 0, scale: 1, reveal: 1 }
  switch (title.animation) {
    case 'rise': frame.dy = (1 - inP) * 0.06 - (1 - outP) * 0.03; break
    case 'slide': frame.dx = (1 - inP) * -0.2 + (1 - outP) * 0.2; break
    case 'pop': { const back = p >= 1 ? 1 : 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2; frame.scale = Math.max(0.01, back) * (0.85 + 0.15 * outP); break }
    case 'zoom': frame.scale = 0.7 + 0.3 * inP + (1 - outP) * 0.2; break
    case 'typewriter': frame.reveal = Math.min(1, local / Math.max(0.3, title.duration * 0.5)); frame.opacity = outP; break
    default: break
  }
  return frame
}

export function formatTime(seconds: number) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Splits a clip at timeline time `t`, if `t` falls inside it. */
export function splitAt(clips: Clip[], t: number): Clip[] | null {
  const { placed } = layout(clips)
  const target = placed.find(item => t > item.start + 0.1 && t < item.end - 0.1)
  if (!target) return null
  const at = sourceTime(target, t)
  const left: Clip = { ...target.clip, out: at, transition: { type: 'cut', duration: 0 } }
  const right: Clip = { ...structuredClone(target.clip), id: newId('clip'), in: at }
  const next = [...clips]
  next.splice(target.index, 1, left, right)
  return next
}
