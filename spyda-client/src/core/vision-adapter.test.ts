import { describe, expect, it, vi } from 'vitest'
import { adaptBreakdownToDesignDocument } from './design-document'
import { DocumentVisionAdapter, SupervisionVisionAdapter } from './vision-adapter'

function testDocument() {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1000, height: 500, aspectRatio: '2:1', orientation: 'landscape', colorSpace: 'RGB' },
      sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: {},
      editableComponents: [{
        id: 'headline',
        type: 'text',
        name: 'Headline',
        editable: true,
        content: 'Launch today',
        style: 'Bold',
        layerIndex: 1,
        boundingBox: { x: 10, y: 12, width: 50, height: 10 },
        sectionId: 'main',
      }],
    },
  }, { canvas: { width: 1000, height: 500 } })
}

describe('Vision Adapter', () => {
  it('combines canonical object geometry with OCR measurements', async () => {
    const result = await new DocumentVisionAdapter().analyze({
      imageDataUrl: 'data:image/png;base64,AA==',
      document: testDocument(),
      ocrWords: [{ text: 'Launch', box: { x: 100, y: 50, width: 200, height: 40 }, confidence: 0.98 }],
    })

    expect(result.adapter).toBe('document-ocr')
    expect(result.detections).toHaveLength(2)
    expect(result.detections[1].bounds).toEqual({ x: 10, y: 10, width: 20, height: 8 })
  })

  it('falls back without interrupting analysis when Supervision is unavailable', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    const adapter = new SupervisionVisionAdapter('https://vision.example', '', new DocumentVisionAdapter(), fetcher)
    const result = await adapter.analyze({ imageDataUrl: 'data:image/png;base64,AA==', document: testDocument() })

    expect(result.adapter).toBe('roboflow-supervision:fallback')
    expect(result.detections[0].sourceObjectId).toBe('headline')
    expect(result.warnings.some(warning => warning.includes('offline'))).toBe(true)
  })
})
