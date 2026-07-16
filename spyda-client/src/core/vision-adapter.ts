import type { DesignDocument, DesignObject, PercentBox } from './design-document'

export type VisionOcrWord = {
  text: string
  confidence?: number
  box: { x: number; y: number; width: number; height: number }
}

export type VisionDetection = {
  id: string
  sourceObjectId: string | null
  kind: DesignObject['kind'] | 'ocr-text'
  label: string
  bounds: PercentBox
  rotation: number
  confidence: number | null
  evidence: string[]
}

export type VisionAnalysis = {
  schemaVersion: '1.0'
  adapter: string
  image: { width: number | null; height: number | null }
  detections: VisionDetection[]
  warnings: string[]
}

export type VisionAnalysisRequest = {
  imageDataUrl: string
  document: DesignDocument
  ocrWords?: VisionOcrWord[]
}

export interface VisionAdapter {
  readonly id: string
  analyze(request: VisionAnalysisRequest): Promise<VisionAnalysis>
}

type RemoteFetch = typeof fetch

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeBounds(box: PercentBox): PercentBox {
  const width = clamp(box.width, 0.01, 100)
  const height = clamp(box.height, 0.01, 100)
  return {
    x: clamp(box.x, 0, 100 - width),
    y: clamp(box.y, 0, 100 - height),
    width,
    height,
  }
}

function pixelBoxToPercent(box: VisionOcrWord['box'], width: number, height: number): PercentBox | null {
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return null
  return normalizeBounds({
    x: box.x / width * 100,
    y: box.y / height * 100,
    width: box.width / width * 100,
    height: box.height / height * 100,
  })
}

function safeId(value: string, fallback: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || fallback
}

export class DocumentVisionAdapter implements VisionAdapter {
  readonly id = 'document-ocr'

  async analyze({ document, ocrWords = [] }: VisionAnalysisRequest): Promise<VisionAnalysis> {
    const detections: VisionDetection[] = document.objects.flatMap(object => {
      if (!object.transform.bounds) return []
      return [{
        id: `object-${object.id}`,
        sourceObjectId: object.id,
        kind: object.kind,
        label: object.name,
        bounds: normalizeBounds(object.transform.bounds),
        rotation: object.transform.rotation,
        confidence: object.source.confidence,
        evidence: [...object.source.evidence, 'canonical-design-document'],
      }]
    })

    const width = document.canvas.width
    const height = document.canvas.height
    if (width && height) {
      ocrWords.forEach((word, index) => {
        const bounds = pixelBoxToPercent(word.box, width, height)
        if (!bounds) return
        detections.push({
          id: `ocr-${safeId(word.text, 'word')}-${index + 1}`,
          sourceObjectId: null,
          kind: 'ocr-text',
          label: word.text,
          bounds,
          rotation: 0,
          confidence: typeof word.confidence === 'number' ? word.confidence : null,
          evidence: ['google-vision-ocr'],
        })
      })
    }

    return {
      schemaVersion: '1.0',
      adapter: this.id,
      image: { width, height },
      detections,
      warnings: document.objects
        .filter(object => !object.transform.bounds)
        .map(object => `${object.id}: no measurable bounds were available`),
    }
  }
}

export class SupervisionVisionAdapter implements VisionAdapter {
  readonly id = 'roboflow-supervision'
  private readonly serviceUrl: string
  private readonly token: string
  private readonly fallback: VisionAdapter
  private readonly fetcher: RemoteFetch

  constructor(
    serviceUrl: string,
    token = '',
    fallback: VisionAdapter = new DocumentVisionAdapter(),
    fetcher: RemoteFetch = fetch,
  ) {
    this.serviceUrl = serviceUrl
    this.token = token
    this.fallback = fallback
    this.fetcher = fetcher
  }

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysis> {
    const fallbackAnalysis = await this.fallback.analyze(request)
    try {
      const response = await this.fetcher(`${this.serviceUrl.replace(/\/$/, '')}/v1/analyze`, {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          imageDataUrl: request.imageDataUrl,
          canvas: request.document.canvas,
          candidates: fallbackAnalysis.detections.filter(item => item.sourceObjectId),
        }),
      })

      if (!response.ok) throw new Error(`Vision service returned ${response.status}`)
      const payload = await response.json() as Partial<VisionAnalysis>
      const remoteDetections = Array.isArray(payload.detections)
        ? payload.detections.filter(detection => detection?.bounds).map(detection => ({
            ...detection,
            bounds: normalizeBounds(detection.bounds),
            evidence: [...(detection.evidence || []), 'roboflow-supervision'],
          } as VisionDetection))
        : []

      const remoteIds = new Set(remoteDetections.map(item => item.sourceObjectId).filter(Boolean))
      return {
        schemaVersion: '1.0',
        adapter: this.id,
        image: payload.image || fallbackAnalysis.image,
        detections: [
          ...remoteDetections,
          ...fallbackAnalysis.detections.filter(item => !item.sourceObjectId || !remoteIds.has(item.sourceObjectId)),
        ],
        warnings: [...fallbackAnalysis.warnings, ...(payload.warnings || [])],
      }
    } catch (error) {
      return {
        ...fallbackAnalysis,
        adapter: `${this.id}:fallback`,
        warnings: [
          ...fallbackAnalysis.warnings,
          `Supervision service unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
        ],
      }
    }
  }
}

export function createVisionAdapter(environment: Record<string, string | undefined> = {}): VisionAdapter {
  const serviceUrl = environment.SPYDA_VISION_SERVICE_URL?.trim()
  if (!serviceUrl) return new DocumentVisionAdapter()
  return new SupervisionVisionAdapter(serviceUrl, environment.SPYDA_VISION_SERVICE_TOKEN || '')
}
