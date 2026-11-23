import type { DesignObject, ObjectEffects } from '../core/design-document'

/**
 * Effects and motion, turned into what the canvas draws. Kept apart from the
 * renderer so the same numbers drive the live canvas, the preview and the
 * video export.
 */

export const BLEND_TO_COMPOSITE: Record<NonNullable<ObjectEffects['blend']>, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

/** Shadow (or glow) props for a Konva shape, scaled from document to display pixels. */
export function shadowProps(fx: ObjectEffects | undefined, scale: number) {
  const shadow = fx?.shadow
  if (!shadow) return { shadowEnabled: false }
  return {
    shadowEnabled: true,
    shadowColor: shadow.color,
    shadowBlur: shadow.blur * scale,
    shadowOffsetX: shadow.x * scale,
    shadowOffsetY: shadow.y * scale,
    shadowOpacity: shadow.opacity,
    // A glow on a cut-out should follow the cut-out, not its box.
    shadowForStrokeEnabled: true,
  }
}

/** Gradient fill props across a box, at an angle in degrees (0 = left to right). */
export function gradientProps(fx: ObjectEffects | undefined, width: number, height: number) {
  const gradient = fx?.gradient
  if (!gradient) return {}
  const radians = (gradient.angle * Math.PI) / 180
  const dx = Math.cos(radians), dy = Math.sin(radians)
  // Project the box onto the direction so the stops reach the far corners.
  const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2
  const cx = width / 2, cy = height / 2
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: cx - dx * half, y: cy - dy * half },
    fillLinearGradientEndPoint: { x: cx + dx * half, y: cy + dy * half },
    fillLinearGradientColorStops: [0, gradient.from, 1, gradient.to],
  }
}

export function compositeOf(fx: ObjectEffects | undefined): GlobalCompositeOperation {
  return fx?.blend ? BLEND_TO_COMPOSITE[fx.blend] : 'source-over'
}

/** Whether the layer needs pixel filters (blur and picture adjustments), which require caching. */
export function needsFilters(fx: ObjectEffects | undefined) {
  return Boolean(fx && ((fx.blur ?? 0) > 0 || fx.brightness || fx.contrast || fx.saturation || fx.grayscale || fx.recolor?.length || (fx.duotone && fx.duotone.amount > 0)))
}

/* ── motion ──────────────────────────────────────────────────────────── */

export type MotionFrame = { dx: number; dy: number; scaleX: number; scaleY: number; rotation: number; opacity: number; reveal: number }

const REST: MotionFrame = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, reveal: 1 }

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (p: number) => 1 - (1 - p) ** 3
const backOut = (p: number) => { const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2 }
const bounceOut = (p: number) => {
  const n = 7.5625, d = 2.75
  if (p < 1 / d) return n * p * p
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375
  return n * (p -= 2.625 / d) * p + 0.984375
}

/**
 * Where a layer is at `t` seconds into playback. `travel` is how far, in
 * display pixels, slides and rises move: a share of the canvas so motion reads
 * the same at any zoom.
 */
export function motionAt(fx: ObjectEffects | undefined, t: number, travel: number): MotionFrame {
  const enter = fx?.enter
  const frame: MotionFrame = { ...REST }
  let settled = t
  if (enter) {
    const p = clamp((t - enter.delay) / enter.duration)
    const e = easeOut(p)
    settled = t - enter.delay - enter.duration
    if (t < enter.delay) return { ...REST, opacity: 0, reveal: 0 }
    switch (enter.type) {
      case 'fade': frame.opacity = p; break
      case 'rise': frame.dy = (1 - e) * travel; frame.opacity = clamp(p * 1.6); break
      case 'drop': frame.dy = -(1 - e) * travel; frame.opacity = clamp(p * 1.6); break
      case 'slide-left': frame.dx = (1 - e) * travel * 1.6; frame.opacity = clamp(p * 1.6); break
      case 'slide-right': frame.dx = -(1 - e) * travel * 1.6; frame.opacity = clamp(p * 1.6); break
      case 'zoom': frame.scaleX = frame.scaleY = 0.55 + 0.45 * e; frame.opacity = clamp(p * 1.4); break
      case 'pop': { const s = p >= 1 ? 1 : Math.max(0, backOut(p)); frame.scaleX = frame.scaleY = s; frame.opacity = clamp(p * 3); break }
      case 'spin': frame.rotation = -(1 - e) * 200; frame.scaleX = frame.scaleY = 0.4 + 0.6 * e; frame.opacity = clamp(p * 2); break
      case 'blur': frame.scaleX = frame.scaleY = 1.18 - 0.18 * e; frame.opacity = e; break
      case 'typewriter': frame.reveal = p; break
      case 'bounce': frame.dy = -(1 - bounceOut(p)) * travel * 1.4; frame.opacity = clamp(p * 4); break
      case 'flip': frame.scaleX = Math.max(0.001, Math.abs(Math.cos((1 - e) * Math.PI / 2))); frame.opacity = clamp(p * 2); break
    }
    if (p < 1) return frame
  }
  // Once it has arrived, a loop keeps it alive.
  const s = Math.max(0, settled)
  switch (fx?.loop) {
    case 'float': frame.dy += Math.sin(s * 2.2) * travel * 0.08; break
    case 'pulse': { const k = 1 + Math.sin(s * 3.2) * 0.045; frame.scaleX *= k; frame.scaleY *= k; break }
    case 'wiggle': frame.rotation += Math.sin(s * 9) * 3.5; break
    case 'breathe': frame.opacity *= 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(s * 2.4)); break
    case 'spin': frame.rotation += s * 90; break
    case 'swing': frame.rotation += Math.sin(s * 2.4) * 9; break
  }
  return frame
}

/** How long a design takes to play: every entrance done, plus time to see the loops. */
export function playLength(objects: DesignObject[]) {
  let end = 0
  let loops = false
  for (const object of objects) {
    const fx = object.style.fx
    if (fx?.enter) end = Math.max(end, fx.enter.delay + fx.enter.duration)
    if (fx?.loop) loops = true
  }
  return Math.min(30, Math.max(1.5, end + (loops ? 3 : 0.8)))
}

export function hasMotion(objects: DesignObject[]) {
  return objects.some(object => object.style.fx?.enter || object.style.fx?.loop)
}

/* ── presets ─────────────────────────────────────────────────────────── */

export const SHADOW_PRESETS = {
  soft: { color: '#000000', blur: 40, x: 0, y: 14, opacity: 0.35 },
  drop: { color: '#000000', blur: 6, x: 6, y: 8, opacity: 0.55 },
  lifted: { color: '#000000', blur: 70, x: 0, y: 36, opacity: 0.45 },
  hard: { color: '#000000', blur: 0, x: 10, y: 10, opacity: 0.9 },
  glow: { color: '#9dfab0', blur: 48, x: 0, y: 0, opacity: 0.9 },
  neon: { color: '#ff3df5', blur: 26, x: 0, y: 0, opacity: 1 },
} as const satisfies Record<string, NonNullable<ObjectEffects['shadow']>>

export type ShadowPreset = keyof typeof SHADOW_PRESETS

/**
 * Magic Animate: a choreographed entrance for every layer, top to bottom, with
 * the kind of motion that suits each part (backgrounds settle, subjects rise,
 * headlines pop, small print fades), and a slow float on the hero.
 */
export function magicAnimation(objects: DesignObject[]): Map<string, Pick<ObjectEffects, 'enter' | 'loop'>> {
  const plan = new Map<string, Pick<ObjectEffects, 'enter' | 'loop'>>()
  const visible = objects.filter(object => !object.status.removed && object.status.visible && object.transform.bounds)
  const ordered = [...visible].sort((a, b) => (a.transform.bounds!.y - b.transform.bounds!.y) || (a.transform.bounds!.x - b.transform.bounds!.x))
  const area = (object: DesignObject) => object.transform.bounds!.width * object.transform.bounds!.height
  const hero = visible.filter(object => object.kind === 'image').sort((a, b) => area(b) - area(a))[0]
  const headline = visible.filter(object => object.kind === 'text').sort((a, b) => (b.style.fontSize ?? b.transform.bounds!.height) - (a.style.fontSize ?? a.transform.bounds!.height))[0]
  let delay = 0.15
  for (const object of ordered) {
    if (object.kind === 'background') { plan.set(object.id, { enter: { type: 'fade', duration: 0.8, delay: 0 }, loop: null }); continue }
    let type: NonNullable<ObjectEffects['enter']>['type'] = 'rise'
    let duration = 0.7
    if (object.id === hero?.id) { type = 'rise'; duration = 0.95 }
    else if (object.id === headline?.id) { type = 'pop'; duration = 0.75 }
    else if (object.kind === 'logo' || object.kind === 'icon' || object.kind === 'qr-code') { type = 'zoom'; duration = 0.55 }
    else if (object.kind === 'text' || object.kind === 'action') {
      const small = (object.transform.bounds!.height ?? 0) < 4
      type = small ? 'fade' : 'rise'
      duration = small ? 0.6 : 0.7
    } else if (object.kind === 'shape' || object.kind === 'decor') { type = 'zoom'; duration = 0.6 }
    plan.set(object.id, { enter: { type, duration, delay: Math.round(delay * 100) / 100 }, loop: object.id === hero?.id ? 'float' : null })
    delay += 0.12
  }
  return plan
}
