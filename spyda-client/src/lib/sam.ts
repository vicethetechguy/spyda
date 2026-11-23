import type { SamRequest, SamResult } from '../workers/sam.worker'

/**
 * Box-prompted outlines from SlimSAM, running in a worker. Give it a picture
 * and rough boxes; get back, per box, a soft mask at the picture's size and how
 * sure the model is. The model downloads once (tens of MB) and is cached.
 */

const SAM_EDGE = 1024

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (result: SamResult) => void>()
/** Which backend the last outlining ran on (webgpu or wasm), for diagnostics. */
export let lastDevice: string | null = null

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/sam.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<SamResult>) => {
      pending.get(event.data.id)?.(event.data)
      pending.delete(event.data.id)
    }
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve({ id: 0, masks: null, width: 0, height: 0, error: 'The outlining model stopped.' })
      pending.clear()
      worker = null
    }
  }
  return worker
}

export type SamOutline = {
  /** 0-255 alpha at the requested width and height, softened at the edge (enlarged on first use). */
  readonly alpha: Uint8ClampedArray
  score: number
  /** Share of the picture it covers, 0..1. */
  share: number
}

/** SAM's candidates for one prompt (part, larger part, whole), largest first. */
export type SamCandidates = SamOutline[]

/**
 * Outlines for every box (in `width`×`height` pixels of `source`), or null for
 * a box the model could not outline. Rejects if the model cannot run here.
 */
export async function outlineBoxes(
  source: CanvasImageSource,
  width: number,
  height: number,
  /** Clip boxes; `px`/`py` aim SAM at a point (default: the box centre). */
  boxes: Array<{ x: number; y: number; w: number; h: number; px?: number; py?: number }>,
  timeoutMs = 120_000,
): Promise<Array<SamCandidates | null>> {
  if (!boxes.length) return []
  if (typeof Worker === 'undefined') throw new Error('This browser cannot run the outlining model.')
  // SAM works at 1024 px anyway; a smaller copy keeps transfers and masks light.
  const scale = Math.min(1, SAM_EDGE / Math.max(width, height))
  const sw = Math.max(1, Math.round(width * scale)), sh = Math.max(1, Math.round(height * scale))
  const small = document.createElement('canvas')
  small.width = sw
  small.height = sh
  const context = small.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, sw, sh)
  const pixels = context.getImageData(0, 0, sw, sh).data

  const id = nextId++
  const request: SamRequest = {
    id,
    width: sw,
    height: sh,
    pixels,
    boxes: boxes.map(box => [box.x * scale, box.y * scale, (box.x + box.w) * scale, (box.y + box.h) * scale, (box.px ?? box.x + box.w / 2) * scale, (box.py ?? box.y + box.h / 2) * scale]),
  }
  const result = await new Promise<SamResult>((resolve, reject) => {
    const timer = window.setTimeout(() => { pending.delete(id); reject(new Error('Outlining took too long.')) }, timeoutMs)
    pending.set(id, value => { window.clearTimeout(timer); resolve(value) })
    getWorker().postMessage(request, [pixels.buffer])
  })
  if (!result.masks) throw new Error(result.error || 'Outlining failed.')
  lastDevice = result.device ?? null

  // Each mask back up to full size, smoothly, so its edge is soft rather than stepped.
  const up = document.createElement('canvas')
  up.width = width
  up.height = height
  const upContext = up.getContext('2d', { willReadFrequently: true })!
  upContext.imageSmoothingQuality = 'high'
  const plane = document.createElement('canvas')
  plane.width = sw
  plane.height = sh
  const planeContext = plane.getContext('2d')!
  const enlarge = (mask: Uint8Array) => {
    const picture = planeContext.createImageData(sw, sh)
    for (let i = 0; i < mask.length; i += 1) if (mask[i]) picture.data[i * 4 + 3] = 255
    planeContext.putImageData(picture, 0, 0)
    upContext.clearRect(0, 0, width, height)
    upContext.drawImage(plane, 0, 0, width, height)
    const data = upContext.getImageData(0, 0, width, height).data
    const alpha = new Uint8ClampedArray(width * height)
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3]
    return alpha
  }
  return result.masks.map(candidates => {
    const usable = candidates.filter(candidate => candidate.area > 0)
    if (!usable.length) return null
    return usable.map(({ mask, score, area }) => {
      let cached: Uint8ClampedArray | null = null
      return {
        score,
        share: area / (sw * sh),
        get alpha() { return (cached ??= enlarge(mask)) },
      }
    })
  })
}
