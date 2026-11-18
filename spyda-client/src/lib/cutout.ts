import type { DesignObject, PercentBox } from '../core/design-document.js'
import { isUsableMask, type CutoutDraft, type CutoutProducer } from '../core/layer-extraction.js'
import type { FlyerMatte } from './segmentation.js'

/**
 * DOM half of layer extraction: cuts each object out of the flyer using the
 * full-frame matte.
 *
 * The matte is applied last with `destination-in`, so a layer keeps the flyer's
 * own pixels and only its alpha changes. No colour is invented, which is what
 * makes a cut-out layer look identical to the original before anything is moved.
 */

type PixelRect = { x: number; y: number; width: number; height: number }

const rasterCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>()

/** The source flyer as a canvas, so repeated crops do not re-decode the image. */
function sourceRaster(source: HTMLImageElement) {
  const cached = rasterCache.get(source)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth || source.width
  canvas.height = source.naturalHeight || source.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable.')

  context.drawImage(source, 0, 0)
  rasterCache.set(source, canvas)
  return canvas
}

function toPixelRect(bounds: PercentBox, width: number, height: number): PixelRect {
  const x = Math.max(0, Math.floor((bounds.x / 100) * width))
  const y = Math.max(0, Math.floor((bounds.y / 100) * height))
  const rectWidth = Math.max(1, Math.min(width - x, Math.round((bounds.width / 100) * width)))
  const rectHeight = Math.max(1, Math.min(height - y, Math.round((bounds.height / 100) * height)))
  return { x, y, width: rectWidth, height: rectHeight }
}

function cropPlain(raster: HTMLCanvasElement, rect: PixelRect) {
  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const context = canvas.getContext('2d')!
  context.drawImage(raster, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
  return canvas
}

function cropWithMatte(raster: HTMLCanvasElement, matte: FlyerMatte, rect: PixelRect) {
  const canvas = cropPlain(raster, rect)
  const context = canvas.getContext('2d')!
  // The matte can be a different resolution than the source, so map the same
  // region through each image's own scale.
  const matteScaleX = matte.width / raster.width
  const matteScaleY = matte.height / raster.height
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(
    matte.canvas,
    rect.x * matteScaleX,
    rect.y * matteScaleY,
    rect.width * matteScaleX,
    rect.height * matteScaleY,
    0,
    0,
    rect.width,
    rect.height,
  )
  context.globalCompositeOperation = 'source-over'
  return canvas
}

function alphaCoverage(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { coverage: 0, solidCoverage: 0 }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let foreground = 0
  let solid = 0
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index]
    if (alpha > 20) foreground += 1
    if (alpha > 235) solid += 1
  }
  const total = canvas.width * canvas.height
  if (total === 0) return { coverage: 0, solidCoverage: 0 }
  return { coverage: foreground / total, solidCoverage: solid / total }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas could not be encoded.'))),
      type,
      quality,
    )
  })
}

/**
 * Builds the cut-out producer for one flyer and its matte. Every layer reuses the
 * same raster and matte, so adding layers does not add segmentation cost.
 */
export function createMatteCutoutProducer(source: HTMLImageElement, matte: FlyerMatte): CutoutProducer {
  const raster = sourceRaster(source)

  return async (object: DesignObject): Promise<CutoutDraft | null> => {
    const bounds = object.transform.bounds
    if (!bounds) return null

    const rect = toPixelRect(bounds, raster.width, raster.height)
    const masked = cropWithMatte(raster, matte, rect)
    const measurements = alphaCoverage(masked)

    // Accepted: a real alpha cut-out. Rejected: keep the rectangle so the layer
    // is still editable, and report the mask's measurements so the caller can
    // downgrade it and warn.
    const blob = isUsableMask(measurements)
      ? await canvasToBlob(masked)
      : await canvasToBlob(cropPlain(raster, rect))

    return { blob, ...measurements }
  }
}

/**
 * The background layer keeps the untouched flyer, so that removing a layer does
 * not leave a hole where the model invented pixels. JPEG, because it is a
 * photograph of the whole page and PNG would triple its size for no benefit.
 */
export async function produceFullFrameBackground(source: HTMLImageElement) {
  const raster = sourceRaster(source)
  return canvasToBlob(raster, 'image/jpeg', 0.94)
}
