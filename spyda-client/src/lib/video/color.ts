import type { Grade } from './renderer'

/**
 * Colour beyond the basic sliders: three colour wheels (shadows, midtones,
 * highlights) and curves (all channels together, then red, green and blue),
 * plus an automatic balance read from the picture itself.
 */

/** A wheel's puck (x, y inside the unit circle: the colour push) and its level (-1..1: darker..brighter). */
export type Wheel = { x: number; y: number; level: number }
/** Curve points, x and y 0..1, sorted by x; the ends are always there. */
export type CurvePoints = Array<[number, number]>
export type Curves = { master: CurvePoints; r: CurvePoints; g: CurvePoints; b: CurvePoints }
export type ClipColor = { lift: Wheel; gamma: Wheel; gain: Wheel; curves: Curves }

export const NEUTRAL_WHEEL: Wheel = { x: 0, y: 0, level: 0 }
export const STRAIGHT: CurvePoints = [[0, 0], [1, 1]]
export const NEUTRAL_CURVES: Curves = { master: STRAIGHT, r: STRAIGHT, g: STRAIGHT, b: STRAIGHT }
export const NEUTRAL_COLOR: ClipColor = { lift: NEUTRAL_WHEEL, gamma: NEUTRAL_WHEEL, gain: NEUTRAL_WHEEL, curves: NEUTRAL_CURVES }

export function withColor(color?: Partial<ClipColor> | null): ClipColor {
  return { ...NEUTRAL_COLOR, ...color, curves: { ...NEUTRAL_CURVES, ...color?.curves } }
}

/** The pure colour (no brightness) at an angle on the wheel, as an offset that sums to zero. */
function hueOffset(angle: number): [number, number, number] {
  const channel = (shift: number) => Math.cos(angle - shift)
  // Red at 0°, green at 120°, blue at 240°: the familiar colour-wheel layout.
  const rgb: [number, number, number] = [channel(0), channel((2 * Math.PI) / 3), channel((4 * Math.PI) / 3)]
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3
  return [rgb[0] - mean, rgb[1] - mean, rgb[2] - mean]
}

/** What a wheel adds to each channel, scaled for where it acts. */
export function wheelVector(wheel: Wheel, push: number, level: number): [number, number, number] {
  const strength = Math.min(1, Math.hypot(wheel.x, wheel.y))
  const [r, g, b] = strength > 0 ? hueOffset(Math.atan2(-wheel.y, wheel.x)) : [0, 0, 0]
  return [r * strength * push + wheel.level * level, g * strength * push + wheel.level * level, b * strength * push + wheel.level * level]
}

/** The renderer's inputs for the wheels. */
export function wheelUniforms(color: ClipColor) {
  return {
    lift: wheelVector(color.lift, 0.18, 0.22),
    gamma: wheelVector(color.gamma, 0.45, 0.6),
    gain: wheelVector(color.gain, 0.45, 0.6),
  }
}

export function wheelsAreNeutral(color: ClipColor) {
  return [color.lift, color.gamma, color.gain].every(wheel => !wheel.x && !wheel.y && !wheel.level)
}

const isStraight = (points: CurvePoints) => points.length === 2 && points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 1 && points[1][1] === 1
export function curvesAreNeutral(curves: Curves) {
  return isStraight(curves.master) && isStraight(curves.r) && isStraight(curves.g) && isStraight(curves.b)
}

/** A smooth curve through the points that never overshoots (monotone cubic). */
export function sampleCurve(points: CurvePoints, x: number) {
  const p = [...points].sort((a, b) => a[0] - b[0])
  if (x <= p[0][0]) return p[0][1]
  if (x >= p[p.length - 1][0]) return p[p.length - 1][1]
  const n = p.length
  const dx: number[] = [], slope: number[] = []
  for (let i = 0; i < n - 1; i++) { dx.push(Math.max(1e-6, p[i + 1][0] - p[i][0])); slope.push((p[i + 1][1] - p[i][1]) / dx[i]) }
  const tangent = [slope[0]]
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2)
  tangent.push(slope[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = Math.hypot(a, b)
    if (h > 3) { tangent[i] = (3 / h) * a * slope[i]; tangent[i + 1] = (3 / h) * b * slope[i] }
  }
  const i = p.findIndex((point, index) => index < n - 1 && x >= point[0] && x <= p[index + 1][0])
  const t = (x - p[i][0]) / dx[i]
  const t2 = t * t, t3 = t2 * t
  const y = (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * dx[i] * tangent[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * dx[i] * tangent[i + 1]
  return Math.max(0, Math.min(1, y))
}

const lutCache = new WeakMap<Curves, Uint8Array>()
/** A 256-entry RGBA table: each channel's curve applied after the master curve. */
export function curveLut(curves: Curves) {
  const cached = lutCache.get(curves)
  if (cached) return cached
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const m = sampleCurve(curves.master, i / 255)
    lut[i * 4] = Math.round(sampleCurve(curves.r, m) * 255)
    lut[i * 4 + 1] = Math.round(sampleCurve(curves.g, m) * 255)
    lut[i * 4 + 2] = Math.round(sampleCurve(curves.b, m) * 255)
    lut[i * 4 + 3] = 255
  }
  lutCache.set(curves, lut)
  return lut
}

/** Average colour and spread of a picture's pixels (RGBA bytes). */
export function pictureStats(data: Uint8ClampedArray) {
  let r = 0, g = 0, b = 0, n = 0
  const lumas: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i] / 255, pg = data[i + 1] / 255, pb = data[i + 2] / 255
    r += pr; g += pg; b += pb; n++
    lumas.push(0.2126 * pr + 0.7152 * pg + 0.0722 * pb)
  }
  lumas.sort((x, y) => x - y)
  const at = (q: number) => lumas[Math.min(lumas.length - 1, Math.floor(q * lumas.length))] ?? 0
  const count = Math.max(1, n)
  return { r: r / count, g: g / count, b: b / count, luma: lumas.reduce((s, v) => s + v, 0) / count, low: at(0.02), high: at(0.98) }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const round = (value: number) => Math.round(value * 100) / 100

/** A starting grade that evens out the colour cast and the exposure of a picture. */
export function autoBalance(stats: ReturnType<typeof pictureStats>): Partial<Grade> {
  const exposure = stats.luma > 0.01 ? clamp(Math.log2(0.46 / stats.luma) * 0.8, -1.5, 1.5) : 0
  // Too blue: warm it; too orange: cool it. Too green: towards magenta.
  const temperature = clamp((stats.b - stats.r) * 2.4, -0.7, 0.7)
  const tint = clamp((stats.g - (stats.r + stats.b) / 2) * 2.6, -0.6, 0.6)
  const range = stats.high - stats.low
  const contrast = range < 0.75 ? clamp((0.85 - range) * 0.7, 0, 0.35) : 0
  return { exposure: round(exposure), temperature: round(temperature), tint: round(tint), contrast: round(contrast) }
}
