import type { DesignDocument, DesignObject, PercentBox } from '../core/design-document'
import { BUNDLED_FAMILIES, preloadFonts } from './fonts'
import { makeLayer } from './editor-objects'
import { segmentFlyer } from './segmentation'
import { encodeCanvas, renderAt4K } from './image-4k'

/**
 * Magic Layers: one flat picture in, the same picture out as separate,
 * editable layers that look identical until you move something.
 *
 *  - Text becomes live text. Each line's ink is found in the pixels, then the
 *    bundled font, weight, size and letter spacing that reproduce that ink
 *    best are chosen by rendering candidates and comparing them with the
 *    original, so the type sits exactly where it was.
 *  - Logos and marks become their own cut-outs.
 *  - The main subject (people, products) becomes one cut-out from the
 *    full-frame matte.
 *  - The background is the picture with all of that removed and the gaps
 *    filled from the surrounding pixels, so moving a layer leaves no hole.
 *
 * Analysis runs on a working copy of at most 2000 px; every picture layer it
 * produces is rendered at 4K.
 */

type Rect = { x: number; y: number; w: number; h: number }
type Rgb = [number, number, number]

export type MagicProgress = (stage: string, fraction: number) => void

export type MagicLayersOptions = {
  /** The picture's pixels. */
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  /** The document the layers will live in (canvas size, sections, z-order). */
  document: DesignDocument
  /** What the analyser found in the picture, in percent of the picture. */
  analysed: DesignObject[]
  /** Where the picture sits in the document, in document percent. */
  frame: PercentBox
  /** A whole flyer gets a locked background layer; a picture on a canvas gets a normal one. */
  wholeFlyer: boolean
  saveAsset: (blob: Blob) => Promise<string>
  onProgress?: MagicProgress
}

export type MagicLayersResult = { objects: DesignObject[]; warnings: string[] }

const WORK_LONG_EDGE = 2000
const TEXT_KINDS = new Set<DesignObject['kind']>(['text', 'action'])
const MARK_KINDS = new Set<DesignObject['kind']>(['logo', 'icon', 'qr-code'])

/* ── small pixel helpers ─────────────────────────────────────────────── */

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function dims(source: MagicLayersOptions['source']) {
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height }
  return { width: source.width, height: source.height }
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.floor(rect.x))
  const y = Math.max(0, Math.floor(rect.y))
  return { x, y, w: Math.max(1, Math.min(width - x, Math.ceil(rect.w))), h: Math.max(1, Math.min(height - y, Math.ceil(rect.h))) }
}

function hex([r, g, b]: Rgb) {
  return `#${[r, g, b].map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Otsu's threshold over 0..441 colour distances, for a clean ink / paper split. */
function otsu(values: Float32Array, count: number) {
  const bins = new Float64Array(256)
  for (let i = 0; i < count; i += 1) bins[Math.min(255, Math.floor(values[i] / 1.73))] += 1
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * bins[i]
  let sumB = 0, weightB = 0, best = 0, threshold = 0
  for (let i = 0; i < 256; i += 1) {
    weightB += bins[i]
    if (!weightB) continue
    const weightF = count - weightB
    if (!weightF) break
    sumB += i * bins[i]
    const meanB = sumB / weightB
    const meanF = (sum - sumB) / weightF
    const between = weightB * weightF * (meanB - meanF) ** 2
    if (between > best) { best = between; threshold = i }
  }
  return threshold * 1.73
}

/** Dilates a binary mask by `radius` pixels (square), in place on a copy. */
function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return mask
  const horizontal = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    let run = -1
    for (let x = 0; x < width; x += 1) if (mask[y * width + x]) run = x
      else if (run >= 0 && x - run <= radius) horizontal[y * width + x] = 1
    run = -1
    for (let x = width - 1; x >= 0; x -= 1) {
      const at = y * width + x
      if (mask[at]) { run = x; horizontal[at] = 1 } else if (run >= 0 && run - x <= radius) horizontal[at] = 1
    }
  }
  const out = new Uint8Array(mask.length)
  for (let x = 0; x < width; x += 1) {
    let run = -1
    for (let y = 0; y < height; y += 1) if (horizontal[y * width + x]) run = y
      else if (run >= 0 && y - run <= radius) out[y * width + x] = 1
    run = -1
    for (let y = height - 1; y >= 0; y -= 1) {
      const at = y * width + x
      if (horizontal[at]) { run = y; out[at] = 1 } else if (run >= 0 && run - y <= radius) out[at] = 1
    }
  }
  return out
}

/** Labels 8-connected components; returns per-component pixel lists' stats. */
function components(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(mask.length)
  const stats: { area: number; x0: number; y0: number; x1: number; y1: number; sumX: number; sumY: number }[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue
    const id = stats.length + 1
    const stat = { area: 0, x0: width, y0: height, x1: 0, y1: 0, sumX: 0, sumY: 0 }
    labels[start] = id
    stack.push(start)
    while (stack.length) {
      const at = stack.pop()!
      const x = at % width
      const y = (at - x) / width
      stat.area += 1; stat.sumX += x; stat.sumY += y
      if (x < stat.x0) stat.x0 = x
      if (x > stat.x1) stat.x1 = x
      if (y < stat.y0) stat.y0 = y
      if (y > stat.y1) stat.y1 = y
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const next = ny * width + nx
          if (mask[next] && !labels[next]) { labels[next] = id; stack.push(next) }
        }
      }
    }
    stats.push(stat)
  }
  return { labels, stats }
}

/* ── ink: the pixels of one text block or mark, separated from their backdrop ── */

type Ink = {
  /** The ink as a mask over the whole working image. */
  mask: Uint8Array
  box: Rect
  colour: Rgb
  /** Horizontal bands of ink: one per line of text. */
  bands: Rect[]
  pixels: number
}

function findInk(image: ImageData, box: Rect, claimed: Uint8Array, expand: { x: number; y: number }): Ink | null {
  const { width, height, data } = image
  const region = clampRect({ x: box.x - box.w * expand.x, y: box.y - box.h * expand.y, w: box.w * (1 + 2 * expand.x), h: box.h * (1 + 2 * expand.y) }, width, height)
  const inner = clampRect(box, width, height)
  const rw = region.w, rh = region.h
  if (rw < 4 || rh < 4) return null

  // The backdrop is what the region's border mostly is.
  // The paper is the colour the text box itself is mostly made of: text rarely
  // covers half its box, and this keeps black type on an orange panel reading
  // as type rather than taking the panel with it.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  for (let y = inner.y; y < inner.y + inner.h; y += 1) {
    for (let x = inner.x; x < inner.x + inner.w; x += 1) {
      const at = (y * width + x) * 4
      const key = ((data[at] >> 3) << 10) | ((data[at + 1] >> 3) << 5) | (data[at + 2] >> 3)
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
      bucket.count += 1; bucket.r += data[at]; bucket.g += data[at + 1]; bucket.b += data[at + 2]
      buckets.set(key, bucket)
    }
  }
  // Neighbouring buckets of the same flat colour count together.
  let paper: Rgb = [255, 255, 255]
  let bestCount = -1
  for (const [key, bucket] of buckets) {
    const r = key >> 10, g = (key >> 5) & 31, b = key & 31
    let count = 0
    for (let dr = -1; dr <= 1; dr += 1) for (let dg = -1; dg <= 1; dg += 1) for (let db = -1; db <= 1; db += 1) {
      const near = buckets.get(((r + dr) << 10) | ((g + dg) << 5) | (b + db))
      if (near && r + dr >= 0 && g + dg >= 0 && b + db >= 0) count += near.count
    }
    if (count > bestCount) { bestCount = count; paper = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] }
  }

  const distance = new Float32Array(rw * rh)
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      const at = ((region.y + y) * width + region.x + x) * 4
      distance[y * rw + x] = Math.hypot(data[at] - paper[0], data[at + 1] - paper[1], data[at + 2] - paper[2])
    }
  }
  const threshold = Math.max(48, otsu(distance, distance.length))
  const local = new Uint8Array(rw * rh)
  for (let i = 0; i < local.length; i += 1) {
    const x = i % rw, y = (i - x) / rw
    if (distance[i] > threshold && !claimed[(region.y + y) * width + region.x + x]) local[i] = 1
  }

  const { labels, stats } = components(local, rw, rh)
  const keep = new Uint8Array(stats.length + 1)
  const innerLocal = { x0: inner.x - region.x, y0: inner.y - region.y, x1: inner.x - region.x + inner.w, y1: inner.y - region.y + inner.h }
  stats.forEach((stat, index) => {
    const cx = stat.sumX / stat.area, cy = stat.sumY / stat.area
    const insideCentre = cx >= innerLocal.x0 - 2 && cx <= innerLocal.x1 + 2 && cy >= innerLocal.y0 - 2 && cy <= innerLocal.y1 + 2
    const bboxArea = (stat.x1 - stat.x0 + 1) * (stat.y1 - stat.y0 + 1)
    const ox = Math.max(0, Math.min(stat.x1, innerLocal.x1) - Math.max(stat.x0, innerLocal.x0))
    const oy = Math.max(0, Math.min(stat.y1, innerLocal.y1) - Math.max(stat.y0, innerLocal.y0))
    const overlap = (ox * oy) / Math.max(1, bboxArea)
    // The search region is larger than the text, so a piece reaching its edge is
    // backdrop (a panel, a wave, a line) - unless a letter is joined to it, as when
    // a decorative line runs through the last letter. Then only its part inside the
    // text box is kept (2), so the letter comes along and the line does not.
    const touchesEdge = stat.x0 === 0 || stat.y0 === 0 || stat.x1 === rw - 1 || stat.y1 === rh - 1
    if (!touchesEdge && (insideCentre || overlap >= 0.5)) keep[index + 1] = 1
    else if (touchesEdge && overlap >= 0.08 && bboxArea < rw * rh * 0.6) keep[index + 1] = 2
  })
  const pad = 3
  const insideBox = (x: number, y: number) => x >= innerLocal.x0 - pad && x <= innerLocal.x1 + pad && y >= innerLocal.y0 - pad && y <= innerLocal.y1 + pad
  const joined = new Uint8Array(local.length)
  for (let i = 0; i < local.length; i += 1) {
    if (keep[labels[i]] !== 2) continue
    const x = i % rw, y = (i - x) / rw
    if (!insideBox(x, y)) labels[i] = 0
    else joined[i] = 1
  }
  // A morphological opening on those pieces drops hairlines (1-2 px) and keeps
  // the solid strokes of the letter they ran through.
  const eroded = new Uint8Array(local.length)
  for (let y = 1; y < rh - 1; y += 1) {
    for (let x = 1; x < rw - 1; x += 1) {
      const i = y * rw + x
      if (!joined[i]) continue
      let solid = true
      for (let dy = -1; dy <= 1 && solid; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (!joined[i + dy * rw + dx]) { solid = false; break }
      if (solid) eroded[i] = 1
    }
  }
  const opened = dilate(eroded, rw, rh, 1)
  for (let i = 0; i < local.length; i += 1) if (joined[i] && !opened[i]) labels[i] = 0
  // Letters share a height; a piece far taller than the typical letter is a stray shape.
  const heights = stats.filter((stat, index) => keep[index + 1] === 1 && stat.area >= 6).map(stat => stat.y1 - stat.y0 + 1)
  if (heights.length >= 4) {
    const typical = median(heights)
    stats.forEach((stat, index) => { if (keep[index + 1] === 1 && stat.y1 - stat.y0 + 1 > typical * 2.6) keep[index + 1] = 0 })
  }

  const mask = new Uint8Array(width * height)
  let pixels = 0, x0 = width, y0 = height, x1 = 0, y1 = 0
  const ink: number[][] = [[], [], []]
  const strengths: number[] = []
  for (let i = 0; i < local.length; i += 1) if (keep[labels[i]] && strengths.length < 40000) strengths.push(distance[i])
  const strong = strengths.length ? [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length * 0.6)] : threshold
  const rows = new Int32Array(rh)
  for (let i = 0; i < local.length; i += 1) {
    if (!keep[labels[i]]) continue
    const x = i % rw, y = (i - x) / rw
    const gx = region.x + x, gy = region.y + y
    mask[gy * width + gx] = 1
    pixels += 1
    rows[y] += 1
    if (gx < x0) x0 = gx
    if (gx > x1) x1 = gx
    if (gy < y0) y0 = gy
    if (gy > y1) y1 = gy
    // The ink's colour from its solid core, not its anti-aliased edge.
    if (distance[i] >= strong && ink[0].length < 20000) {
      const at = (gy * width + gx) * 4
      ink[0].push(data[at]); ink[1].push(data[at + 1]); ink[2].push(data[at + 2])
    }
  }
  if (pixels < Math.max(12, inner.w * inner.h * 0.004)) return null

  // Lines: runs of rows with ink, merging gaps too thin to be line spacing (dots, accents).
  const bandRows: [number, number][] = []
  let open = -1
  for (let y = 0; y <= rh; y += 1) {
    const has = y < rh && rows[y] > 0
    if (has && open < 0) open = y
    if (!has && open >= 0) { bandRows.push([open, y - 1]); open = -1 }
  }
  const tallest = Math.max(1, ...bandRows.map(([a, b]) => b - a + 1))
  const merged: [number, number][] = []
  for (const band of bandRows) {
    const last = merged[merged.length - 1]
    const gap = last ? band[0] - last[1] - 1 : Infinity
    const small = band[1] - band[0] + 1 < tallest * 0.35 || (last && last[1] - last[0] + 1 < tallest * 0.35)
    if (last && (gap < tallest * 0.12 || (small && gap < tallest * 0.45))) last[1] = band[1]
    else merged.push([...band])
  }
  const bands: Rect[] = merged.map(([top, bottom]) => {
    let bx0 = rw, bx1 = 0
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < rw; x += 1) {
        if (keep[labels[y * rw + x]]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x }
      }
    }
    return { x: region.x + bx0, y: region.y + top, w: bx1 - bx0 + 1, h: bottom - top + 1 }
  })

  return {
    mask,
    box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    colour: ink[0].length ? [median(ink[0]), median(ink[1]), median(ink[2])] : [255, 255, 255],
    bands,
    pixels,
  }
}

/** Tightens a box to the ink inside it. */
function tighten(rect: Rect, mask: Uint8Array, width: number): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (!mask[y * width + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/**
 * Splits one band of ink into `count` lines at the thinnest rows near each even
 * division: lines whose descenders touch the next line's capitals share a band
 * but still have a waist between them.
 */
function splitBand(band: Rect, mask: Uint8Array, width: number, count: number): Rect[] | null {
  if (count <= 1) return [band]
  const rows = new Float32Array(band.h)
  for (let y = 0; y < band.h; y += 1) {
    let sum = 0
    for (let x = band.x; x < band.x + band.w; x += 1) sum += mask[(band.y + y) * width + x]
    rows[y] = sum
  }
  const cuts: number[] = []
  for (let i = 1; i < count; i += 1) {
    const target = (band.h * i) / count
    const reach = band.h / count * 0.35
    let best = Math.round(target), lowest = Infinity
    for (let y = Math.max(1, Math.floor(target - reach)); y <= Math.min(band.h - 2, Math.ceil(target + reach)); y += 1) {
      const value = rows[y - 1] + rows[y] * 2 + rows[y + 1]
      if (value < lowest) { lowest = value; best = y }
    }
    cuts.push(best)
  }
  const edges = [0, ...cuts, band.h]
  const parts: Rect[] = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    const part = tighten({ x: band.x, y: band.y + edges[i], w: band.w, h: Math.max(1, edges[i + 1] - edges[i]) }, mask, width)
    if (!part || part.h < band.h / count * 0.4) return null
    parts.push(part)
  }
  return parts
}

/* ── type matching ───────────────────────────────────────────────────── */

type Face = { family: string; weight: string }
type FittedLine = { text: string; face: Face; size: number; spacing: number; ink: Rect; score: number; left: number; ascent: number; fontAscent: number; fontDescent: number; advance: number }

const measurer = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

function metrics(text: string, face: Face) {
  const context = measurer!
  context.font = `${face.weight} 100px "${face.family}"`
  context.textBaseline = 'alphabetic'
  ;(context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
  const m = context.measureText(text)
  const sample = context.measureText('M')
  return {
    left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
    ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
    advance: m.width,
    fontAscent: sample.fontBoundingBoxAscent ?? sample.actualBoundingBoxAscent,
    fontDescent: sample.fontBoundingBoxDescent ?? sample.actualBoundingBoxDescent,
  }
}

/** Sizes a face to the line's ink (height from the ink, width from letter spacing) and scores the overlap. */
function fitFace(text: string, face: Face, ink: Rect, mask: Uint8Array, maskWidth: number): FittedLine | null {
  const m = metrics(text, face)
  const inkHeight100 = m.ascent + m.descent
  const inkWidth100 = m.left + m.right
  if (inkHeight100 <= 0 || inkWidth100 <= 0) return null
  let size = (ink.h / inkHeight100) * 100
  const glyphs = [...text].length
  let spacing = glyphs > 1 ? (ink.w - (inkWidth100 * size) / 100) / (glyphs - 1) : 0
  // Spacing outside this range means the face is the wrong width; fit the width instead.
  if (Math.abs(spacing) > size * 0.14) {
    size = (ink.w / inkWidth100) * 100
    spacing = 0
  }

  // Render the candidate over the ink box at a small scale and measure the overlap.
  const scale = Math.min(1, 56 / Math.max(1, ink.h))
  const w = Math.max(4, Math.round(ink.w * scale)), h = Math.max(4, Math.round(ink.h * scale))
  const canvas = canvasOf(w, h)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.font = `${face.weight} ${size * scale}px "${face.family}"`
  context.textBaseline = 'alphabetic'
  ;(context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing * scale}px`
  context.fillStyle = '#000'
  context.fillText(text, (m.left * size / 100) * scale, (m.ascent * size / 100) * scale)
  const rendered = context.getImageData(0, 0, w, h).data
  let both = 0, either = 0
  for (let y = 0; y < h; y += 1) {
    const sy = ink.y + Math.min(ink.h - 1, Math.floor(y / scale))
    for (let x = 0; x < w; x += 1) {
      const sx = ink.x + Math.min(ink.w - 1, Math.floor(x / scale))
      const original = mask[sy * maskWidth + sx] === 1
      const drawn = rendered[(y * w + x) * 4 + 3] > 110
      if (original && drawn) both += 1
      if (original || drawn) either += 1
    }
  }
  return {
    text, face, size, spacing, ink,
    score: either ? both / either : 0,
    left: (m.left * size) / 100,
    ascent: (m.ascent * size) / 100,
    fontAscent: (m.fontAscent * size) / 100,
    fontDescent: (m.fontDescent * size) / 100,
    advance: (m.advance * size) / 100,
  }
}

/** Splits a block's words over its ink bands, in proportion to each band's width. */
function wordsPerBand(text: string, bands: Rect[]) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
  if (lines.length === bands.length) return lines
  const words = text.split(/\s+/).filter(Boolean)
  if (bands.length === 1 || words.length <= 1) return [words.join(' ')]
  const totalWidth = bands.reduce((sum, band) => sum + band.w, 0)
  const totalChars = words.reduce((sum, word) => sum + word.length + 1, 0)
  const out: string[] = []
  let index = 0
  bands.forEach((band, bandIndex) => {
    const remainingBands = bands.length - bandIndex
    const target = (band.w / totalWidth) * totalChars
    const line: string[] = []
    let chars = 0
    while (index < words.length && (words.length - index > remainingBands - 1)) {
      if (line.length && chars + words[index].length / 2 > target) break
      line.push(words[index]); chars += words[index].length + 1; index += 1
    }
    out.push(line.join(' '))
  })
  if (index < words.length) out[out.length - 1] = `${out[out.length - 1]} ${words.slice(index).join(' ')}`.trim()
  return out.filter(Boolean).length === bands.length ? out : [words.join(' ')]
}

/* ── filling the gaps: push-pull inpainting ──────────────────────────── */

/**
 * Fills masked pixels from their surroundings: average the known pixels down a
 * pyramid, then blend back up so each hole takes the smoothest colour its
 * neighbourhood implies. Flat and gradient backdrops (most flyers) come back
 * seamless.
 */
function inpaint(image: ImageData, hole: Uint8Array) {
  const levels: { w: number; h: number; c: Float32Array; a: Float32Array }[] = []
  let w = image.width, h = image.height
  const c0 = new Float32Array(w * h * 3), a0 = new Float32Array(w * h)
  for (let i = 0; i < w * h; i += 1) {
    const known = hole[i] ? 0 : 1
    a0[i] = known
    c0[i * 3] = image.data[i * 4] * known
    c0[i * 3 + 1] = image.data[i * 4 + 1] * known
    c0[i * 3 + 2] = image.data[i * 4 + 2] * known
  }
  levels.push({ w, h, c: c0, a: a0 })
  while (w > 1 || h > 1) {
    const prev = levels[levels.length - 1]
    const nw = Math.max(1, Math.ceil(prev.w / 2)), nh = Math.max(1, Math.ceil(prev.h / 2))
    const c = new Float32Array(nw * nh * 3), a = new Float32Array(nw * nh)
    for (let y = 0; y < prev.h; y += 1) {
      for (let x = 0; x < prev.w; x += 1) {
        const from = y * prev.w + x, to = (y >> 1) * nw + (x >> 1)
        a[to] += prev.a[from]
        c[to * 3] += prev.c[from * 3]; c[to * 3 + 1] += prev.c[from * 3 + 1]; c[to * 3 + 2] += prev.c[from * 3 + 2]
      }
    }
    // Premultiplied sums stay sums; weights saturate at one known pixel's worth.
    for (let i = 0; i < nw * nh; i += 1) {
      if (a[i] > 0) { const k = 1 / a[i]; c[i * 3] *= k; c[i * 3 + 1] *= k; c[i * 3 + 2] *= k; a[i] = Math.min(1, a[i]); c[i * 3] *= a[i]; c[i * 3 + 1] *= a[i]; c[i * 3 + 2] *= a[i] }
    }
    levels.push({ w: nw, h: nh, c, a })
    w = nw; h = nh
  }
  // Pull: from the coarsest level up, fill each level's gaps from the one above.
  for (let level = levels.length - 2; level >= 0; level -= 1) {
    const fine = levels[level], coarse = levels[level + 1]
    for (let y = 0; y < fine.h; y += 1) {
      const cy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
      const y0 = Math.floor(cy), y1 = Math.min(coarse.h - 1, y0 + 1), fy = cy - y0
      for (let x = 0; x < fine.w; x += 1) {
        const i = y * fine.w + x
        const alpha = fine.a[i]
        if (alpha >= 1) continue
        const cx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
        const x0 = Math.floor(cx), x1 = Math.min(coarse.w - 1, x0 + 1), fx = cx - x0
        for (let ch = 0; ch < 3; ch += 1) {
          const s = (xx: number, yy: number) => {
            const j = yy * coarse.w + xx
            return coarse.a[j] > 0 ? coarse.c[j * 3 + ch] / coarse.a[j] : 0
          }
          const value = (s(x0, y0) * (1 - fx) + s(x1, y0) * fx) * (1 - fy) + (s(x0, y1) * (1 - fx) + s(x1, y1) * fx) * fy
          fine.c[i * 3 + ch] = fine.c[i * 3 + ch] + (1 - alpha) * value
        }
        fine.a[i] = 1
      }
    }
  }
  const out = new ImageData(image.width, image.height)
  const top = levels[0]
  for (let i = 0; i < image.width * image.height; i += 1) {
    out.data[i * 4] = top.c[i * 3]; out.data[i * 4 + 1] = top.c[i * 3 + 1]; out.data[i * 4 + 2] = top.c[i * 3 + 2]; out.data[i * 4 + 3] = 255
  }
  return out
}

/* ── rendering layers at 4K ──────────────────────────────────────────── */

/** A mask at working size as a soft alpha canvas (white, alpha = mask), blurred by `feather` px. */
function maskCanvas(mask: Uint8Array | Uint8ClampedArray, width: number, height: number, feather = 0) {
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d')!
  const image = context.createImageData(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255
    image.data[i * 4 + 3] = mask[i] > 1 ? mask[i] : mask[i] ? 255 : 0
  }
  context.putImageData(image, 0, 0)
  if (!feather) return canvas
  const soft = canvasOf(width, height)
  const softContext = soft.getContext('2d')!
  softContext.filter = `blur(${feather}px)`
  softContext.drawImage(canvas, 0, 0)
  return soft
}

/** The 4K picture masked by `alpha` (working size) and cropped to `crop` (working px). */
async function cutout(full: HTMLCanvasElement, alpha: HTMLCanvasElement, crop: Rect, workWidth: number, save: (blob: Blob) => Promise<string>) {
  const k = full.width / workWidth
  const target = { x: Math.floor(crop.x * k), y: Math.floor(crop.y * k), w: Math.ceil(crop.w * k), h: Math.ceil(crop.h * k) }
  const canvas = canvasOf(target.w, target.h)
  const context = canvas.getContext('2d')!
  context.drawImage(full, target.x, target.y, target.w, target.h, 0, 0, target.w, target.h)
  context.globalCompositeOperation = 'destination-in'
  context.imageSmoothingQuality = 'high'
  context.drawImage(alpha, crop.x, crop.y, crop.w, crop.h, 0, 0, target.w, target.h)
  return save(await encodeCanvas(canvas, true))
}

/* ── the pipeline ────────────────────────────────────────────────────── */

function analysedRect(object: DesignObject, width: number, height: number): Rect | null {
  const bounds = object.transform.bounds
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  return { x: (bounds.x / 100) * width, y: (bounds.y / 100) * height, w: (bounds.width / 100) * width, h: (bounds.height / 100) * height }
}

async function candidateFaces(preferred: string | null | undefined) {
  const faces: Face[] = BUNDLED_FAMILIES.flatMap(item => item.weights.map(weight => ({ family: item.family, weight })))
  await preloadFonts(faces.map(face => ({ family: face.family, weight: face.weight })))
  await Promise.all(faces.map(face => document.fonts?.load(`${face.weight} 40px "${face.family}"`).catch(() => undefined)))
  const usable = faces.filter(face => !document.fonts || document.fonts.check(`${face.weight} 40px "${face.family}"`))
  const wanted = preferred?.toLowerCase()
  return wanted ? [...usable.filter(face => face.family.toLowerCase() === wanted), ...usable.filter(face => face.family.toLowerCase() !== wanted)] : usable
}

export async function runMagicLayers(options: MagicLayersOptions): Promise<MagicLayersResult> {
  const { source, document: doc, analysed, frame, wholeFlyer, saveAsset, onProgress } = options
  const warnings: string[] = []
  const progress = (stage: string, fraction: number) => onProgress?.(stage, fraction)

  // Working copy for analysis, and the 4K copy every picture layer is cut from.
  progress('Reading the picture', 0.04)
  const native = dims(source)
  const workScale = Math.min(1, WORK_LONG_EDGE / Math.max(native.width, native.height))
  const work = canvasOf(native.width * workScale, native.height * workScale)
  const workContext = work.getContext('2d', { willReadFrequently: true })!
  workContext.imageSmoothingQuality = 'high'
  workContext.drawImage(source, 0, 0, work.width, work.height)
  const W = work.width, H = work.height
  const image = workContext.getImageData(0, 0, W, H)
  const full = renderAt4K(source)

  // Document units: picture px → document percent and document px.
  const toDocPercent = (rect: Rect): PercentBox => ({
    x: frame.x + (rect.x / W) * frame.width,
    y: frame.y + (rect.y / H) * frame.height,
    width: (rect.w / W) * frame.width,
    height: (rect.h / H) * frame.height,
  })
  const docPxPerWorkPx = ((frame.width / 100) * (doc.canvas.width || W)) / W

  const claimed = new Uint8Array(W * H)
  const objects: DesignObject[] = []

  /* Text */
  progress('Finding the text', 0.12)
  const textBlocks = analysed.filter(object => TEXT_KINDS.has(object.kind) && (object.content.text || '').trim())
    .map(object => ({ object, rect: analysedRect(object, W, H) }))
    .filter((block): block is { object: DesignObject; rect: Rect } => Boolean(block.rect))
    .sort((a, b) => a.rect.y - b.rect.y)
  const faces = textBlocks.length ? await candidateFaces(textBlocks[0].object.style.fontFamily) : []

  const textLayers: DesignObject[] = []
  for (const [index, { object, rect }] of textBlocks.entries()) {
    progress('Matching the type', 0.12 + 0.3 * (index / Math.max(1, textBlocks.length)))
    const ink = findInk(image, rect, claimed, { x: 0.08, y: 0.3 })
    if (!ink || !faces.length) {
      warnings.push(`“${(object.content.text || '').slice(0, 24)}” stayed in the picture: its letters could not be separated from the backdrop.`)
      continue
    }
    const text = object.content.text || ''
    const words = text.split(/\s+/).filter(Boolean)
    const declaredLines = text.split(/\n+/).map(line => line.trim()).filter(Boolean).length

    // Line layouts to try: the bands as found, the analyser's own line count,
    // and, for a single band, one to four lines split at its waists.
    const layouts: Rect[][] = [ink.bands]
    if (declaredLines > 1 && declaredLines !== ink.bands.length) {
      const split = splitBand(ink.box, ink.mask, W, declaredLines)
      if (split) layouts.push(split)
    }
    if (ink.bands.length === 1) {
      for (let count = 2; count <= Math.min(4, words.length); count += 1) {
        const split = splitBand(ink.bands[0], ink.mask, W, count)
        if (split) layouts.push(split)
      }
    }

    const preferredWeight = String(object.style.fontWeight || '')
    let best: { face: Face; fitted: FittedLine[]; score: number } | null = null
    for (const [layoutIndex, bands] of layouts.entries()) {
      const lines = wordsPerBand(text, bands)
      const lineBands = lines.length === bands.length ? bands : [ink.box]
      for (const face of faces) {
        const fitted = lines.map((line, i) => fitFace(line, face, lineBands[i], ink.mask, W))
        if (fitted.some(item => !item)) continue
        const items = fitted as FittedLine[]
        let score = items.reduce((sum, item) => sum + item.score * item.ink.w, 0) / items.reduce((sum, item) => sum + item.ink.w, 0)
        if (face.family.toLowerCase() === (object.style.fontFamily || '').toLowerCase()) score += 0.015
        if (preferredWeight && face.weight === preferredWeight) score += 0.005
        // The bands as found are the likeliest reading; a split has to earn its place.
        if (layoutIndex > 0) score -= 0.02
        if (!best || score > best.score) best = { face, fitted: items, score }
      }
    }
    // Text that no bundled face reproduces stays in the picture, exactly as it was,
    // rather than being swapped for type that does not look like it.
    if (!best || best.score < 0.3) {
      warnings.push(`“${text.slice(0, 24)}” stayed in the picture: no available font matched it closely.`)
      continue
    }

    // The text leaves the backdrop: its ink (plus its anti-aliased halo) becomes a hole.
    const grown = dilate(ink.mask, W, H, 2)
    for (let i = 0; i < grown.length; i += 1) if (grown[i]) claimed[i] = 1

    const colour = hex(ink.colour)
    const lineObjects = best.fitted.map((line, i) => {
      // Konva puts a single line's alphabetic baseline at H/2 + (fontAscent - fontDescent)/2.
      const boxHeight = Math.max(line.size * 1.2, line.ink.h + 4)
      const baseline = line.ink.y + line.ascent
      const boxY = baseline - boxHeight / 2 - (line.fontAscent - line.fontDescent) / 2
      const boxX = line.ink.x + line.left
      const boxWidth = line.advance + line.spacing * [...line.text].length + line.size * 0.08 + 2
      const layer = makeLayer(doc, 'text', {
        text: line.text,
        name: line.text.slice(0, 32),
        bounds: toDocPercent({ x: boxX, y: boxY, w: boxWidth, h: boxHeight }),
        fill: colour,
        fontFamily: line.face.family,
        fontWeight: line.face.weight,
        fontSize: Math.round(line.size * docPxPerWorkPx * 10) / 10,
        textAlign: 'left',
        zIndex: 0,
      })
      layer.style.lineHeight = Math.round((boxHeight / line.size) * 1000) / 1000
      layer.style.letterSpacing = Math.round(line.spacing * docPxPerWorkPx * 100) / 100
      layer.source = { provider: 'magic-layers', confidence: Math.round(line.score * 100) / 100, evidence: [`font-match:${line.face.family}/${line.face.weight}`, `line:${i + 1}/${best!.fitted.length}`] }
      return layer
    })
    textLayers.push(...lineObjects)
  }

  /* Marks: logos, icons, QR codes */
  progress('Lifting logos and marks', 0.46)
  const markLayers: DesignObject[] = []
  for (const object of analysed.filter(item => MARK_KINDS.has(item.kind))) {
    const rect = analysedRect(object, W, H)
    if (!rect || rect.w * rect.h > W * H * 0.2) continue
    const ink = findInk(image, rect, claimed, { x: 0.06, y: 0.06 })
    if (!ink) continue
    const grown = dilate(ink.mask, W, H, 1)
    const alpha = maskCanvas(grown, W, H, 0.6)
    const pad = 2
    const crop = clampRect({ x: ink.box.x - pad, y: ink.box.y - pad, w: ink.box.w + pad * 2, h: ink.box.h + pad * 2 }, W, H)
    const id = await cutout(full, alpha, crop, W, saveAsset)
    const hole = dilate(ink.mask, W, H, 2)
    for (let i = 0; i < hole.length; i += 1) if (hole[i]) claimed[i] = 1
    const layer = makeLayer(doc, 'image', { assetRef: `asset:${id}`, name: object.name || 'Logo', bounds: toDocPercent(crop), zIndex: 0 })
    layer.kind = object.kind === 'qr-code' ? 'qr-code' : 'logo'
    layer.source = { provider: 'magic-layers', confidence: 0.9, evidence: ['mark-cutout'] }
    markLayers.push(layer)
  }

  /* Subject */
  progress('Cutting out the subject', 0.52)
  let subjectLayer: DesignObject | null = null
  let subjectHole: Uint8Array | null = null
  try {
    const matte = await segmentFlyer(work.toDataURL('image/png'))
    const matteContext = canvasOf(W, H).getContext('2d', { willReadFrequently: true })!
    matteContext.drawImage(matte.canvas, 0, 0, W, H)
    const matteData = matteContext.getImageData(0, 0, W, H).data
    // Where the analyser marked photos, the subject stays inside them (a little
    // margin for hair and hands): the matte also likes buttons and badges.
    const photos = analysed
      .filter(item => item.kind === 'image' && !item.status.removed)
      .map(item => analysedRect(item, W, H))
      .filter((rect): rect is Rect => Boolean(rect) && rect!.w * rect!.h > W * H * 0.04)
      .map(rect => ({ x0: rect.x - rect.w * 0.06, y0: rect.y - rect.h * 0.06, x1: rect.x + rect.w * 1.06, y1: rect.y + rect.h * 1.06 }))
    const inPhoto = (x: number, y: number) => !photos.length || photos.some(rect => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1)
    const alpha = new Uint8ClampedArray(W * H)
    for (let i = 0; i < W * H; i += 1) {
      const x = i % W, y = (i - x) / W
      alpha[i] = claimed[i] || !inPhoto(x, y) ? 0 : matteData[i * 4 + 3]
    }

    // Drop specks: keep components holding at least 0.3% of the picture.
    const solid = new Uint8Array(W * H)
    for (let i = 0; i < solid.length; i += 1) solid[i] = alpha[i] > 24 ? 1 : 0
    const { labels, stats } = components(solid, W, H)
    const minArea = W * H * 0.003
    let area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
    for (let i = 0; i < solid.length; i += 1) {
      if (!solid[i]) continue
      const stat = stats[labels[i] - 1]
      if (stat.area < minArea) { alpha[i] = 0; continue }
      area += 1
      const x = i % W, y = (i - x) / W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const share = area / (W * H)
    if (share > 0.015 && share < 0.85) {
      const crop = clampRect({ x: x0 - 2, y: y0 - 2, w: x1 - x0 + 5, h: y1 - y0 + 5 }, W, H)
      // The subject's solid core is made fully opaque and only that core is filled
      // behind it, so a half-transparent matte never lets the fill show through:
      // before anything moves, the picture looks exactly as it did.
      const core = new Uint8Array(W * H)
      for (let i = 0; i < core.length; i += 1) if (alpha[i] > 160) { core[i] = 1; alpha[i] = 255 }
      const id = await cutout(full, maskCanvas(alpha, W, H), crop, W, saveAsset)
      subjectLayer = makeLayer(doc, 'image', { assetRef: `asset:${id}`, name: 'Subject', bounds: toDocPercent(crop), zIndex: 0 })
      subjectLayer.source = { provider: 'magic-layers', confidence: 0.9, evidence: ['subject-matte'] }
      subjectHole = dilate(core, W, H, 1)
    } else if (share <= 0.015) {
      warnings.push('No clear subject was found, so the picture stayed in the background.')
    }
  } catch (error) {
    warnings.push(`The subject could not be cut out: ${error instanceof Error ? error.message : 'segmentation failed'}.`)
  }

  /* Background */
  progress('Filling in the background', 0.8)
  const hole = new Uint8Array(W * H)
  for (let i = 0; i < hole.length; i += 1) hole[i] = claimed[i] || (subjectHole && subjectHole[i]) ? 1 : 0
  const filled = inpaint(image, dilate(hole, W, H, 1))
  const patch = canvasOf(W, H)
  const patchContext = patch.getContext('2d')!
  patchContext.putImageData(filled, 0, 0)
  // Only the gaps take the fill; the rest keeps the 4K original's own pixels.
  patchContext.globalCompositeOperation = 'destination-in'
  patchContext.drawImage(maskCanvas(dilate(hole, W, H, 2), W, H, 1.2), 0, 0)
  const backdrop = canvasOf(full.width, full.height)
  const backdropContext = backdrop.getContext('2d')!
  backdropContext.drawImage(full, 0, 0)
  backdropContext.imageSmoothingQuality = 'high'
  backdropContext.drawImage(patch, 0, 0, full.width, full.height)
  const backgroundId = await saveAsset(await encodeCanvas(backdrop, false))

  const background = makeLayer(doc, 'image', {
    assetRef: `asset:${backgroundId}`,
    name: wholeFlyer ? 'Background' : 'Picture background',
    bounds: { ...frame },
    zIndex: 0,
  })
  background.source = { provider: 'magic-layers', confidence: 1, evidence: ['inpainted-background'] }
  if (wholeFlyer) {
    background.kind = 'background'
    background.protection = { locked: true, editableProperties: ['assetRef'], protectedProperties: ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'identity'] }
    background.constraints = { ...background.constraints, lockPosition: true, lockSize: true, lockRotation: true, stayInsideCanvas: true, fit: 'cover' }
  }

  // Stack: background, subject, marks, then text top to bottom.
  const ordered = [background, ...(subjectLayer ? [subjectLayer] : []), ...markLayers, ...textLayers]
  const baseZ = wholeFlyer ? 0 : doc.objects.reduce((max, object) => Math.max(max, object.zIndex), 0) + 1
  ordered.forEach((object, index) => { object.zIndex = baseZ + index })
  objects.push(...ordered)

  progress('Done', 1)
  return { objects, warnings }
}
