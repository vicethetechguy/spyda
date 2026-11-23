import type { DesignDocument, DesignObject, PercentBox } from '../core/design-document'
import { BUNDLED_FAMILIES, preloadFonts } from './fonts'
import { makeLayer } from './editor-objects'
import { segmentFlyer } from './segmentation'
import { encodeCanvas, renderAt4K } from './image-4k'
import { outlineBoxes, type SamCandidates, type SamOutline } from './sam'

/**
 * Magic Layers: one flat picture in, the same picture out as separate,
 * editable layers that look identical until you move something.
 *
 *  - Text is found to the pixel by OCR and lifted with its own pixels (matted
 *    off its backdrop), so it looks exactly as it did. The closest bundled
 *    font, size and spacing are worked out too, and the layer becomes live
 *    text the moment the person edits it.
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

/**
 * Where paper ends and ink begins, as a colour distance. Otsu's split alone
 * lands between the two strongest groups, which in a two-colour headline is
 * between its colours, dropping one of them. So the cut is the end of the
 * paper's own peak (where the histogram falls away), never above Otsu.
 */
function inkThreshold(distance: Float32Array) {
  const upper = otsu(distance, distance.length)
  const bins = new Float64Array(112)
  for (let i = 0; i < distance.length; i += 1) bins[Math.min(111, Math.floor(distance[i] / 4))] += 1
  let peak = 0
  for (let i = 0; i < 16; i += 1) if (bins[i] > bins[peak]) peak = i
  let end = peak
  while (end < 111 && bins[end + 1] > bins[peak] * 0.02) end += 1
  return Math.max(36, Math.min(upper, (end + 2) * 4))
}

/** One step of erosion: a pixel stays only if its whole 3x3 neighbourhood is set. */
function erodeOnce(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (!mask[i]) continue
      if (mask[i - 1] && mask[i + 1] && mask[i - width] && mask[i + width] && mask[i - width - 1] && mask[i - width + 1] && mask[i + width - 1] && mask[i + width + 1]) out[i] = 1
    }
  }
  return out
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
  /** The backdrop colour the ink was separated from. */
  paper: Rgb
  /** Separate pieces of ink kept (roughly one per letter). */
  pieces: number
  /** Every distinct ink colour (two-colour headlines have two). */
  colours: Rgb[]
}

/**
 * `tight` boxes (from OCR) hug the letters, and bold type can fill most of
 * them, so their paper is sampled from a thin ring just outside the box.
 * Loose boxes (from the analyser) take the colour their inside mostly is.
 */
function findInk(image: ImageData, box: Rect, claimed: Uint8Array, expand: { x: number; y: number }, tight = false, grow = tight): Ink | null {
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
  const ringWidth = Math.max(2, Math.round(Math.min(inner.h * 0.25, 10)))
  const sample = tight
    ? clampRect({ x: inner.x - ringWidth, y: inner.y - ringWidth, w: inner.w + ringWidth * 2, h: inner.h + ringWidth * 2 }, width, height)
    : inner
  for (let y = sample.y; y < sample.y + sample.h; y += 1) {
    for (let x = sample.x; x < sample.x + sample.w; x += 1) {
      if (tight && x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h) continue
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
  const threshold = inkThreshold(distance)
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
  // The colour of the clean letters, for judging the joined pieces below.
  const clean: number[][] = [[], [], []]
  for (let i = 0; i < local.length && clean[0].length < 8000; i += 1) {
    if (keep[labels[i]] !== 1 || distance[i] < threshold * 1.3) continue
    const x = i % rw, y = (i - x) / rw
    const at = ((region.y + y) * width + region.x + x) * 4
    clean[0].push(data[at]); clean[1].push(data[at + 1]); clean[2].push(data[at + 2])
  }
  const letterColour: Rgb | null = clean[0].length ? [median(clean[0]), median(clean[1]), median(clean[2])] : null
  const pad = 3
  const insideBox = (x: number, y: number) => x >= innerLocal.x0 - pad && x <= innerLocal.x1 + pad && y >= innerLocal.y0 - pad && y <= innerLocal.y1 + pad
  const joined = new Uint8Array(local.length)
  for (let i = 0; i < local.length; i += 1) {
    if (keep[labels[i]] !== 2) continue
    const x = i % rw, y = (i - x) / rw
    if (!insideBox(x, y)) { labels[i] = 0; continue }
    // Only pixels of the letters' own colour: a panel's edge or a wave is not a letter.
    if (letterColour) {
      const at = ((region.y + y) * width + region.x + x) * 4
      const off = Math.hypot(data[at] - letterColour[0], data[at + 1] - letterColour[1], data[at + 2] - letterColour[2])
      if (off > Math.max(60, threshold * 0.8)) { labels[i] = 0; continue }
    }
    joined[i] = 1
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
  // A line OCR read only partly (two-colour headlines, a word it could not read)
  // grows sideways along its baseline: pieces level with it, of letter height and
  // within a word gap of what is already kept, belong to the same line.
  const bandOf = new Map<number, [number, number]>()
  if (grow) {
    const kept = () => stats.map((stat, index) => ({ stat, index })).filter(({ index }) => keep[index + 1] === 1)
    const letterHeights = kept().filter(({ stat }) => stat.area >= 6).map(({ stat }) => stat.y1 - stat.y0 + 1)
    const letter = letterHeights.length ? median(letterHeights) : 0
    if (letter > 0) {
      // Dividers: thin pieces taller than the letters. Growth never crosses one.
      const walls = stats.filter(stat => stat.y1 - stat.y0 + 1 > letter * 1.6 && stat.x1 - stat.x0 + 1 < letter * 0.35)
      const level = (a: { y0: number; y1: number }, b: { y0: number; y1: number }) =>
        Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / Math.max(1, Math.min(a.y1 - a.y0, b.y1 - b.y0) + 1)
      let grew = true
      while (grew) {
        grew = false
        const current = kept()
        for (const [index, stat] of stats.entries()) {
          if (keep[index + 1] || stat.area < 4) continue
          const height = stat.y1 - stat.y0 + 1
          const touches = stat.x0 === 0 || stat.y0 === 0 || stat.x1 === rw - 1 || stat.y1 === rh - 1
          // A tall piece is allowed when it is wide: a word joined to a divider. The
          // divider is opened out of it below; a bare line (narrow) never is.
          const width = stat.x1 - stat.x0 + 1
          if (height < letter * 0.12 || (height > letter * 1.5 && width < letter * 1.2)) continue
          const joined = touches || height > letter * 1.5
          // The kept letters on the same line as this piece, and the gap to the nearest.
          const sameLine = current.filter(({ stat: other }) => level(stat, other) >= 0.5)
          if (!sameLine.length) continue
          let gap = Infinity, nearest = sameLine[0].stat
          for (const { stat: other } of sameLine) {
            const g = stat.x1 < other.x0 ? other.x0 - stat.x1 : stat.x0 > other.x1 ? stat.x0 - other.x1 : 0
            if (g < gap) { gap = g; nearest = other }
          }
          if (gap > letter * 0.9) continue
          const from = Math.min(stat.x1, nearest.x1), to = Math.max(stat.x0, nearest.x0)
          const blocked = walls.some(wall => wall.x0 >= from && wall.x1 <= to && level(wall, stat) > 0.5)
          if (blocked) continue
          if (joined) {
            // Only its part level with the line it sits on comes along.
            const line = sameLine.map(({ stat: other }) => other)
            bandOf.set(index + 1, [Math.min(...line.map(s => s.y0)) - letter * 0.12, Math.max(...line.map(s => s.y1)) + letter * 0.12])
            keep[index + 1] = 3
          } else keep[index + 1] = 1
          grew = true
        }
      }
    }
  }
  if (bandOf.size) {
    const cleanSamples: Rgb[] = []
    for (let i = 0; i < local.length && cleanSamples.length < 8000; i += 1) {
      if (keep[labels[i]] !== 1 || distance[i] < threshold * 1.3) continue
      const x = i % rw, y = (i - x) / rw
      const at = ((region.y + y) * width + region.x + x) * 4
      cleanSamples.push([data[at], data[at + 1], data[at + 2]])
    }
    const lineColours = inkColours(cleanSamples, paper)
    const banded = new Uint8Array(local.length)
    for (let i = 0; i < local.length; i += 1) {
      const band = bandOf.get(labels[i])
      if (!band) continue
      const x = i % rw, y = (i - x) / rw
      const at = ((region.y + y) * width + region.x + x) * 4
      const near = lineColours.some(c => Math.hypot(data[at] - c[0], data[at + 1] - c[1], data[at + 2] - c[2]) < Math.max(70, threshold))
      if (y >= band[0] && y <= band[1] && near) banded[i] = 1
      else labels[i] = 0
    }
    const openedBand = dilate(erodeOnce(banded, rw, rh), rw, rh, 1)
    for (let i = 0; i < local.length; i += 1) if (banded[i] && !openedBand[i]) labels[i] = 0
    for (const id of bandOf.keys()) keep[id] = 1
  }
  // Letters share a height; a piece far taller than the typical letter is a stray shape.
  // But a letter touching a divider or an underline joins it into one tall piece:
  // thin lines are opened out of such a piece and its letter-sized parts kept.
  const rescued = new Uint8Array(local.length)
  let rescuedPieces = 0
  const heights = stats.filter((stat, index) => keep[index + 1] === 1 && stat.area >= 6).map(stat => stat.y1 - stat.y0 + 1)
  if (heights.length >= 3) {
    const typical = median(heights)
    stats.forEach((stat, index) => {
      if (keep[index + 1] !== 1 || stat.y1 - stat.y0 + 1 <= typical * 2.6) return
      keep[index + 1] = 0
      const bw = stat.x1 - stat.x0 + 1, bh = stat.y1 - stat.y0 + 1
      const piece = new Uint8Array(bw * bh)
      for (let y = 0; y < bh; y += 1) for (let x = 0; x < bw; x += 1) {
        if (labels[(stat.y0 + y) * rw + stat.x0 + x] === index + 1) piece[y * bw + x] = 1
      }
      const radius = Math.max(2, Math.round(typical * 0.06))
      const eroded = new Uint8Array(piece.length)
      for (let y = radius; y < bh - radius; y += 1) for (let x = radius; x < bw - radius; x += 1) {
        let solid = true
        for (let dy = -radius; dy <= radius && solid; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
          if (!piece[(y + dy) * bw + x + dx]) { solid = false; break }
        }
        if (solid) eroded[y * bw + x] = 1
      }
      const opened = dilate(eroded, bw, bh, radius)
      for (let i = 0; i < piece.length; i += 1) piece[i] = piece[i] && opened[i] ? 1 : 0
      const parts = components(piece, bw, bh)
      parts.stats.forEach((part, partIndex) => {
        const height = part.y1 - part.y0 + 1
        if (part.area < 6 || height > typical * 1.8) return
        rescuedPieces += 1
        for (let y = part.y0; y <= part.y1; y += 1) for (let x = part.x0; x <= part.x1; x += 1) {
          if (parts.labels[y * bw + x] === partIndex + 1) rescued[(stat.y0 + y) * rw + stat.x0 + x] = 1
        }
      })
    })
  }

  const mask = new Uint8Array(width * height)
  let pixels = 0, x0 = width, y0 = height, x1 = 0, y1 = 0
  const ink: number[][] = [[], [], []]
  const strengths: number[] = []
  for (let i = 0; i < local.length; i += 1) if ((keep[labels[i]] || rescued[i]) && strengths.length < 40000) strengths.push(distance[i])
  const strong = strengths.length ? [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length * 0.6)] : threshold
  const rows = new Int32Array(rh)
  const solidInk: Rgb[] = []
  for (let i = 0; i < local.length; i += 1) {
    if (!keep[labels[i]] && !rescued[i]) continue
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
      solidInk.push([data[(gy * width + gx) * 4], data[(gy * width + gx) * 4 + 1], data[(gy * width + gx) * 4 + 2]])
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
        if (keep[labels[y * rw + x]] || rescued[y * rw + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x }
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
    paper,
    pieces: stats.filter((stat, index) => keep[index + 1] === 1 && stat.area >= 4).length + rescuedPieces,
    colours: inkColours(solidInk, paper),
  }
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

/* ── reading the text: OCR for exact positions ───────────────────────── */

type TextLine = { text: string; rect: Rect; confidence: number }

/**
 * Tesseract finds where every line of text really is, to the pixel. The
 * analyser's boxes are rough (often off by a tenth of the flyer), so they are
 * only used to correct spelling, never to decide what gets cut.
 */
type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>

async function startOcr(onProgress: (fraction: number) => void) {
  const { createWorker } = await import('tesseract.js')
  return createWorker('eng', 1, {
    logger: message => { if (message.status === 'recognizing text') onProgress(message.progress) },
  })
}

async function readTextLines(work: HTMLCanvasElement, worker: OcrWorker): Promise<TextLine[]> {
  const { PSM } = await import('tesseract.js')
  // Small pictures are enlarged so the letters are big enough to read.
  const scale = Math.max(1, Math.min(3, 1800 / Math.max(work.width, work.height)))
  const input = canvasOf(work.width * scale, work.height * scale)
  const context = input.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(work, 0, 0, input.width, input.height)

  {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(input, {}, { blocks: true, text: true })
    const lines: TextLine[] = []
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const words = line.words.filter(word => word.confidence >= 50 && /[\p{L}\p{N}]/u.test(word.text))
          if (!words.length) continue
          // A wide gap on one row means two separate pieces of text (a phone number and a handle).
          let group: typeof words = []
          const flush = () => {
            if (!group.length) return
            const x0 = Math.min(...group.map(word => word.bbox.x0)), y0 = Math.min(...group.map(word => word.bbox.y0))
            const x1 = Math.max(...group.map(word => word.bbox.x1)), y1 = Math.max(...group.map(word => word.bbox.y1))
            const confidence = group.reduce((sum, word) => sum + word.confidence, 0) / group.length
            const text = group.map(word => word.text).join(' ').trim()
            if ((y1 - y0) / scale >= 6 && text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 && confidence >= 62) {
              lines.push({ text, confidence, rect: { x: x0 / scale, y: y0 / scale, w: (x1 - x0) / scale, h: (y1 - y0) / scale } })
            }
            group = []
          }
          for (const word of words) {
            const last = group[group.length - 1]
            const height = last ? last.bbox.y1 - last.bbox.y0 : 0
            if (last && word.bbox.x0 - last.bbox.x1 > height * 2.2) flush()
            group.push(word)
          }
          flush()
        }
      }
    }
    return lines
  }
}

/**
 * Reads a candidate's ink on its own: the mask drawn black on white, at a size
 * OCR likes. Busy backdrops, crossing lines and two-colour type stop mattering,
 * and a sparkle or a sleeve reads as nothing like the words it was meant to be.
 */
async function readInk(worker: OcrWorker, ink: Ink, width: number) {
  const { PSM } = await import('tesseract.js')
  const lineHeight = ink.box.h / Math.max(1, ink.bands.length)
  const scale = Math.max(0.5, Math.min(4, 56 / Math.max(1, lineHeight)))
  const pad = 16
  const canvas = canvasOf(ink.box.w * scale + pad * 2, ink.box.h * scale + pad * 2)
  const context = canvas.getContext('2d')!
  const picture = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const sx = Math.floor((x - pad) / scale) + ink.box.x, sy = Math.floor((y - pad) / scale) + ink.box.y
      const on = x >= pad && y >= pad && sx < ink.box.x + ink.box.w && sy < ink.box.y + ink.box.h && ink.mask[sy * width + sx] === 1
      const at = (y * canvas.width + x) * 4
      const value = on ? 0 : 255
      picture.data[at] = value; picture.data[at + 1] = value; picture.data[at + 2] = value; picture.data[at + 3] = 255
    }
  }
  context.putImageData(picture, 0, 0)
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  const { data } = await worker.recognize(canvas)
  return data.text || ''
}

/** Lower-case letters and digits only, for comparing what OCR read with what the analyser read. */
function letters(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function similarity(a: string, b: string) {
  if (!a.length || !b.length) return 0
  const previous = new Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

/**
 * The run of the analyser's words that the ink actually says: an analyser block
 * can cover two lines while its ink is only the first.
 */
function wordsMatching(read: string, text: string) {
  const words = text.split(/\s+/).filter(Boolean)
  const target = letters(read)
  let best = { text, score: -1 }
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      const candidate = words.slice(start, end).join(' ')
      const score = similarity(target, letters(candidate))
      if (score > best.score) best = { text: candidate, score }
    }
  }
  return best.text
}

/** The analyser's spelling (case, punctuation) of an OCR line, when one of its lines says the same thing. */
function bestSpelling(ocr: string, analysed: DesignObject[]) {
  const target = letters(ocr)
  let best = { text: ocr, score: 0 }
  for (const object of analysed) {
    for (const candidate of (object.content.text || '').split(/\n+/)) {
      const score = similarity(target, letters(candidate))
      if (score > best.score) best = { text: candidate.trim(), score }
    }
  }
  return best.score >= 0.72 ? best.text : ocr
}

/* ── matting: lifting ink off its paper without a halo ───────────────── */

/**
 * Text and marks are lifted with their own pixels: for each pixel, the share
 * of ink over paper becomes its alpha and the paper's colour is taken back out
 * of it. Over the filled background the layer reproduces the original pixel for
 * pixel; moved onto anything else it carries no ring of the old backdrop.
 */
/**
 * The distinct colours of a piece of ink: k-means with up to three centres,
 * keeping a centre only when it is clearly its own colour.
 */
function inkColours(samples: Rgb[], paper: Rgb): Rgb[] {
  if (!samples.length) return [[255, 255, 255]]
  let best: Rgb[] = [[median(samples.map(s => s[0])), median(samples.map(s => s[1])), median(samples.map(s => s[2]))]]
  for (const k of [2, 3]) {
    let centres: Rgb[] = Array.from({ length: k }, (_, i) => samples[Math.floor(((i + 0.5) / k) * samples.length)])
    // Seed far apart: sort by brightness so the seeds span dark to light.
    const sorted = [...samples].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
    centres = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)])
    for (let round = 0; round < 8; round += 1) {
      const sums = centres.map(() => [0, 0, 0, 0])
      for (const s of samples) {
        let nearest = 0, d = Infinity
        centres.forEach((c, i) => { const e = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2; if (e < d) { d = e; nearest = i } })
        sums[nearest][0] += s[0]; sums[nearest][1] += s[1]; sums[nearest][2] += s[2]; sums[nearest][3] += 1
      }
      centres = sums.map((sum, i) => (sum[3] ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] : centres[i]) as Rgb)
    }
    const counts = centres.map(c => samples.filter(s => Math.hypot(s[0] - c[0], s[1] - c[1], s[2] - c[2]) < 60).length)
    const distinct = centres.every((a, i) => centres.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 70))
    const substantial = counts.every(count => count > samples.length * 0.06)
    const offPaper = centres.every(c => Math.hypot(c[0] - paper[0], c[1] - paper[1], c[2] - paper[2]) > 40)
    if (distinct && substantial && offPaper) best = centres
  }
  return best
}

/** How much of `ink` (the nearest of its colours) covers `paper` at this pixel, 0..1, and that colour. */
function unmix(r: number, g: number, b: number, paper: Rgb, colours: Rgb[]) {
  let alpha = 0, colour = colours[0], residual = Infinity
  for (const c of colours) {
    const dx = c[0] - paper[0], dy = c[1] - paper[1], dz = c[2] - paper[2]
    const length = Math.max(1, dx * dx + dy * dy + dz * dz)
    const t = Math.max(0, Math.min(1, ((r - paper[0]) * dx + (g - paper[1]) * dy + (b - paper[2]) * dz) / length))
    const off = Math.hypot(r - (paper[0] + t * dx), g - (paper[1] + t * dy), b - (paper[2] + t * dz))
    if (off < residual) { residual = off; alpha = t; colour = c }
  }
  return { alpha, colour }
}

/**
 * A mark's whole shape: for a compact mark (an app icon, a coin, a badge) the
 * span of each row and column, so the letter inside a logo's square comes along
 * even when it reaches the square's edge; for a sprawling one, only what its
 * outline encloses.
 */
function markShape(mask: Uint8Array, box: Rect, width: number) {
  const enclosed = fillEnclosed(mask, box, width)
  const rows = Array.from({ length: box.h }, () => [Infinity, -1])
  const cols = Array.from({ length: box.w }, () => [Infinity, -1])
  let area = 0
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      if (!enclosed[(box.y + y) * width + box.x + x]) continue
      area += 1
      rows[y][0] = Math.min(rows[y][0], x); rows[y][1] = Math.max(rows[y][1], x)
      cols[x][0] = Math.min(cols[x][0], y); cols[x][1] = Math.max(cols[x][1], y)
    }
  }
  const out = new Uint8Array(enclosed)
  let hull = 0
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      if (x >= rows[y][0] && x <= rows[y][1] && y >= cols[x][0] && y <= cols[x][1]) hull += 1
    }
  }
  // A shape mostly made of its outline (a wordmark, scattered pieces) keeps only what it encloses.
  if (!area || hull > area * 1.7) return enclosed
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      if (x >= rows[y][0] && x <= rows[y][1] && y >= cols[x][0] && y <= cols[x][1]) out[(box.y + y) * width + box.x + x] = 1
    }
  }
  return out
}

/**
 * Adds every pixel the mask encloses within `box`: anything the box's border
 * cannot reach without crossing the mask. A logo's inner letter or a coin's
 * symbol is part of the mark even when it has the backdrop's colour.
 */
function fillEnclosed(mask: Uint8Array, box: Rect, width: number) {
  const out = new Uint8Array(mask)
  const bw = box.w + 2, bh = box.h + 2
  const outside = new Uint8Array(bw * bh)
  const at = (x: number, y: number) => {
    const gx = box.x + x - 1, gy = box.y + y - 1
    return gx < box.x || gy < box.y || gx >= box.x + box.w || gy >= box.y + box.h ? 0 : mask[gy * width + gx]
  }
  const stack: number[] = [0]
  outside[0] = 1
  while (stack.length) {
    const i = stack.pop()!
    const x = i % bw, y = (i - x) / bw
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
      const n = ny * bw + nx
      if (outside[n] || at(nx, ny)) continue
      outside[n] = 1
      stack.push(n)
    }
  }
  for (let y = 1; y < bh - 1; y += 1) {
    for (let x = 1; x < bw - 1; x += 1) {
      if (!outside[y * bw + x]) out[(box.y + y - 1) * width + box.x + x - 1] = 1
    }
  }
  return out
}

/** Pixels (working size) inside `mask` where ink covers at least `minimum` of the paper. */
function coverage(image: ImageData, mask: Uint8Array, crop: Rect, paper: Rgb, colours: Rgb[], minimum: number) {
  const out = new Uint8Array(mask.length)
  for (let y = crop.y; y < crop.y + crop.h; y += 1) {
    for (let x = crop.x; x < crop.x + crop.w; x += 1) {
      const i = y * image.width + x
      if (!mask[i]) continue
      const at = i * 4
      if (unmix(image.data[at], image.data[at + 1], image.data[at + 2], paper, colours).alpha >= minimum) out[i] = 1
    }
  }
  return out
}

function matteCrop(full: HTMLCanvasElement, crop: Rect, workWidth: number, mask: Uint8Array, maskWidth: number, paper: Rgb, ink: Rgb[] | null) {
  const k = full.width / workWidth
  const target = { x: Math.floor(crop.x * k), y: Math.floor(crop.y * k), w: Math.max(1, Math.ceil(crop.w * k)), h: Math.max(1, Math.ceil(crop.h * k)) }
  const canvas = canvasOf(target.w, target.h)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(full, target.x, target.y, target.w, target.h, 0, 0, target.w, target.h)
  const image = context.getImageData(0, 0, target.w, target.h)
  const data = image.data
  for (let y = 0; y < target.h; y += 1) {
    const my = Math.min(Math.floor((target.y + y) / k), Math.floor(full.height / k) - 1)
    for (let x = 0; x < target.w; x += 1) {
      const mx = Math.min(Math.floor((target.x + x) / k), maskWidth - 1)
      const at = (y * target.w + x) * 4
      if (!mask[my * maskWidth + mx]) { data[at + 3] = 0; continue }
      if (!ink) continue
      const r = data[at], g = data[at + 1], b = data[at + 2]
      const { alpha } = unmix(r, g, b, paper, ink)
      if (alpha < 0.03) { data[at + 3] = 0; continue }
      data[at] = paper[0] + (r - paper[0]) / alpha
      data[at + 1] = paper[1] + (g - paper[1]) / alpha
      data[at + 2] = paper[2] + (b - paper[2]) / alpha
      data[at + 3] = Math.round(alpha * 255)
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/* ── the pipeline ────────────────────────────────────────────────────── */

const TEXT_EDITABLE = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'fill', 'stroke', 'strokeWidth', 'opacity', 'letterSpacing', 'lineHeight', 'assetRef']

export async function runMagicLayers(options: MagicLayersOptions): Promise<MagicLayersResult> {
  const { source, document: doc, analysed, frame, wholeFlyer, saveAsset, onProgress } = options
  const warnings: string[] = []
  const progress = (stage: string, fraction: number) => onProgress?.(stage, fraction)

  progress('Reading the picture', 0.03)
  const native = dims(source)
  const long = Math.max(native.width, native.height)
  const workScale = Math.min(WORK_LONG_EDGE / long, Math.max(1, 1600 / long))
  const work = canvasOf(native.width * workScale, native.height * workScale)
  const workContext = work.getContext('2d', { willReadFrequently: true })!
  workContext.imageSmoothingQuality = 'high'
  workContext.drawImage(source, 0, 0, work.width, work.height)
  const W = work.width, H = work.height
  const image = workContext.getImageData(0, 0, W, H)
  const full = renderAt4K(source)

  const toDocPercent = (rect: Rect): PercentBox => ({
    x: frame.x + (rect.x / W) * frame.width,
    y: frame.y + (rect.y / H) * frame.height,
    width: (rect.w / W) * frame.width,
    height: (rect.h / H) * frame.height,
  })
  const docPxPerWorkPx = ((frame.width / 100) * (doc.canvas.width || W)) / W
  const claimed = new Uint8Array(W * H)
  const searched = new Uint8Array(W * H)

  /* Text: exact lines from OCR, lifted as pixel-exact layers that turn into live text when edited */
  progress('Reading the text', 0.06)
  let lines: TextLine[] = []
  let ocr: OcrWorker | null = null
  try {
    ocr = await startOcr(fraction => progress('Reading the text', 0.06 + fraction * 0.24))
    lines = await readTextLines(work, ocr)
  } catch (error) {
    warnings.push(`The text could not be read (${error instanceof Error ? error.message : 'OCR failed'}), so it stays part of the picture.`)
  }
  const textLayers: DesignObject[] = []
  try {
  const faces = await candidateFaces(analysed.find(item => TEXT_KINDS.has(item.kind))?.style.fontFamily)

  /** Lifts one piece of ink as a pixel-exact text layer that knows its words and closest font. */
  const lift = async (ink: Ink, text: string, confidence: number, evidence: string) => {
    const halo = dilate(ink.mask, W, H, 3)
    const pad = Math.ceil(Math.max(3, ink.box.h * 0.08))
    const crop = clampRect({ x: ink.box.x - pad, y: ink.box.y - pad, w: ink.box.w + pad * 2, h: ink.box.h + pad * 2 }, W, H)
    const lifted = matteCrop(full, crop, W, halo, W, ink.paper, ink.colours)
    const assetId = await saveAsset(await encodeCanvas(lifted, true))
    // Only where the ink really covers the paper is filled behind it: the grain of
    // a photo around the letters stays as it was.
    const covered = coverage(image, halo, crop, ink.paper, ink.colours, 0.12)
    const hole = dilate(covered, W, H, 1)
    for (let i = 0; i < hole.length; i += 1) if (hole[i]) claimed[i] = 1
    for (let i = 0; i < halo.length; i += 1) if (halo[i]) searched[i] = 1

    let best: FittedLine | null = null
    const single = text.replace(/\s*\n\s*/g, ' ')
    for (const face of faces) {
      const fitted = fitFace(single, face, ink.box, ink.mask, W)
      if (fitted && (!best || fitted.score > best.score)) best = fitted
    }
    const layer = makeLayer(doc, 'text', {
      text,
      name: single.slice(0, 32),
      bounds: toDocPercent(crop),
      fill: hex(ink.colour),
      fontFamily: best?.face.family ?? 'Montserrat',
      fontWeight: best?.face.weight ?? '700',
      fontSize: Math.round((best?.size ?? ink.box.h) * docPxPerWorkPx * 10) / 10,
      textAlign: 'left',
      zIndex: 0,
    })
    layer.content.assetRef = `asset:${assetId}`
    layer.protection.editableProperties = [...TEXT_EDITABLE]
    if (best && ink.bands.length <= 1) {
      const boxHeight = Math.max(best.size * 1.2, best.ink.h + 4)
      const baseline = best.ink.y + best.ascent
      const live = {
        x: best.ink.x + best.left,
        y: baseline - boxHeight / 2 - (best.fontAscent - best.fontDescent) / 2,
        w: best.advance + best.spacing * [...single].length + best.size * 0.08 + 2,
        h: boxHeight,
      }
      layer.style.lineHeight = Math.round((boxHeight / best.size) * 1000) / 1000
      layer.style.letterSpacing = Math.round(best.spacing * docPxPerWorkPx * 100) / 100
      layer.legacy = { ...layer.legacy, liveTextBounds: toDocPercent(clampRect(live, W, H)), liftedBounds: toDocPercent(crop) }
    } else if (best) {
      // Several lines: the live text starts as one block over the same box.
      layer.content.text = text
      layer.style.fontSize = Math.round((ink.box.h / Math.max(1, ink.bands.length) / 1.15) * docPxPerWorkPx * 10) / 10
      layer.style.lineHeight = 1.15
      layer.legacy = { ...layer.legacy, liveTextBounds: toDocPercent(crop), liftedBounds: toDocPercent(crop) }
    }
    layer.source = { provider: 'magic-layers', confidence: Math.round(confidence) / 100, evidence: [evidence, 'pixel-text', best ? `font-match:${best.face.family}/${best.face.weight}` : 'font-unmatched'] }
    textLayers.push(layer)
  }

  // Pass 1: lines OCR read with confidence, at their exact positions.
  const accepted: string[] = []
  for (const [index, line] of lines.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x).entries()) {
    progress('Lifting the text', 0.3 + 0.1 * (index / Math.max(1, lines.length)))
    const ink = findInk(image, line.rect, claimed, { x: Math.min(2, (line.rect.h * 6) / Math.max(1, line.rect.w)), y: 0.22 }, true)
    if (!ink) continue
    // The ink must be the line OCR read, not a neighbour or a panel.
    const ox = Math.max(0, Math.min(ink.box.x + ink.box.w, line.rect.x + line.rect.w) - Math.max(ink.box.x, line.rect.x))
    const oy = Math.max(0, Math.min(ink.box.y + ink.box.h, line.rect.y + line.rect.h) - Math.max(ink.box.y, line.rect.y))
    // It covers the line OCR read, at that line's height (it may run wider: words OCR missed on the same line).
    const covered = (ox * oy) / Math.max(1, line.rect.w * line.rect.h)
    const fill = ink.pixels / Math.max(1, ink.box.w * ink.box.h)
    if (covered < 0.55 || ink.box.h > line.rect.h * 1.7 || fill < 0.04 || fill > 0.8) continue
    const text = bestSpelling(line.text, analysed)
    accepted.push(letters(text))
    await lift(ink, text, line.confidence, 'ocr-line')
  }

  // Pass 2: text the analyser saw that OCR could not read (big display type, type
  // crossed by lines). Its boxes are rough, so the ink found near them has to
  // look like that many letters on that many lines before anything is lifted.
  const blocks = analysed.filter(object => TEXT_KINDS.has(object.kind) && (object.content.text || '').trim())
  for (const [index, object] of blocks.entries()) {
    progress('Lifting the text', 0.4 + 0.08 * (index / Math.max(1, blocks.length)))
    const remaining = (object.content.text || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
      .filter(line => !accepted.some(done => similarity(done, letters(line)) >= 0.72 || (letters(line).length > 3 && done.includes(letters(line)))))
    if (!remaining.length) continue
    const rect = analysedRect(object, W, H)
    if (!rect) continue
    const ink = findInk(image, rect, searched, { x: 0.3, y: 0.45 }, false, true)
    if (!ink || !ocr) continue
    const glyphs = letters(remaining.join('')).length
    const fill = ink.pixels / Math.max(1, ink.box.w * ink.box.h)
    // Heavy, tightly set type merges letters into few pieces, so the count only has
    // to be in the right range; the ink's density and size against the analyser's
    // box do the rest of the judging.
    const plausible = ink.pieces >= 1 && ink.pieces <= glyphs * 3 + 4
      && ink.bands.length <= remaining.length + 2
      && fill > 0.08 && fill < 0.75
      && ink.box.w * ink.box.h <= rect.w * rect.h * 3 && ink.box.h <= rect.h * 2
    if (!plausible) continue
    // The deciding test: read on its own, the ink has to say those words.
    const read = await readInk(ocr, ink, W)
    const expected = letters(remaining.join(''))
    const said = letters(read)
    const agreement = Math.max(similarity(said, expected), said.length >= 4 && expected.includes(said) ? said.length / expected.length : 0)
    // Junk (a sparkle, a sleeve) reads as 0-0.15; real type, even heavy display type, well above.
    if (agreement < 0.42) continue
    await lift(ink, wordsMatching(read, remaining.join(' ')), Math.round(agreement * 100), 'analyser-text')
  }
  } finally {
    await ocr?.terminate().catch(() => undefined)
  }

  /* Outlines: SlimSAM turns each rough box the analyser drew (logos, icons,
     photos) into a precise outline, all in one pass. Where it cannot run, the
     pixel methods below take over. */
  progress('Outlining each element', 0.48)
  const markCandidates = analysed.filter(item => !item.status.removed && (MARK_KINDS.has(item.kind)
    || (item.kind === 'image' && (item.transform.bounds?.width ?? 100) * (item.transform.bounds?.height ?? 100) < 400)))
    .map(object => ({ object, rect: analysedRect(object, W, H) }))
    .filter((entry): entry is { object: DesignObject; rect: Rect } => Boolean(entry.rect) && entry.rect!.w * entry.rect!.h <= W * H * 0.12)
  const photoCandidates = analysed
    .filter(item => item.kind === 'image' && !item.status.removed)
    .map(object => ({ object, rect: analysedRect(object, W, H) }))
    .filter((entry): entry is { object: DesignObject; rect: Rect } => Boolean(entry.rect) && entry.rect!.w * entry.rect!.h > W * H * 0.06)
  const grow = (rect: Rect, by: number) => clampRect({ x: rect.x - rect.w * by, y: rect.y - rect.h * by, w: rect.w * (1 + 2 * by), h: rect.h * (1 + 2 * by) }, W, H)
  // The analyser's icon boxes are often off-centre, and SAM outlines whatever
  // its prompt lands on. So each mark is found in the pixels first and the
  // prompt aimed at it; only a mark not found that way keeps the analyser's box.
  const markInk = markCandidates.map(({ rect }) => findInk(image, rect, claimed, { x: 0.3, y: 0.3 }, true, false))
  // The analyser's icon boxes are often off by most of their own size. So each
  // icon is searched for: a box three times its size, and SAM aimed from its
  // centre, four nearby offsets and the spot its pixels were found. The most
  // confident compact, uncut outline of icon size wins below.
  type MarkPrompt = Rect & { px: number; py: number }
  const markPrompts: MarkPrompt[][] = markCandidates.map(({ rect }, index) => {
    const room = grow(rect, 1)
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
    const aims: Array<[number, number]> = [
      [cx, cy], [cx - rect.w * 0.6, cy], [cx + rect.w * 0.6, cy], [cx, cy - rect.h * 0.6], [cx, cy + rect.h * 0.6],
    ]
    const ink = markInk[index]
    if (ink) aims.push([ink.box.x + ink.box.w / 2, ink.box.y + ink.box.h / 2])
    return aims
      .filter(([x, y]) => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h)
      .map(([px, py]) => ({ ...room, px, py }))
  })
  const flatMarkPrompts = markPrompts.flat()
  const photoPrompts = photoCandidates.map(entry => grow(entry.rect, 0.05))
  let outlines: Array<SamCandidates | null> | null = null
  try {
    outlines = await outlineBoxes(work, W, H, [...flatMarkPrompts, ...photoPrompts])
  } catch (error) {
    warnings.push(`Precise outlining was unavailable here (${error instanceof Error ? error.message : 'model failed'}), so cut-outs use the simpler method.`)
  }
  // Back to one list of candidate sets per mark, one set per aim.
  const markOutlines: Array<Array<SamCandidates | null>> = []
  {
    let at = 0
    for (const aims of markPrompts) {
      markOutlines.push(aims.map((_, k) => outlines?.[at + k] ?? null))
      at += aims.length
    }
  }
  const photoOutlines = outlines ? outlines.slice(flatMarkPrompts.length) : []

  /**
   * The largest of SAM's candidates for a prompt that passes `check` (the whole
   * badge before its letter, and never the backdrop, which fails the checks).
   */
  const bestCandidate = <T,>(candidates: SamCandidates | null | undefined, check: (outline: SamOutline) => T | null) => {
    for (const candidate of candidates ?? []) {
      if (candidate.share > 0.85) continue
      const accepted = check(candidate)
      if (accepted) return { outline: candidate, accepted }
    }
    return null
  }

  /** A mark is compact: thin arcs and lines (an orbit, a divider) are not icons. */
  const compact = (box: Rect, area: number) => area / Math.max(1, box.w * box.h) >= 0.28 && Math.min(box.w, box.h) / Math.max(box.w, box.h) >= 0.22

  /** A SAM outline as a binary mask (minus what is already taken) and its box, or null when it is not a believable shape for `rect`. */
  const acceptOutline = (outline: SamOutline | null | undefined, rect: Rect, minScore: number, maxGrowth: number, prompt: Rect, maxSidesTouched: number) => {
    if (!outline || outline.score < minScore) return null
    const mask = new Uint8Array(W * H)
    let area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
    for (let i = 0; i < mask.length; i += 1) {
      if (outline.alpha[i] < 128 || claimed[i]) continue
      mask[i] = 1; area += 1
      const x = i % W, y = (i - x) / W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
    // An outline that runs into the edges of its own prompt box was clipped
    // there: it is the backdrop the prompt landed on, not an object.
    const tolerance = Math.max(2, Math.round(Math.min(prompt.w, prompt.h) * 0.02))
    const sides = Number(box.x <= prompt.x + tolerance && prompt.x > 0)
      + Number(box.y <= prompt.y + tolerance && prompt.y > 0)
      + Number(box.x + box.w >= prompt.x + prompt.w - tolerance && prompt.x + prompt.w < W)
      + Number(box.y + box.h >= prompt.y + prompt.h - tolerance && prompt.y + prompt.h < H)
    if (sides > maxSidesTouched) return null
    const limit = grow(rect, maxGrowth)
    const inside = area > 0 && box.x >= limit.x && box.y >= limit.y && box.x + box.w <= limit.x + limit.w && box.y + box.h <= limit.y + limit.h
    if (!inside || area < rect.w * rect.h * 0.08) return null
    return { mask, box, area }
  }

  /* Marks: logos, icons, coins and badges */
  progress('Lifting logos and icons', 0.52)
  const markLayers: DesignObject[] = []
  for (const [index, { object, rect }] of markCandidates.entries()) {
    // Every aim is judged: an icon outline must be confident, compact, of icon
    // size and not touch its search box (which would mean it was cut off, or is
    // the backdrop). The most confident wins, the larger on a tie.
    const aims = markPrompts[index]
    const judge = (prompt: Rect) => (candidate: SamOutline) => {
      const accepted = acceptOutline(candidate, prompt, 0.75, 0, prompt, 0)
      if (!accepted || !compact(accepted.box, accepted.area)) return null
      const size = accepted.area / Math.max(1, rect.w * rect.h)
      return size >= 0.12 && size <= 3 ? accepted : null
    }
    const options = aims
      .map((aim, k) => bestCandidate(markOutlines[index]?.[k], judge(aim)))
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .sort((a, b) => (b.outline.score - a.outline.score) || (b.accepted.area - a.accepted.area))
    const outline = options[0]?.outline ?? null
    const sam = options[0]?.accepted ?? null
    let hole: Uint8Array
    let crop: Rect
    let alphaCanvas: HTMLCanvasElement | null = null
    let evidence = 'mark-cutout'
    if (sam && outline) {
      // SAM's soft outline, minus anything already lifted (text sitting on a badge).
      const alpha = new Uint8ClampedArray(W * H)
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = claimed[i] ? 0 : outline.alpha[i]
      alphaCanvas = maskCanvas(alpha, W, H)
      hole = dilate(sam.mask, W, H, 1)
      crop = clampRect({ x: sam.box.x - 2, y: sam.box.y - 2, w: sam.box.w + 4, h: sam.box.h + 4 }, W, H)
      evidence = 'sam-outline'
    } else {
      const ink = markInk[index]
      if (!ink || !compact(ink.box, ink.pixels)) continue
      const fill = ink.pixels / Math.max(1, ink.box.w * ink.box.h)
      // A real mark is compact and of a size near what the analyser described.
      const sizeRatio = (ink.box.w * ink.box.h) / Math.max(1, rect.w * rect.h)
      if (fill < 0.12 || sizeRatio < 0.12 || sizeRatio > 3) continue
      hole = dilate(markShape(ink.mask, ink.box, W), W, H, 1)
      crop = clampRect({ x: ink.box.x - 2, y: ink.box.y - 2, w: ink.box.w + 4, h: ink.box.h + 4 }, W, H)
    }
    const id = alphaCanvas
      ? await cutout(full, alphaCanvas, crop, W, saveAsset)
      : await saveAsset(await encodeCanvas(matteCrop(full, crop, W, hole, W, [0, 0, 0], null), true))
    for (let i = 0; i < hole.length; i += 1) if (hole[i]) claimed[i] = 1
    const layer = makeLayer(doc, 'image', { assetRef: `asset:${id}`, name: object.name || 'Logo', bounds: toDocPercent(crop), zIndex: 0 })
    layer.kind = object.kind === 'qr-code' ? 'qr-code' : object.kind === 'image' ? 'icon' : 'logo'
    layer.source = { provider: 'magic-layers', confidence: sam ? Math.round(outline!.score * 100) / 100 : 0.8, evidence: [evidence] }
    markLayers.push(layer)
  }

  /* Stage 1: the picture without its text and marks. Each small gap is filled from
     its own surroundings (the jacket behind a word, the panel behind a logo), and
     everything after this works from that clean picture. */
  progress('Taking out the text', 0.54)
  const textHole = dilate(claimed, W, H, 1)
  const cleanWork = inpaint(image, textHole)
  for (let i = 0; i < textHole.length; i += 1) {
    if (textHole[i]) continue
    cleanWork.data[i * 4] = image.data[i * 4]; cleanWork.data[i * 4 + 1] = image.data[i * 4 + 1]; cleanWork.data[i * 4 + 2] = image.data[i * 4 + 2]
  }
  const clean = canvasOf(full.width, full.height)
  {
    const textPatch = canvasOf(W, H)
    const patchContext = textPatch.getContext('2d')!
    patchContext.putImageData(cleanWork, 0, 0)
    patchContext.globalCompositeOperation = 'destination-in'
    patchContext.drawImage(maskCanvas(textHole, W, H, 0.8), 0, 0)
    const cleanContext = clean.getContext('2d')!
    cleanContext.drawImage(full, 0, 0)
    cleanContext.imageSmoothingQuality = 'high'
    cleanContext.drawImage(textPatch, 0, 0, full.width, full.height)
  }

  /* Subjects: every photo the analyser saw becomes its own cut-out. SAM gives
     each one's shape; the full-frame matte adds soft edge detail (hair, hands)
     inside that shape only, so a sofa or a button never comes along. */
  progress('Cutting out the subjects', 0.6)
  const subjectLayers: DesignObject[] = []
  let subjectHole: Uint8Array | null = null
  let matteData: Uint8ClampedArray | null = null
  try {
    const matte = await segmentFlyer(work.toDataURL('image/png'))
    const matteContext = canvasOf(W, H).getContext('2d', { willReadFrequently: true })!
    matteContext.drawImage(matte.canvas, 0, 0, W, H)
    matteData = matteContext.getImageData(0, 0, W, H).data
  } catch (error) {
    if (!outlines) warnings.push(`The subject could not be cut out: ${error instanceof Error ? error.message : 'segmentation failed'}.`)
  }

  const taken = new Uint8Array(W * H)
  const addSubject = async (alpha: Uint8ClampedArray, name: string, evidence: string, confidence: number) => {
    let area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
    for (let i = 0; i < alpha.length; i += 1) {
      if (alpha[i] <= 24) continue
      area += 1
      const x = i % W, y = (i - x) / W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    if (area < W * H * 0.015 || area > W * H * 0.8) return false
    const crop = clampRect({ x: x0 - 2, y: y0 - 2, w: x1 - x0 + 5, h: y1 - y0 + 5 }, W, H)
    // An opaque core with only the core filled behind it: nothing shows through before anything moves.
    const core = new Uint8Array(W * H)
    for (let i = 0; i < core.length; i += 1) if (alpha[i] > 160) { core[i] = 1; alpha[i] = 255; taken[i] = 1 }
    const id = await cutout(clean, maskCanvas(alpha, W, H), crop, W, saveAsset)
    const layer = makeLayer(doc, 'image', { assetRef: `asset:${id}`, name, bounds: toDocPercent(crop), zIndex: 0 })
    layer.source = { provider: 'magic-layers', confidence, evidence: [evidence] }
    subjectLayers.push(layer)
    const hole = dilate(core, W, H, 1)
    if (!subjectHole) subjectHole = hole
    else for (let i = 0; i < hole.length; i += 1) if (hole[i]) subjectHole[i] = 1
    return true
  }

  // Largest photos first, so a small one inside a big one keeps its own pixels.
  const photoOrder = photoCandidates.map((entry, index) => ({ ...entry, outline: photoOutlines[index], prompt: photoPrompts[index] }))
    .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
  for (const { object, rect, outline, prompt } of photoOrder) {
    // A subject may be cut by the picture's own edges, but not by all four sides of its box.
    const chosen = bestCandidate(outline, candidate => acceptOutline(candidate, rect, 0.7, 0.25, prompt, 2))
    if (!chosen) continue
    const sam = chosen.accepted
    const shape = chosen.outline
    const reach = dilate(sam.mask, W, H, Math.max(3, Math.round(Math.max(W, H) * 0.004)))
    const alpha = new Uint8ClampedArray(W * H)
    for (let i = 0; i < alpha.length; i += 1) {
      if (!reach[i] || claimed[i] || taken[i]) continue
      const edge = shape.alpha[i]
      const soft = matteData ? matteData[i * 4 + 3] : 0
      // Inside the outline it is solid; at its edge the matte's softness decides.
      alpha[i] = edge >= 230 ? 255 : Math.max(edge, Math.min(soft, 255))
    }
    const label = (object.name && object.name.length < 40 ? object.name : object.content.description?.split(/[,.]/)[0]?.slice(0, 36)) || 'Subject'
    await addSubject(alpha, label, 'sam-subject', Math.round(shape.score * 100) / 100)
  }

  // No outline for any photo: one subject from the matte, as before.
  if (!subjectLayers.length && matteData) {
    const photos = photoCandidates.map(({ rect }) => ({ x0: rect.x - rect.w * 0.1, y0: rect.y - rect.h * 0.1, x1: rect.x + rect.w * 1.1, y1: rect.y + rect.h * 1.1 }))
    const inPhoto = (x: number, y: number) => !photos.length || photos.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
    const alpha = new Uint8ClampedArray(W * H)
    for (let i = 0; i < W * H; i += 1) {
      const x = i % W, y = (i - x) / W
      alpha[i] = !inPhoto(x, y) || claimed[i] ? 0 : matteData[i * 4 + 3]
    }
    // Only the largest connected subject (and pieces at least a fifth its size) survive.
    const solid = new Uint8Array(W * H)
    for (let i = 0; i < solid.length; i += 1) solid[i] = alpha[i] > 24 ? 1 : 0
    const { labels, stats } = components(solid, W, H)
    const largest = Math.max(0, ...stats.map(stat => stat.area))
    for (let i = 0; i < solid.length; i += 1) if (!solid[i] || stats[labels[i] - 1].area < largest * 0.2) alpha[i] = 0
    if (!(await addSubject(alpha, 'Subject', 'subject-matte', 0.8)) && !photos.length) warnings.push('No clear subject was found, so the picture stayed in the background.')
  }

  /* Background */
  progress('Filling in the background', 0.84)
  const backdrop = canvasOf(full.width, full.height)
  const backdropContext = backdrop.getContext('2d')!
  backdropContext.drawImage(clean, 0, 0)
  if (subjectHole) {
    const hole = dilate(subjectHole, W, H, 1)
    const filled = inpaint(cleanWork, hole)
    const patch = canvasOf(W, H)
    const patchContext = patch.getContext('2d')!
    patchContext.putImageData(filled, 0, 0)
    patchContext.globalCompositeOperation = 'destination-in'
    patchContext.drawImage(maskCanvas(hole, W, H, 0.8), 0, 0)
    backdropContext.imageSmoothingQuality = 'high'
    backdropContext.drawImage(patch, 0, 0, full.width, full.height)
  }
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

  if (!textLayers.length && lines.length === 0 && !warnings.length) warnings.push('No text was found to lift.')
  const ordered = [background, ...subjectLayers, ...markLayers, ...textLayers]
  const baseZ = wholeFlyer ? 0 : doc.objects.reduce((max, object) => Math.max(max, object.zIndex), 0) + 1
  ordered.forEach((object, index) => { object.zIndex = baseZ + index })
  progress('Done', 1)
  return { objects: ordered, warnings }
}
