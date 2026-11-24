import type { ClipColor } from './color'
import { IDENTITY_TRANSFORM, NEUTRAL_GRADE, type BlendMode, type ClipFit, type ClipTransform, type EffectId, type Grade, type TransitionId } from './renderer'

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
  /** One of Spyda's built-in sound effects, not a file the user imported. */
  sfx?: boolean
  /** Media page organisation. */
  favourite?: boolean
  folder?: string | null
  size?: number
  addedAt?: string
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
  fit: ClipFit
  transform: ClipTransform
  /** Slow move over the clip (Ken Burns), on top of `transform`. */
  motion: ClipMotion
  /** Seconds of fade from and to black (and silence) at the clip's ends. */
  fadeIn: number
  fadeOut: number
  grade: Grade
  effect: EffectId
  amount: number
  /** How this clip hands over to the next one. */
  transition: { type: TransitionId; duration: number }
  /** How see-through the clip is, 0..1 (default 1). */
  opacity?: number
  /** Colour wheels and curves, on top of `grade` (the Color page). */
  color?: ClipColor
  /** How an overlay clip mixes with what is under it (the Mixer page). */
  mix?: ClipMix
  /** Animation: the clip's position, size, rotation and opacity at moments of its own time. */
  keyframes?: Keyframe[]
  /** Overlay clips only: the video track above the main one (2 = V2) and where it starts. */
  track?: number
  start?: number
}

/** Green screen: pixels near `color` become see-through. */
export type ClipKey = { on: boolean; color: string; tolerance: number; softness: number; spill: number }
/** Show the clip only inside (or outside) a shape; position and size are fractions of the frame. */
export type ClipMask = { shape: 'none' | 'rect' | 'ellipse'; x: number; y: number; width: number; height: number; feather: number; invert: boolean }
export type ClipMix = { blend: BlendMode; key: ClipKey; mask: ClipMask }

export const DEFAULT_KEY: ClipKey = { on: false, color: '#00b140', tolerance: 0.1, softness: 0.08, spill: 0.6 }
export const DEFAULT_MASK: ClipMask = { shape: 'none', x: 0.5, y: 0.5, width: 0.6, height: 0.6, feather: 0.08, invert: false }

export function withMix(mix?: Partial<ClipMix> | null): ClipMix {
  return { blend: mix?.blend ?? 'normal', key: { ...DEFAULT_KEY, ...mix?.key }, mask: { ...DEFAULT_MASK, ...mix?.mask } }
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0').slice(0, 6)
  const value = Number.parseInt(full, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

/** One moment of a clip's animation; `at` is seconds from the clip's start on the timeline. */
export type Keyframe = { id: string; at: number; scale: number; x: number; y: number; rotate: number; opacity: number }

/** A named point on the timeline. */
export type Marker = { id: string; t: number; label: string; color: string }

export const MARKER_COLORS = ['#9dfab0', '#ffb36b', '#7cc7ff', '#ff6bd5', '#ffe066'] as const

/** Overlay video tracks, above the main track (V1). */
export const OVERLAY_TRACKS = [2, 3] as const

export type ClipMotion = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'

export const CLIP_MOTIONS: Array<{ id: ClipMotion; name: string }> = [
  { id: 'none', name: 'None' },
  { id: 'zoom-in', name: 'Slow zoom in' },
  { id: 'zoom-out', name: 'Slow zoom out' },
  { id: 'pan-left', name: 'Pan left' },
  { id: 'pan-right', name: 'Pan right' },
  { id: 'pan-up', name: 'Pan up' },
  { id: 'pan-down', name: 'Pan down' },
]

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
  backgroundColor: string
  /** Line spacing, as a multiple of the font size. */
  lineHeight: number
  /** Extra space after each paragraph (line break), as a multiple of the font size. */
  paragraphSpacing: number
  /** Extra space between letters, as a fraction of the font size. */
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  italic: boolean
  uppercase: boolean
  /** Outline colour, and its width as a fraction of the font size (0 = none). */
  outlineColor: string
  outlineWidth: number
  shadow: boolean
  /** Lines wrap at this width (fraction of the frame). */
  maxWidth: number
}

/** Older titles (and presets) fill in from these. */
export const TITLE_DEFAULTS: Omit<Title, 'id' | 'text' | 'start' | 'duration'> = {
  x: 0.5, y: 0.78, size: 0.085, color: '#FFFFFF', font: 'Space Grotesk', weight: 700, animation: 'rise',
  background: false, backgroundColor: '#000000', lineHeight: 1.2, paragraphSpacing: 0, letterSpacing: 0,
  align: 'center', italic: false, uppercase: false, outlineColor: '#000000', outlineWidth: 0, shadow: true, maxWidth: 0.86,
}

export type AudioTrackItem = {
  id: string
  mediaId: string
  start: number
  volume: number
  /** Trim, in seconds of the source. */
  in: number
  out: number
  fadeIn: number
  fadeOut: number
  /** Which audio lane it sits on. Default: music. */
  lane?: 'voice' | 'music' | 'sfx'
}

export type VideoProject = {
  width: number
  height: number
  clips: Clip[]
  titles: Title[]
  audio: AudioTrackItem[]
  /** Clips on the video tracks above the main one (picture-in-picture, logos, B-roll). */
  overlays?: Clip[]
  markers?: Marker[]
  /** Music is lowered by `amount` (0..1) while anything plays on the voice track. */
  duck?: { on: boolean; amount: number }
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
    // The whole picture, never cropped, unless the user asks to fill the frame.
    fit: 'contain',
    transform: { ...IDENTITY_TRANSFORM },
    motion: 'none',
    fadeIn: 0,
    fadeOut: 0,
    grade: { ...NEUTRAL_GRADE },
    effect: 'none',
    amount: 0.7,
    transition: { type: 'crossfade', duration: 0.6 },
  }
}

export function makeTitle(start: number, width: number, height: number): Title {
  return {
    ...TITLE_DEFAULTS,
    id: newId('title'),
    text: 'Your title',
    start,
    duration: 3,
    y: width >= height ? 0.78 : 0.7,
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

/** Overlay clips placed where they start, on their own track. */
export function placeOverlays(overlays: Clip[] = []): Placed[] {
  return overlays.map(clip => {
    const length = clipLength(clip)
    const start = Math.max(0, clip.start ?? 0)
    return { clip, index: -1, start, end: start + length, length, transitionIn: 0, transitionOut: 0 }
  })
}

const smooth = (p: number) => p * p * (3 - 2 * p)

/** The clip's animated values at `local` seconds into it, eased between keyframes; null with no keyframes. */
export function keyframeValues(clip: Clip, local: number): Omit<Keyframe, 'id' | 'at'> | null {
  const frames = [...(clip.keyframes ?? [])].sort((a, b) => a.at - b.at)
  if (!frames.length) return null
  const pick = ({ scale, x, y, rotate, opacity }: Keyframe) => ({ scale, x, y, rotate, opacity })
  if (local <= frames[0].at) return pick(frames[0])
  const last = frames[frames.length - 1]
  if (local >= last.at) return pick(last)
  const index = frames.findIndex(frame => frame.at > local)
  const a = frames[index - 1], b = frames[index]
  const p = smooth((local - a.at) / Math.max(0.001, b.at - a.at))
  const mix = (from: number, to: number) => from + (to - from) * p
  return { scale: mix(a.scale, b.scale), x: mix(a.x, b.x), y: mix(a.y, b.y), rotate: mix(a.rotate, b.rotate), opacity: mix(a.opacity, b.opacity) }
}

/** How much music is turned down at `t` because the voice track is playing (1 = not at all). */
export function duckingAt(project: VideoProject, t: number) {
  const duck = project.duck
  if (!duck?.on || duck.amount <= 0) return 1
  const ramp = 0.3
  let strength = 0
  for (const item of project.audio) {
    if (item.lane !== 'voice') continue
    const start = item.start, end = item.start + item.out - item.in
    if (t >= start && t <= end) { strength = 1; break }
    const distance = t < start ? start - t : t - end
    if (distance < ramp) strength = Math.max(strength, 1 - distance / ramp)
  }
  return 1 - duck.amount * smooth(strength)
}

/** How visible a clip is at `t` (its fade in and out, opacity and keyframes): 0..1. */
export function clipOpacity(item: Placed, t: number) {
  const local = t - item.start
  const { fadeIn, fadeOut } = item.clip
  const keyed = keyframeValues(item.clip, local)
  let value = 1
  if (fadeIn > 0) value = Math.min(value, local / fadeIn)
  if (fadeOut > 0) value = Math.min(value, (item.length - local) / fadeOut)
  value *= keyed ? keyed.opacity : item.clip.opacity ?? 1
  return Math.max(0, Math.min(1, value))
}

/** The clip's transform at `t`: its keyframes (or its own transform), with its slow motion (Ken Burns) on top. */
export function clipTransformAt(item: Placed, t: number): ClipTransform {
  const own = item.clip.transform ?? IDENTITY_TRANSFORM
  const keyed = keyframeValues(item.clip, t - item.start)
  const base = keyed ? { ...own, scale: keyed.scale, x: keyed.x, y: keyed.y, rotate: keyed.rotate } : own
  const p = Math.max(0, Math.min(1, (t - item.start) / Math.max(0.1, item.length)))
  const ease = p * p * (3 - 2 * p)
  const move = { ...base }
  switch (item.clip.motion) {
    case 'zoom-in': move.scale = base.scale * (1 + 0.18 * ease); break
    case 'zoom-out': move.scale = base.scale * (1.18 - 0.18 * ease); break
    case 'pan-left': move.scale = base.scale * 1.15; move.x = base.x + 0.06 - 0.12 * ease; break
    case 'pan-right': move.scale = base.scale * 1.15; move.x = base.x - 0.06 + 0.12 * ease; break
    case 'pan-up': move.scale = base.scale * 1.15; move.y = base.y + 0.06 - 0.12 * ease; break
    case 'pan-down': move.scale = base.scale * 1.15; move.y = base.y - 0.06 + 0.12 * ease; break
    default: break
  }
  return move
}

/** Volume multiplier of a music item at its own time `local` (fades). */
export function audioFade(item: AudioTrackItem, local: number) {
  const length = item.out - item.in
  let value = 1
  if (item.fadeIn > 0) value = Math.min(value, local / item.fadeIn)
  if (item.fadeOut > 0) value = Math.min(value, (length - local) / item.fadeOut)
  return Math.max(0, Math.min(1, value))
}

/** Picks the project size closest to a picture's shape. */
export function formatFor(width: number, height: number) {
  const aspect = width / Math.max(1, height)
  return FORMATS.reduce((best, format) => (Math.abs(Math.log(format.width / format.height / aspect)) < Math.abs(Math.log(best.width / best.height / aspect)) ? format : best))
}

/**
 * Splits an audio item at a time on the timeline into two items that play
 * back to back. Returns null when the time is not inside the item.
 */
export function splitAudioAt(item: AudioTrackItem, at: number, newId: () => string): [AudioTrackItem, AudioTrackItem] | null {
  const local = at - item.start
  const length = item.out - item.in
  if (local <= 0.05 || local >= length - 0.05) return null
  const cut = item.in + local
  return [
    { ...item, out: cut, fadeOut: 0 },
    { ...item, id: newId(), start: at, in: cut, fadeIn: 0 },
  ]
}
