import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument } from './design-document'
import { readRasterDimensions, validateDesignFidelity, validateRenderedDimensions } from './validation-engine'

function designDocument() {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1000, height: 1000, aspectRatio: '1:1', orientation: 'square', colorSpace: 'RGB' },
      sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: { palette: { primary: '#111111', secondary: '#22c55e', accent: '#ffffff' } },
      editableComponents: [{ id: 'headline', type: 'text', name: 'Headline', editable: true, content: 'Hello', style: 'Bold', fontFamily: 'Montserrat', fontSize: 48, layerIndex: 2, boundingBox: { x: 10, y: 10, width: 80, height: 12 }, sectionId: 'main' }],
    },
  }, { canvas: { width: 1000, height: 1000 } })
}

describe('Validation Engine', () => {
  it('reports perfect fidelity for an unchanged constrained document', () => {
    const reference = designDocument()
    const report = validateDesignFidelity(reference, structuredClone(reference))
    expect(report.passed).toBe(true)
    expect(report.overall).toBe(100)
  })

  it('detects layout drift and typography changes', () => {
    const reference = designDocument()
    const candidate = structuredClone(reference)
    candidate.objects[0].transform.bounds = { x: 25, y: 20, width: 60, height: 20 }
    candidate.objects[0].style.fontFamily = 'Arial'
    const report = validateDesignFidelity(reference, candidate)
    expect(report.passed).toBe(false)
    expect(report.metrics.position.score).toBeLessThan(100)
    expect(report.metrics.scale.score).toBeLessThan(100)
    expect(report.metrics.typography.score).toBeLessThan(100)
  })

  it('reads raster dimensions and verifies the rendered aspect ratio', () => {
    const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    expect(readRasterDimensions(onePixelPng)).toEqual({ width: 1, height: 1 })
    expect(validateRenderedDimensions(designDocument().canvas, onePixelPng).passed).toBe(true)
  })
})
