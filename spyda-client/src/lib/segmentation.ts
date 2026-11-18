/**
 * In-browser foreground segmentation.
 *
 * The ordering here is the whole point, and it came out of measurement rather
 * than assumption. Handing the model a tight crop of a subject that touches
 * every edge produced a near-empty mask (0.00% opaque on a 324x460 crop), while
 * the same subject in its full frame isolated correctly (12.39% opaque). So the
 * matte is always computed over the whole flyer and each layer is cut from that
 * matte afterwards.
 *
 * That ordering also costs one inference per flyer instead of one per layer,
 * which matters because a single run is several seconds.
 */

export type FlyerMatte = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** Share of pixels the model considered foreground, 0..1. */
  opaqueRatio: number
}

export type SegmentFlyerOptions = {
  model?: 'isnet_quint8' | 'isnet_fp16' | 'isnet'
  signal?: AbortSignal
}

const matteCache = new Map<string, Promise<FlyerMatte>>()

/** `data:` and `blob:` sources are already bytes; everything else is downloaded. */
async function toLocalSource(source: string) {
  if (/^(data|blob):/i.test(source)) {
    return { url: source, release: () => undefined }
  }
  const response = await fetch(source)
  if (!response.ok) throw new Error(`Could not read the flyer (${response.status}).`)
  const url = URL.createObjectURL(await response.blob())
  return { url, release: () => URL.revokeObjectURL(url) }
}

/**
 * Cheap session key for a data URL. Sampling every 97th character is enough to
 * tell flyers apart without hashing megabytes on the main thread.
 */
export function flyerCacheKey(dataUrl: string) {
  let hash = 5381
  for (let index = 0; index < dataUrl.length; index += 97) {
    hash = ((hash << 5) + hash + dataUrl.charCodeAt(index)) | 0
  }
  return `${dataUrl.length}:${hash}`
}

function measureOpaqueRatio(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height)
  let foreground = 0
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 20) foreground += 1
  }
  const total = width * height
  return total > 0 ? foreground / total : 0
}

async function runSegmentation(sourceDataUrl: string, options: SegmentFlyerOptions): Promise<FlyerMatte> {
  if (options.signal?.aborted) throw new DOMException('Segmentation cancelled.', 'AbortError')

  const { removeBackground } = await import('@imgly/background-removal')

  if (options.signal?.aborted) throw new DOMException('Segmentation cancelled.', 'AbortError')

  /**
   * The model library treats anything that is not a `data:` or `blob:` URL as a
   * path inside its own hosted model directory, so handing it an ordinary image
   * URL sends it to a CDN that answers 404 with an HTML page. Downloading first
   * keeps `/assets/...` and remote project previews working.
   */
  const local = await toLocalSource(sourceDataUrl)

  try {
    // The model is chosen for size: quantised weights are a fraction of the fp32
    // model and the spike showed no quality difference on our samples.
    const blob = await removeBackground(local.url, { model: options.model ?? 'isnet_quint8' })

    if (options.signal?.aborted) throw new DOMException('Segmentation cancelled.', 'AbortError')

    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas 2D context is unavailable, so no matte can be built.')

    context.drawImage(bitmap, 0, 0)
    bitmap.close()

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      opaqueRatio: measureOpaqueRatio(context, canvas.width, canvas.height),
    }
  } finally {
    local.release()
  }
}

/**
 * Segments a flyer once and reuses the matte for every layer of that flyer.
 * Concurrent calls share the same in-flight promise, so opening the editor twice
 * does not start two inferences.
 */
export async function segmentFlyer(sourceDataUrl: string, options: SegmentFlyerOptions = {}): Promise<FlyerMatte> {
  const key = flyerCacheKey(sourceDataUrl)
  const cached = matteCache.get(key)
  if (cached) return cached

  const job = runSegmentation(sourceDataUrl, options)
  matteCache.set(key, job)

  try {
    return await job
  } catch (error) {
    matteCache.delete(key)
    throw error
  }
}

export function __clearMatteCache() {
  matteCache.clear()
}
