/**
 * The Photo page's editor: a photo's geometry (rotate, straighten, flip,
 * crop), its adjustments and filter, an optional background removal, and text
 * and shapes placed on top. Everything is a recipe, rendered to a canvas at
 * preview size while editing and at full size when saved.
 */

export type Adjust = {
  brightness: number; contrast: number; highlights: number; shadows: number
  saturation: number; vibrance: number; warmth: number; tint: number
  sharpen: number; blur: number; vignette: number; fade: number; grain: number
}
export const NEUTRAL_ADJUST: Adjust = { brightness: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, warmth: 0, tint: 0, sharpen: 0, blur: 0, vignette: 0, fade: 0, grain: 0 }

export type PhotoText = { id: string; text: string; x: number; y: number; size: number; color: string; font: string; weight: number; shadow: boolean; background: string | null }
export type PhotoShape = { id: string; kind: 'rect' | 'circle' | 'line' | 'sticker'; x: number; y: number; width: number; height: number; color: string; opacity: number; radius: number; sticker?: string }

export type PhotoEdit = {
  rotate: 0 | 90 | 180 | 270
  straighten: number
  flipX: boolean
  flipY: boolean
  /** Fractions of the rotated, straightened picture. */
  crop: { x: number; y: number; width: number; height: number }
  adjust: Adjust
  filter: string
  texts: PhotoText[]
  shapes: PhotoShape[]
  /** With the background removed: fill behind (null = see-through). */
  backdrop: string | null
}

export const NEW_EDIT: PhotoEdit = { rotate: 0, straighten: 0, flipX: false, flipY: false, crop: { x: 0, y: 0, width: 1, height: 1 }, adjust: { ...NEUTRAL_ADJUST }, filter: 'none', texts: [], shapes: [], backdrop: null }

export const PHOTO_FILTERS: Array<{ id: string; name: string; adjust: Partial<Adjust> }> = [
  { id: 'none', name: 'Original', adjust: {} },
  { id: 'vivid', name: 'Vivid', adjust: { contrast: 0.2, saturation: 0.25, vibrance: 0.35 } },
  { id: 'warm', name: 'Golden', adjust: { warmth: 0.45, brightness: 0.05, vignette: 0.2 } },
  { id: 'cool', name: 'Cool', adjust: { warmth: -0.4, contrast: 0.1 } },
  { id: 'mono', name: 'Black & white', adjust: { saturation: -1, contrast: 0.25 } },
  { id: 'noir', name: 'Noir', adjust: { saturation: -1, contrast: 0.5, shadows: -0.2, vignette: 0.5 } },
  { id: 'vintage', name: 'Vintage', adjust: { warmth: 0.3, fade: 0.35, saturation: -0.25, grain: 0.3, vignette: 0.3 } },
  { id: 'matte', name: 'Matte', adjust: { fade: 0.4, contrast: -0.1, saturation: -0.1 } },
  { id: 'drama', name: 'Drama', adjust: { contrast: 0.45, highlights: -0.3, shadows: 0.2, saturation: 0.1, vignette: 0.35, sharpen: 0.4 } },
  { id: 'airy', name: 'Bright & airy', adjust: { brightness: 0.18, highlights: -0.2, shadows: 0.3, saturation: -0.05, fade: 0.1 } },
  { id: 'pop', name: 'Pop', adjust: { saturation: 0.45, vibrance: 0.4, contrast: 0.25, sharpen: 0.3 } },
]

export const ASPECTS: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 0 },
  { id: '1:1', label: 'Square', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
]

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** The picture turned, straightened (zoomed so no corners show) and flipped. */
export function geometryCanvas(source: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }, edit: PhotoEdit, maxSide: number) {
  const sw = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width
  const sh = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height
  const quarter = edit.rotate === 90 || edit.rotate === 270
  const w0 = quarter ? sh : sw, h0 = quarter ? sw : sh
  const scale = Math.min(1, maxSide / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w0 * scale))
  canvas.height = Math.max(1, Math.round(h0 * scale))
  const context = canvas.getContext('2d')!
  const angle = (edit.straighten * Math.PI) / 180
  // Straightening zooms in just enough that the frame stays filled.
  const fill = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)) * Math.max(canvas.width / canvas.height, canvas.height / canvas.width)
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((edit.rotate * Math.PI) / 180 + angle)
  context.scale((edit.flipX ? -1 : 1) * fill * scale, (edit.flipY ? -1 : 1) * fill * scale)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, -sw / 2, -sh / 2, sw, sh)
  return canvas
}

/** Applies the adjustments to pixels in place. */
export function applyAdjust(canvas: HTMLCanvasElement, adjust: Adjust) {
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const { width, height } = canvas
  const neutral = Object.entries(adjust).every(([key, value]) => key === 'blur' || key === 'sharpen' ? true : Math.abs(value) < 1e-4)
  let soft: Uint8ClampedArray | null = null
  if (adjust.sharpen > 0 || adjust.blur > 0) {
    const copy = document.createElement('canvas')
    copy.width = width; copy.height = height
    const cc = copy.getContext('2d')!
    if ('filter' in cc) {
      const radius = adjust.blur > 0 ? adjust.blur * Math.max(width, height) * 0.012 : Math.max(1, Math.max(width, height) / 900)
      cc.filter = `blur(${radius.toFixed(2)}px)`
      cc.drawImage(canvas, 0, 0)
      soft = cc.getImageData(0, 0, width, height).data
    }
  }
  if (neutral && !soft) return
  const image = context.getImageData(0, 0, width, height)
  const d = image.data
  const cx = width / 2, cy = height / 2, diag = Math.hypot(cx, cy)
  let seed = 12345
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    if (soft) {
      const sr = soft[i] / 255, sg = soft[i + 1] / 255, sb = soft[i + 2] / 255
      if (adjust.blur > 0) { r = sr; g = sg; b = sb }
      else { const k = adjust.sharpen * 1.6; r += (r - sr) * k; g += (g - sg) * k; b += (b - sb) * k }
    }
    r += adjust.brightness * 0.25; g += adjust.brightness * 0.25; b += adjust.brightness * 0.25
    const k = 1 + adjust.contrast
    r = (r - 0.5) * k + 0.5; g = (g - 0.5) * k + 0.5; b = (b - 0.5) * k + 0.5
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const lift = adjust.highlights * 0.3 * smooth(0.5, 1, l) + adjust.shadows * 0.3 * (1 - smooth(0, 0.5, l))
    r += lift; g += lift; b += lift
    r += adjust.warmth * 0.09; b -= adjust.warmth * 0.09
    g -= adjust.tint * 0.07; r += adjust.tint * 0.03; b += adjust.tint * 0.03
    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    const s = 1 + adjust.saturation + adjust.vibrance * (1 - clamp(chroma * 1.5))
    r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s
    if (adjust.fade > 0) { r = r * (1 - adjust.fade * 0.18) + adjust.fade * 0.12; g = g * (1 - adjust.fade * 0.18) + adjust.fade * 0.12; b = b * (1 - adjust.fade * 0.18) + adjust.fade * 0.12 }
    if (adjust.vignette > 0) { const v = 1 - adjust.vignette * smooth(0.45, 1.1, Math.hypot(x - cx, y - cy) / diag * 1.25); r *= v; g *= v; b *= v }
    if (adjust.grain > 0) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = ((seed / 0x7fffffff) - 0.5) * adjust.grain * 0.18; r += n; g += n; b += n }
    d[i] = clamp(r) * 255; d[i + 1] = clamp(g) * 255; d[i + 2] = clamp(b) * 255
  }
  context.putImageData(image, 0, 0)
}

function drawShape(context: CanvasRenderingContext2D, shape: PhotoShape, w: number, h: number) {
  const x = shape.x * w, y = shape.y * h, sw = shape.width * w, sh = shape.height * h
  context.save()
  context.globalAlpha = shape.opacity
  context.fillStyle = shape.color
  context.strokeStyle = shape.color
  if (shape.kind === 'circle') { context.beginPath(); context.ellipse(x, y, sw / 2, sh / 2, 0, 0, Math.PI * 2); context.fill() }
  else if (shape.kind === 'line') { context.lineWidth = Math.max(2, sh); context.lineCap = 'round'; context.beginPath(); context.moveTo(x - sw / 2, y); context.lineTo(x + sw / 2, y); context.stroke() }
  else if (shape.kind === 'sticker') { context.font = `${Math.round(sh)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(shape.sticker ?? '★', x, y) }
  else { const r = Math.min(sw, sh) * shape.radius * 0.5; context.beginPath(); context.roundRect(x - sw / 2, y - sh / 2, sw, sh, r); context.fill() }
  context.restore()
}

function drawText(context: CanvasRenderingContext2D, text: PhotoText, w: number, h: number) {
  const size = text.size * h
  context.save()
  context.font = `${text.weight} ${Math.round(size)}px "${text.font}", system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const lines = text.text.split('\n')
  const lineHeight = size * 1.15
  const top = text.y * h - ((lines.length - 1) * lineHeight) / 2
  if (text.background) {
    const widest = Math.max(...lines.map(line => context.measureText(line).width))
    context.fillStyle = text.background
    context.beginPath()
    context.roundRect(text.x * w - widest / 2 - size * 0.4, top - lineHeight / 2 - size * 0.15, widest + size * 0.8, lines.length * lineHeight + size * 0.3, size * 0.25)
    context.fill()
  }
  if (text.shadow) { context.shadowColor = 'rgba(0,0,0,0.55)'; context.shadowBlur = size * 0.18; context.shadowOffsetY = size * 0.06 }
  context.fillStyle = text.color
  lines.forEach((line, index) => context.fillText(line, text.x * w, top + index * lineHeight))
  context.restore()
}

/** The finished photo: geometry, crop, adjustments, backdrop, then shapes and text. */
export function renderPhoto(source: CanvasImageSource, edit: PhotoEdit, maxSide = 1400) {
  const geometry = geometryCanvas(source as HTMLImageElement, edit, maxSide / Math.max(0.05, Math.max(edit.crop.width, edit.crop.height)))
  const cw = Math.max(1, Math.round(geometry.width * edit.crop.width)), ch = Math.max(1, Math.round(geometry.height * edit.crop.height))
  const ratio = Math.min(1, maxSide / Math.max(cw, ch))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(cw * ratio))
  out.height = Math.max(1, Math.round(ch * ratio))
  const context = out.getContext('2d', { willReadFrequently: true })!
  if (edit.backdrop) { context.fillStyle = edit.backdrop; context.fillRect(0, 0, out.width, out.height) }
  context.imageSmoothingQuality = 'high'
  context.drawImage(geometry, geometry.width * edit.crop.x, geometry.height * edit.crop.y, cw, ch, 0, 0, out.width, out.height)
  applyAdjust(out, edit.adjust)
  for (const shape of edit.shapes) drawShape(context, shape, out.width, out.height)
  for (const text of edit.texts) drawText(context, text, out.width, out.height)
  return out
}

/** Average colour and spread of a picture, for Auto enhance. */
export function autoEnhance(canvas: HTMLCanvasElement): Partial<Adjust> {
  const small = document.createElement('canvas')
  small.width = 96; small.height = Math.max(1, Math.round((96 * canvas.height) / canvas.width))
  const context = small.getContext('2d', { willReadFrequently: true })!
  context.drawImage(canvas, 0, 0, small.width, small.height)
  const d = context.getImageData(0, 0, small.width, small.height).data
  let r = 0, g = 0, b = 0, n = 0
  const lumas: number[] = []
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; lumas.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) }
  r /= n * 255; g /= n * 255; b /= n * 255
  lumas.sort((x, y) => x - y)
  const mean = lumas.reduce((s, v) => s + v, 0) / lumas.length
  const range = (lumas[Math.floor(lumas.length * 0.98)] ?? 1) - (lumas[Math.floor(lumas.length * 0.02)] ?? 0)
  const round = (v: number) => Math.round(v * 100) / 100
  return {
    brightness: round(clamp((0.48 - mean) * 1.1, -0.4, 0.4)),
    contrast: round(range < 0.75 ? clamp((0.85 - range) * 0.8, 0, 0.35) : 0),
    warmth: round(clamp((b - r) * 2.2, -0.5, 0.5)),
    tint: round(clamp((g - (r + b) / 2) * 2.4, -0.4, 0.4)),
    vibrance: 0.15,
    sharpen: 0.15,
  }
}
