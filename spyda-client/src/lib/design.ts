/*
 * Spyda deterministic placement engine.
 *
 * The core idea of the Spyda pipeline: never ask the AI model to size or
 * position a replacement asset. Spyda measures the original atom's bounding
 * box, bakes the replacement into the parent design on a canvas at exactly
 * that footprint, and only then asks the AI to blend/refine. Sizing becomes
 * pixel math, not a prompt request.
 */

/** Atom bounding box in percent of the full image (0–100). x,y = top-left corner. */
export type AtomBox = {
  x: number
  y: number
  width: number
  height: number
}

export function clampBox(box: AtomBox): AtomBox {
  const width = Math.min(100, Math.max(0.5, box.width))
  const height = Math.min(100, Math.max(0.5, box.height))
  return {
    x: Math.min(100 - width, Math.max(0, box.x)),
    y: Math.min(100 - height, Math.max(0, box.y)),
    width,
    height,
  }
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Parse an atom bounding box from any of the formats Spyda produces:
 * - `{ x, y, width, height }` objects (percent 0–100, or pixels when a
 *   reference size is given and any value exceeds 100)
 * - `"x:12, y:340, width:200, height:48"` strings (OCR pixel coordinates)
 *
 * Returns percent coordinates, or null when the box is not numeric
 * (e.g. legacy "top center" descriptions).
 */
export function parseAtomBox(
  raw: unknown,
  referenceSize?: { width: number; height: number } | null,
): AtomBox | null {
  let x: number | null = null
  let y: number | null = null
  let width: number | null = null
  let height: number | null = null

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    x = toFiniteNumber(record.x)
    y = toFiniteNumber(record.y)
    width = toFiniteNumber(record.width ?? record.w)
    height = toFiniteNumber(record.height ?? record.h)
  } else if (typeof raw === 'string') {
    const read = (key: string) => {
      const match = raw.match(new RegExp(`${key}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'))
      return match ? parseFloat(match[1]) : null
    }
    x = read('x')
    y = read('y')
    width = read('width') ?? read('w')
    height = read('height') ?? read('h')
  }

  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null

  const looksLikePixels = x > 100 || y > 100 || width > 100 || height > 100 || x + width > 110 || y + height > 110
  if (looksLikePixels) {
    if (!referenceSize || !referenceSize.width || !referenceSize.height) return null
    return clampBox({
      x: (x / referenceSize.width) * 100,
      y: (y / referenceSize.height) * 100,
      width: (width / referenceSize.width) * 100,
      height: (height / referenceSize.height) * 100,
    })
  }

  return clampBox({ x, y, width, height })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for placement.'))
    img.src = src
  })
}

export async function getImageSize(src: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(src)
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }
}

export type CompositeLayer = {
  /** Placement in percent of the base image. */
  box: AtomBox
  /** Replacement asset data URL (PNG alpha preserved). */
  src: string
  /** Trim transparent or flat whitespace before fitting, primarily for logos. */
  trimWhitespace?: boolean
}

export type PixelBounds = { x: number; y: number; width: number; height: number }

/** Finds visible artwork inside transparent or flat-background image pixels. */
export function findVisiblePixelBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds | null {
  if (!width || !height || pixels.length < width * height * 4) return null

  let hasTransparency = false
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 245) { hasTransparency = true; break }
  }

  const cornerPoints = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ]
  const background = [0, 1, 2].map(channel => (
    cornerPoints.reduce((sum, [x, y]) => sum + pixels[(y * width + x) * 4 + channel], 0) / cornerPoints.length
  ))

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let visiblePixels = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const alpha = pixels[offset + 3]
      const distance = Math.hypot(
        pixels[offset] - background[0],
        pixels[offset + 1] - background[1],
        pixels[offset + 2] - background[2],
      )
      const visible = hasTransparency ? alpha > 16 : alpha > 16 && distance > 32
      if (!visible) continue
      visiblePixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (visiblePixels < Math.max(4, width * height * 0.001) || maxX < minX || maxY < minY) return null
  const pad = Math.max(1, Math.round(Math.min(maxX - minX + 1, maxY - minY + 1) * 0.04))
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export async function trimImageWhitespace(src: string): Promise<string> {
  const asset = await loadImage(src)
  const width = asset.naturalWidth || asset.width
  const height = asset.naturalHeight || asset.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return src
  ctx.drawImage(asset, 0, 0, width, height)
  const bounds = findVisiblePixelBounds(ctx.getImageData(0, 0, width, height).data, width, height)
  if (!bounds || (bounds.width >= width * 0.96 && bounds.height >= height * 0.96)) return src

  const output = document.createElement('canvas')
  output.width = bounds.width
  output.height = bounds.height
  const outputContext = output.getContext('2d')
  if (!outputContext) return src
  outputContext.drawImage(asset, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return output.toDataURL('image/png')
}

/** Tightens a loose detected logo region to the visible logo pixels in the parent. */
export async function refineLogoBox(baseSrc: string, rawBox: AtomBox): Promise<AtomBox> {
  const base = await loadImage(baseSrc)
  const width = base.naturalWidth || base.width
  const height = base.naturalHeight || base.height
  const box = clampBox(rawBox)
  const x = Math.max(0, Math.round((box.x / 100) * width))
  const y = Math.max(0, Math.round((box.y / 100) * height))
  const slotWidth = Math.max(1, Math.min(width - x, Math.round((box.width / 100) * width)))
  const slotHeight = Math.max(1, Math.min(height - y, Math.round((box.height / 100) * height)))
  const canvas = document.createElement('canvas')
  canvas.width = slotWidth
  canvas.height = slotHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return box
  ctx.drawImage(base, x, y, slotWidth, slotHeight, 0, 0, slotWidth, slotHeight)
  const bounds = findVisiblePixelBounds(ctx.getImageData(0, 0, slotWidth, slotHeight).data, slotWidth, slotHeight)
  if (!bounds) return box
  const coverage = (bounds.width * bounds.height) / (slotWidth * slotHeight)
  if (coverage < 0.01 || coverage > 0.92) return box

  return clampBox({
    x: box.x + (bounds.x / slotWidth) * box.width,
    y: box.y + (bounds.y / slotHeight) * box.height,
    width: (bounds.width / slotWidth) * box.width,
    height: (bounds.height / slotHeight) * box.height,
  })
}

/**
 * Bake replacement assets into the base design at their exact atom footprints.
 * Each asset is contain-fitted and centered inside its box so it can never
 * come out larger than the element it replaces. Returns a PNG data URL at the
 * base image's natural resolution.
 */
export async function compositeReplacements(baseSrc: string, layers: CompositeLayer[]): Promise<string> {
  const base = await loadImage(baseSrc)
  const width = base.naturalWidth || base.width
  const height = base.naturalHeight || base.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the placement canvas.')

  ctx.drawImage(base, 0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // When the replacement's aspect ratio differs from the original atom's box,
  // contain-fitting leaves slivers of the old asset visible. If the pixels
  // ringing the box are near-uniform (flat background — the common case for
  // logos), patch the whole footprint with that background before pasting.
  const patchSlotBackground = (slotX: number, slotY: number, slotW: number, slotH: number) => {
    const pad = Math.max(2, Math.round(Math.min(width, height) * 0.004))
    const samples: Array<[number, number]> = []
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const fx = slotX + (slotW * i) / steps
      const fy = slotY + (slotH * i) / steps
      samples.push([fx, slotY - pad], [fx, slotY + slotH + pad], [slotX - pad, fy], [slotX + slotW + pad, fy])
    }
    const colors: number[][] = []
    for (const [sx, sy] of samples) {
      const x = Math.round(Math.min(width - 1, Math.max(0, sx)))
      const y = Math.round(Math.min(height - 1, Math.max(0, sy)))
      colors.push([...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)])
    }
    const mean = [0, 1, 2].map(channel => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length)
    const maxDeviation = Math.max(...colors.map(color => Math.max(...[0, 1, 2].map(channel => Math.abs(color[channel] - mean[channel])))))
    if (maxDeviation <= 26) {
      ctx.fillStyle = `rgb(${Math.round(mean[0])}, ${Math.round(mean[1])}, ${Math.round(mean[2])})`
      ctx.fillRect(slotX, slotY, slotW, slotH)
    }
  }

  for (const layer of layers) {
    const asset = await loadImage(layer.src)
    const box = clampBox(layer.box)
    const slotX = (box.x / 100) * width
    const slotY = (box.y / 100) * height
    const slotW = (box.width / 100) * width
    const slotH = (box.height / 100) * height

    patchSlotBackground(slotX, slotY, slotW, slotH)

    const assetW = asset.naturalWidth || asset.width
    const assetH = asset.naturalHeight || asset.height
    let sourceBounds: PixelBounds = { x: 0, y: 0, width: assetW, height: assetH }
    if (layer.trimWhitespace) {
      const assetCanvas = document.createElement('canvas')
      assetCanvas.width = assetW
      assetCanvas.height = assetH
      const assetContext = assetCanvas.getContext('2d', { willReadFrequently: true })
      if (assetContext) {
        assetContext.drawImage(asset, 0, 0, assetW, assetH)
        sourceBounds = findVisiblePixelBounds(assetContext.getImageData(0, 0, assetW, assetH).data, assetW, assetH) || sourceBounds
      }
    }
    const scale = Math.min(slotW / sourceBounds.width, slotH / sourceBounds.height)
    const drawW = sourceBounds.width * scale
    const drawH = sourceBounds.height * scale
    const drawX = slotX + (slotW - drawW) / 2
    const drawY = slotY + (slotH - drawH) / 2

    ctx.drawImage(asset, sourceBounds.x, sourceBounds.y, sourceBounds.width, sourceBounds.height, drawX, drawY, drawW, drawH)
  }

  return canvas.toDataURL('image/png')
}
