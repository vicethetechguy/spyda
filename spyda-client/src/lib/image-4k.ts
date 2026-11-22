/**
 * 4K rendering for pictures that land on the canvas.
 *
 * A picture smaller than 4K (3840 px on its long edge) is scaled up in steps
 * of at most 2x with the browser's high-quality smoothing, which keeps edges
 * far cleaner than one big jump, then given a light unsharp mask so small
 * type and fine lines stay crisp. A picture already at 4K or above keeps its
 * own pixels (capped at 4096 px so the canvas stays fast).
 */

export const UHD_LONG_EDGE = 3840
const MAX_LONG_EDGE = 4096

type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap

function sizeOf(source: Drawable) {
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height }
  return { width: source.width, height: source.height }
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/**
 * Unsharp mask with a 3x3 box blur: out = in + amount * (in - blur).
 * Alpha is left alone so cut-out edges do not ring.
 */
export function sharpen(canvas: HTMLCanvasElement, amount = 0.35) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || amount <= 0) return canvas
  const { width, height } = canvas
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  const source = new Uint8ClampedArray(data)
  const row = width * 4
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * row + x * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const at = index + channel
        const blur = (
          source[at - row - 4] + source[at - row] + source[at - row + 4]
          + source[at - 4] + source[at] + source[at + 4]
          + source[at + row - 4] + source[at + row] + source[at + row + 4]
        ) / 9
        data[at] = source[at] + amount * (source[at] - blur)
      }
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/** The picture at 4K: stepped high-quality upscale plus a light sharpen, or its own pixels if already that large. */
export function renderAt4K(source: Drawable, target = UHD_LONG_EDGE): HTMLCanvasElement {
  const { width, height } = sizeOf(source)
  const long = Math.max(width, height)
  if (!long) return canvasOf(1, 1)

  if (long >= target) {
    const scale = Math.min(1, MAX_LONG_EDGE / long)
    const canvas = canvasOf(width * scale, height * scale)
    const context = canvas.getContext('2d')!
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  const finalScale = target / long
  let current: Drawable = source
  let currentWidth = width
  let currentHeight = height
  // Never more than 2x per pass: each pass interpolates from a cleaner base.
  while (currentWidth * 2 < width * finalScale) {
    const next = canvasOf(currentWidth * 2, currentHeight * 2)
    const context = next.getContext('2d')!
    context.imageSmoothingQuality = 'high'
    context.drawImage(current, 0, 0, next.width, next.height)
    current = next
    currentWidth = next.width
    currentHeight = next.height
  }
  const output = canvasOf(width * finalScale, height * finalScale)
  const context = output.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(current, 0, 0, output.width, output.height)
  // More sharpening the further it was enlarged, never enough to halo.
  return sharpen(output, Math.min(0.55, 0.18 + 0.12 * Math.log2(finalScale)))
}

/** Whether any pixel is less than fully opaque, so the encoder keeps alpha. */
export function hasTransparency(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return false
  // A sparse sample is enough to tell a cut-out from a photo.
  const step = Math.max(1, Math.floor((canvas.width * canvas.height) / 40000))
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 3; index < data.length; index += 4 * step) if (data[index] < 250) return true
  return false
}

/** WebP keeps alpha at a fraction of PNG's size; JPEG or PNG where WebP is not available. */
export function encodeCanvas(canvas: HTMLCanvasElement, alpha: boolean, quality = 0.94): Promise<Blob> {
  const attempt = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  return attempt('image/webp').then(async blob => {
    if (blob && blob.type === 'image/webp') return blob
    const fallback = await attempt(alpha ? 'image/png' : 'image/jpeg')
    if (!fallback) throw new Error('The picture could not be encoded.')
    return fallback
  })
}

export function loadDrawable(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')) }
    image.src = url
  })
}

/** A file or blob, rendered at 4K and encoded: what the canvas stores for a placed picture. */
export async function pictureAt4K(blob: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const drawable = await loadDrawable(blob)
  const canvas = renderAt4K(drawable)
  if ('close' in drawable) drawable.close()
  const encoded = await encodeCanvas(canvas, hasTransparency(canvas))
  return { blob: encoded, width: canvas.width, height: canvas.height }
}
