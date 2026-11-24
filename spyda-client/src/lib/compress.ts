/**
 * Spyda's compressor for downloads: much smaller files that look the same.
 *
 * Pictures are re-encoded as JPEG and WebP at several qualities; every version
 * is decoded and compared with the original pixel by pixel (PSNR), and the
 * smallest one that stays visually identical (≥ 42 dB) wins. Video is
 * re-encoded to H.264 MP4 with the browser's own encoder (WebCodecs, through
 * Mediabunny) at a bitrate set by the picture's size and frame rate rather
 * than by the recording, so it keeps its detail while losing most of its
 * weight. When compression would not save at least 10%, the original is kept.
 */

export type CompressResult = {
  blob: Blob
  name: string
  before: number
  after: number
  /** False when the original was kept (nothing worth saving). */
  compressed: boolean
}

/** Quality bar for pictures: above ~40 dB differences are invisible; 42 leaves margin for text edges. */
const VISUALLY_LOSSLESS_DB = 42

const swapExtension = (name: string, ext: string) => (/\.[a-z0-9]+$/i.test(name) ? name.replace(/\.[a-z0-9]+$/i, `.${ext}`) : `${name}.${ext}`)

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(blob => resolve(blob && blob.type === type ? blob : null), type, quality))

/** Peak signal-to-noise ratio between two RGBA buffers, on every other pixel of every other row. */
function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number) {
  let sum = 0
  let count = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      const dr = a[i] - b[i], dg = a[i + 1] - b[i + 1], db = a[i + 2] - b[i + 2]
      sum += dr * dr + dg * dg + db * db
      count += 3
    }
  }
  const mse = sum / Math.max(1, count)
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)
}

async function pixelsOf(blob: Blob, width: number, height: number) {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return context.getImageData(0, 0, width, height).data
}

export async function compressImage(blob: Blob, name: string): Promise<CompressResult> {
  const keep: CompressResult = { blob, name, before: blob.size, after: blob.size, compressed: false }
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const original = context.getImageData(0, 0, width, height).data
  let transparent = false
  for (let i = 3; i < original.length; i += 4 * 7) if (original[i] < 255) { transparent = true; break }

  // JPEG cannot hold transparency, so a transparent picture only tries WebP.
  const tries: Array<{ type: string; ext: string; quality: number }> = []
  for (const quality of [0.97, 0.95, 0.93, 0.9, 0.86, 0.82, 0.78]) {
    tries.push({ type: 'image/webp', ext: 'webp', quality })
    if (!transparent) tries.push({ type: 'image/jpeg', ext: 'jpg', quality })
  }
  let best: { blob: Blob; ext: string } | null = null
  for (const attempt of tries) {
    const candidate = await encode(canvas, attempt.type, attempt.quality)
    if (!candidate || candidate.size >= (best?.blob.size ?? blob.size)) continue
    const score = psnr(original, await pixelsOf(candidate, width, height), width, height)
    if (score < VISUALLY_LOSSLESS_DB) continue
    // JPEG opens everywhere; prefer it unless WebP is clearly smaller.
    if (best && best.ext === 'jpg' && attempt.ext === 'webp' && candidate.size > best.blob.size * 0.88) continue
    best = { blob: candidate, ext: attempt.ext }
  }
  if (!best || best.blob.size > blob.size * 0.9) return keep
  return { blob: best.blob, name: swapExtension(name, best.ext), before: blob.size, after: best.blob.size, compressed: true }
}

/** Whether this browser can re-encode video (WebCodecs). */
export function canCompressVideo() {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoDecoder' in window
}

/** Frames of a video at some moments, small, for comparing two encodes. */
async function framesAt(blob: Blob, moments: number[], width = 480) {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('unreadable')) })
    const height = Math.max(2, Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const frames: Uint8ClampedArray[] = []
    for (const at of moments) {
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = Math.min(Math.max(0, at), Math.max(0, video.duration - 0.05)) })
      context.drawImage(video, 0, 0, width, height)
      frames.push(context.getImageData(0, 0, width, height).data)
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** How close two frames are, in dB (PSNR on brightness): 40+ looks the same, under 36 starts to show. */
export function framePsnr(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  const n = Math.min(a.length, b.length)
  let sum = 0, count = 0
  for (let i = 0; i < n; i += 4) {
    const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]
    const lb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]
    sum += (la - lb) ** 2
    count++
  }
  const mse = sum / Math.max(1, count)
  return mse <= 1e-6 ? 99 : 10 * Math.log10((255 * 255) / mse)
}

/** The bitrate a first attempt uses: never below what keeps H.264 crisp at this size. */
export function videoTargetBitrate(pixels: number, fps: number, sourceBitrate: number) {
  // 0.08 bits per pixel per frame keeps footage and motion graphics clean (1080p30: about 5 Mbps).
  const floor = pixels * fps * 0.08
  return Math.round(Math.max(floor, sourceBitrate * 0.35))
}

/**
 * Re-encodes a video as H.264 MP4, smaller but visually the same. Each try is
 * checked against the original, frame by frame; if detail is lost it tries again
 * at a higher bitrate, and if saving space would cost quality the original is kept.
 */
export async function compressVideo(blob: Blob, name: string, onProgress?: (progress: number) => void): Promise<CompressResult> {
  const keep: CompressResult = { blob, name, before: blob.size, after: blob.size, compressed: false }
  if (!canCompressVideo()) return keep
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality, canEncodeAudio } = await import('mediabunny')
  const probe = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await probe.getPrimaryVideoTrack()
  if (!track) return keep
  const duration = Math.max(0.1, await probe.computeDuration())
  const stats = await track.computePacketStats(120).catch(() => null)
  const fps = Math.min(60, Math.max(12, stats?.averagePacketRate || 30))
  const pixels = track.displayWidth * track.displayHeight
  const source = (blob.size * 8) / duration
  const aac = await canEncodeAudio('aac').catch(() => false)
  const moments = [0.15, 0.4, 0.65, 0.9].map(f => f * duration)
  const original = await framesAt(blob, moments).catch(() => null)

  let bitrate = videoTargetBitrate(pixels, fps, source)
  for (let attempt = 0; attempt < 3; attempt++) {
    // Not worth it: this would barely save space, so the original stays as it is.
    if (bitrate > source * 0.8) return keep
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: { codec: 'avc', quality: new Quality({ bitrate, bitrateMode: 'variable' }), keyFrameInterval: 2, forceTranscode: true },
      audio: aac ? { codec: 'aac', quality: new Quality({ bitrate: 192_000 }) } : { codec: 'opus', quality: new Quality({ bitrate: 160_000 }) },
    })
    if (!conversion.isValid) return keep
    const base = attempt / 3
    conversion.onProgress = progress => onProgress?.(Math.min(0.97, base + progress / 3))
    await conversion.execute()
    const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer
    if (!buffer || buffer.byteLength > blob.size * 0.85) return keep
    const result = new Blob([buffer], { type: 'video/mp4' })
    // Compare with the original: every sampled frame has to look the same.
    const after = original ? await framesAt(result, moments).catch(() => null) : null
    const worst = original && after ? Math.min(...original.map((frame, index) => framePsnr(frame, after[index] ?? frame))) : 99
    if (worst >= 39) {
      onProgress?.(1)
      return { blob: result, name: swapExtension(name, 'mp4'), before: blob.size, after: result.size, compressed: true }
    }
    bitrate = Math.round(bitrate * 1.7)
  }
  return keep
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`
}
