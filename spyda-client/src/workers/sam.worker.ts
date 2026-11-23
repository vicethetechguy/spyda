/// <reference lib="webworker" />
import { AutoProcessor, RawImage, SamModel, Tensor, env } from '@huggingface/transformers'

/**
 * SlimSAM (a compact Segment Anything) in a worker, so outlining never freezes
 * the canvas. One image embedding per picture, then every box prompt in one
 * decoder pass; each box gets its best-scoring mask back.
 */

const MODEL = 'Xenova/slimsam-77-uniform'

env.allowLocalModels = false

type Loaded = { model: SamModel; processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>; device: string }
let loading: Promise<Loaded> | null = null

function load() {
  if (!loading) {
    loading = (async () => {
      const processor = await AutoProcessor.from_pretrained(MODEL)
      // WebAssembly only: measured on this model, the WebGPU path returns broken
      // outlines (confidence 0.39-0.79, near-empty masks) where WebAssembly
      // returns the right ones (0.92-0.95).
      const model = await SamModel.from_pretrained(MODEL, { device: 'wasm' }) as SamModel
      return { model, processor, device: 'wasm' }
    })()
    loading.catch(() => { loading = null })
  }
  return loading
}

/** Each prompt: a clip box (x0, y0, x1, y1) and the point SAM is aimed at (px, py). */
export type SamRequest = { id: number; width: number; height: number; pixels: Uint8ClampedArray; boxes: Array<[number, number, number, number, number, number]> }
export type SamResult = { id: number; masks: Array<Array<{ mask: Uint8Array; score: number; area: number }>> | null; width: number; height: number; error?: string; device?: string }

self.onmessage = async (event: MessageEvent<SamRequest>) => {
  const { id, width, height, pixels, boxes } = event.data
  try {
    const { model, processor, device } = await load()
    const image = new RawImage(pixels, width, height, 4).rgb()
    const inputs = await processor(image)
    const embeddings = await model.get_image_embeddings(inputs)
    // Boxes come in image pixels; the decoder wants them in the resized frame.
    // This SlimSAM export reads points, not boxes, and one prompt per call, so
    // each box is prompted on its own by its centre ("this object"), reusing the
    // image embedding, and its outline is clipped to the box afterwards.
    // (Corner "not this" points were tried: a photo's box hugs its subject, so
    // its corners land on the subject and erase it.)
    const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number]
    const sx = rw / width, sy = rh / height
    // AutoProcessor is typed generically; for a SAM model it is a SamProcessor.
    const sam = processor as unknown as { post_process_masks: (...args: unknown[]) => Promise<Tensor[]> }
    const plane = width * height
    const results: Array<Array<{ mask: Uint8Array; score: number; area: number }>> = []
    for (const [x0, y0, x1, y1, px, py] of boxes) {
      const output = await model({
        ...embeddings,
        input_points: new Tensor('float32', new Float32Array([px * sx, py * sy]), [1, 1, 1, 2]),
        input_labels: new Tensor('int64', new BigInt64Array([1n]), [1, 1, 1]),
      })
      const [masks] = await sam.post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
      const scores = output.iou_scores.data as Float32Array
      const all = masks.data as Uint8Array
      // SAM offers a small part, a larger part and the whole object. All three
      // go back, largest first, so the caller can take the largest that makes
      // sense (the whole badge rather than its letter, but not the backdrop).
      const candidates: Array<{ mask: Uint8Array; score: number; area: number }> = []
      for (let k = 0; k < 3; k += 1) {
        const mask = all.slice(k * plane, (k + 1) * plane)
        let area = 0
        // Nothing outside its box belongs to it.
        for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
          const i = y * width + x
          if (x < x0 || x > x1 || y < y0 || y > y1) mask[i] = 0
          else area += mask[i]
        }
        candidates.push({ mask, score: scores[k], area })
      }
      candidates.sort((a, b) => b.area - a.area)
      results.push(candidates)
    }
    const message: SamResult = { id, masks: results, width, height, device }
    ;(self as unknown as Worker).postMessage(message, results.flatMap(candidates => candidates.map(candidate => candidate.mask.buffer)))
  } catch (error) {
    const message: SamResult = { id, masks: null, width, height, error: error instanceof Error ? error.message : 'Outlining failed.' }
    ;(self as unknown as Worker).postMessage(message)
  }
}
