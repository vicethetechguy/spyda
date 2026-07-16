import { describe, expect, it } from 'vitest'
import { buildDesignIntelligence } from './analysis-pipeline'
import { designDocumentToLegacyBreakdown, adaptBreakdownToDesignDocument } from './design-document'

describe('Spyda V2 analysis pipeline', () => {
  it('adds vision, layout, and constraints without changing the legacy workspace contract', async () => {
    const legacy = {
      design: {
        metadata: { width: 800, height: 1000, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
        sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
        styleTokens: {},
        editableComponents: [{ id: 'cta', type: 'action', name: 'CTA', editable: true, content: 'Get started', style: 'Button', layerIndex: 1, boundingBox: { x: 30, y: 80, width: 40, height: 8 }, sectionId: 'main' }],
      },
    }
    const document = adaptBreakdownToDesignDocument(legacy, { canvas: { width: 800, height: 1000 } })
    const breakdown = designDocumentToLegacyBreakdown(document, legacy)
    const intelligence = await buildDesignIntelligence({ breakdown, imageDataUrl: 'data:image/png;base64,AA==' })

    expect(intelligence.architectureVersion).toBe('spyda-v2')
    expect(intelligence.visionAnalysis.detections[0].sourceObjectId).toBe('cta')
    expect(intelligence.layoutIntelligence.measurements.cta.pixelBounds).toEqual({ x: 240, y: 800, width: 320, height: 80 })
    expect(intelligence.constraintProfile.objects.cta.lockPosition).toBe(true)
    expect(breakdown.design.editableComponents[0].id).toBe('cta')
  })
})
