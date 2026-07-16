import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument } from './design-document'
import { inferLayoutIntelligence } from './layout-intelligence'
import { DocumentVisionAdapter } from './vision-adapter'

function layoutDocument() {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1000, height: 1000, aspectRatio: '1:1', orientation: 'square', colorSpace: 'RGB' },
      sections: [{ id: 'hero', name: 'Hero', bounds: { x: 5, y: 5, width: 90, height: 90 } }],
      styleTokens: {},
      editableComponents: [
        { id: 'headline', type: 'text', name: 'Headline', editable: true, content: 'Build better', style: 'Bold', layerIndex: 2, boundingBox: { x: 10, y: 10, width: 80, height: 10 }, sectionId: 'hero' },
        { id: 'subhead', type: 'text', name: 'Subhead', editable: true, content: 'Start today', style: 'Regular', layerIndex: 3, boundingBox: { x: 10, y: 24, width: 80, height: 6 }, sectionId: 'hero' },
        { id: 'subject', type: 'image', name: 'Subject', editable: true, content: 'Person', style: 'Centered', layerIndex: 1, boundingBox: { x: 20, y: 38, width: 60, height: 50 }, sectionId: 'hero' },
      ],
    },
  }, { canvas: { width: 1000, height: 1000 } })
}

describe('Layout Intelligence Engine', () => {
  it('infers shared alignments, spacing, hierarchy, and authoritative measurements', async () => {
    const document = layoutDocument()
    const vision = await new DocumentVisionAdapter().analyze({ imageDataUrl: 'data:image/png;base64,AA==', document })
    const layout = inferLayoutIntelligence(document, vision)

    expect(layout.grid.columns.some(line => line.objectIds.includes('headline') && line.objectIds.includes('subhead'))).toBe(true)
    expect(layout.measurements.headline.pixelBounds).toEqual({ x: 100, y: 100, width: 800, height: 100 })
    expect(layout.measurements.headline.alignmentPeers).toContain('subhead')
    expect(layout.measurements.subject.aspectRatio).toBe(1.2)
    expect(layout.groups[0].objectIds).toHaveLength(3)
    expect(layout.hierarchy).toHaveLength(3)
  })
})
