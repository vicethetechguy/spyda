import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument } from './design-document'
import { applyDesignEdits, enforceDesignConstraints } from './constraint-engine'
import { planRenderStrategy } from './render-strategy'

function referenceDocument() {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1080, height: 1350, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
      sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: {},
      editableComponents: [{ id: 'logo', type: 'brand', name: 'Logo', editable: true, content: 'Logo', style: 'Original colors', layerIndex: 4, boundingBox: { x: 5, y: 5, width: 12, height: 6 }, sectionId: 'main' }],
    },
  }, { canvas: { width: 1080, height: 1350 } })
}

describe('Constraint Engine and render planning', () => {
  it('rejects implicit geometry edits and preserves measured geometry', () => {
    const reference = referenceDocument()
    const edit = applyDesignEdits(reference, [{ objectId: 'logo', property: 'bounds', value: { x: 40, y: 40, width: 40, height: 40 } }])
    expect(edit.violations[0].code).toBe('geometry-not-explicit')

    const candidate = structuredClone(reference)
    candidate.canvas.width = 2000
    candidate.objects[0].transform.bounds = { x: 30, y: 30, width: 40, height: 30 }
    const enforced = enforceDesignConstraints(reference, candidate)
    expect(enforced.document.canvas.width).toBe(1080)
    expect(enforced.document.objects[0].transform.bounds).toEqual(reference.objects[0].transform.bounds)
    expect(enforced.violations.map(item => item.code)).toEqual(expect.arrayContaining(['canvas-size-changed', 'bounds-changed']))
  })

  it('avoids image generation for measured asset swaps', () => {
    const plan = planRenderStrategy(referenceDocument(), [{ objectId: 'logo', kind: 'asset-replacement', hasMeasuredBounds: true }])
    expect(plan.mode).toBe('deterministic-composite')
    expect(plan.invokeImageModel).toBe(false)
  })

  it('uses AI only when a flat-raster edit needs synthesis', () => {
    const plan = planRenderStrategy(referenceDocument(), [{ objectId: 'logo', kind: 'text-replacement', reconstructedLayerAvailable: false }])
    expect(plan.mode).toBe('ai-assisted')
    expect(plan.reasons[0]).toContain('flat raster')
  })
})
