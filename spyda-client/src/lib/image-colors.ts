/**
 * Colours in pictures: find the main colours of an inserted image (its
 * palette), then change them. Recolouring moves every pixel near a chosen
 * colour by the same amount, so shading, texture and anti-aliased edges stay
 * as they were; duotone maps the picture's light and dark onto two colours.
 * Both run as Konva filters on the layer, so the original picture is never
 * altered and every change can be undone.
 */

export type PaletteColor = { hex: string; share: number }
export type ColorSwap = { from: string; to: string }
export type Duotone = { shadow: string; highlight: string; amount: number }

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean.slice(0, 6)
  const value = Number.parseInt(full || '0', 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function rgbToHex([r, g, b]: RGB) {
  return `#${[r, g, b].map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.2, a[2] - b[2])

const cache = new WeakMap<object, PaletteColor[]>()

/**
 * The picture's main colours, most used first (up to `max`). Transparent
 * pixels are ignored, so a cut-out's palette is only its subject.
 */
export function extractPalette(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, max = 6): PaletteColor[] {
  const cached = cache.get(image)
  if (cached) return cached
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height
  if (!width || !height) return []
  const scale = Math.min(1, 120 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  let data: Uint8ClampedArray
  try {
    data = context.getImageData(0, 0, canvas.width, canvas.height).data
  } catch {
    return [] // a picture from another site without CORS cannot be read
  }
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) pixels.push([data[i], data[i + 1], data[i + 2]])
  if (!pixels.length) return []

  // k-means, seeded across the picture's brightness range so results are stable.
  const k = Math.min(10, pixels.length)
  const byLight = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  let centres: RGB[] = Array.from({ length: k }, (_, index) => [...byLight[Math.floor(((index + 0.5) / k) * byLight.length)]] as RGB)
  let counts = new Array<number>(k).fill(0)
  for (let round = 0; round < 10; round++) {
    const sums = centres.map(() => [0, 0, 0])
    counts = new Array<number>(k).fill(0)
    for (const pixel of pixels) {
      let best = 0
      let bestDistance = Infinity
      for (let c = 0; c < k; c++) {
        const d = distance(pixel, centres[c])
        if (d < bestDistance) { bestDistance = d; best = c }
      }
      sums[best][0] += pixel[0]; sums[best][1] += pixel[1]; sums[best][2] += pixel[2]
      counts[best] += 1
    }
    centres = centres.map((centre, c) => (counts[c] ? [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]] as RGB : centre))
  }

  // Merge near-duplicates, drop specks, most used first.
  const clusters = centres.map((centre, c) => ({ centre, count: counts[c] })).filter(cluster => cluster.count > 0).sort((a, b) => b.count - a.count)
  const merged: Array<{ centre: RGB; count: number }> = []
  for (const cluster of clusters) {
    const near = merged.find(entry => distance(entry.centre, cluster.centre) < 34)
    if (near) {
      const total = near.count + cluster.count
      near.centre = near.centre.map((value, i) => (value * near.count + cluster.centre[i] * cluster.count) / total) as RGB
      near.count = total
    } else merged.push({ ...cluster })
  }
  const palette = merged
    .map(entry => ({ hex: rgbToHex(entry.centre), share: entry.count / pixels.length }))
    .filter(entry => entry.share >= 0.015)
    .slice(0, max)
  cache.set(image, palette)
  return palette
}

type FilterNode = { getAttr: (name: string) => unknown }

/**
 * Distance for recolouring: compares colour (chroma) more than lightness, so
 * the shaded and lit parts of a colour (a shirt's folds) count as the same
 * colour and change together.
 */
function shadeTolerantDistance(a: RGB, b: RGB) {
  const dy = 0.299 * (a[0] - b[0]) + 0.587 * (a[1] - b[1]) + 0.114 * (a[2] - b[2])
  const dcb = -0.1687 * (a[0] - b[0]) - 0.3313 * (a[1] - b[1]) + 0.5 * (a[2] - b[2])
  const dcr = 0.5 * (a[0] - b[0]) - 0.4187 * (a[1] - b[1]) - 0.0813 * (a[2] - b[2])
  return Math.hypot(dy * 0.35, dcb * 1.6, dcr * 1.6)
}

/**
 * Konva filter: moves each pixel near a swap's `from` colour toward its `to`
 * colour by the difference between them, weighted by how close it is.
 * Reads `spydaRecolor` (swaps) and `spydaRecolorRange` from the node.
 */
export function recolorFilter(this: FilterNode, imageData: ImageData) {
  const swaps = (this.getAttr('spydaRecolor') as ColorSwap[] | undefined) ?? []
  if (!swaps.length) return
  const range = Number(this.getAttr('spydaRecolorRange') ?? 60)
  const pairs = swaps.map(swap => {
    const from = hexToRgb(swap.from), to = hexToRgb(swap.to)
    return { from, delta: [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as RGB }
  })
  const data = imageData.data
  const pixel: RGB = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    pixel[0] = data[i]; pixel[1] = data[i + 1]; pixel[2] = data[i + 2]
    let weight = 0
    let pick = -1
    for (let p = 0; p < pairs.length; p++) {
      const d = shadeTolerantDistance(pixel, pairs[p].from)
      if (d >= range) continue
      const w = 1 - d / range
      if (w > weight) { weight = w; pick = p }
    }
    if (pick < 0) continue
    // Full change over most of the range, fading smoothly at its edge (anti-aliased borders).
    const edge = Math.min(1, weight / 0.45)
    const w = edge * edge * (3 - 2 * edge)
    const delta = pairs[pick].delta
    data[i] = Math.min(255, Math.max(0, pixel[0] + delta[0] * w))
    data[i + 1] = Math.min(255, Math.max(0, pixel[1] + delta[1] * w))
    data[i + 2] = Math.min(255, Math.max(0, pixel[2] + delta[2] * w))
  }
}

/**
 * Konva filter: maps the picture's luminance onto two colours (shadows to
 * highlights), mixed with the original by `amount`. Reads `spydaDuotone`.
 */
export function duotoneFilter(this: FilterNode, imageData: ImageData) {
  const duotone = this.getAttr('spydaDuotone') as Duotone | undefined
  if (!duotone || duotone.amount <= 0) return
  const dark = hexToRgb(duotone.shadow), light = hexToRgb(duotone.highlight)
  const amount = Math.min(1, Math.max(0, duotone.amount))
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    for (let c = 0; c < 3; c++) {
      const toned = dark[c] + (light[c] - dark[c]) * l
      data[i + c] = data[i + c] + (toned - data[i + c]) * amount
    }
  }
}

export const DUOTONE_PRESETS: Array<{ name: string; shadow: string; highlight: string }> = [
  { name: 'Spyda', shadow: '#1C1259', highlight: '#9DFAB0' },
  { name: 'Sunset', shadow: '#3B0A45', highlight: '#FFB36B' },
  { name: 'Ocean', shadow: '#04213F', highlight: '#7FE3FF' },
  { name: 'Rose', shadow: '#2A0B1F', highlight: '#FF9AC0' },
  { name: 'Gold', shadow: '#1A1205', highlight: '#F3DC9A' },
  { name: 'Mono', shadow: '#101010', highlight: '#F5F5F5' },
]
