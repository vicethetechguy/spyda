import { describe, expect, it } from 'vitest'
import {
  DESIGN_DOCUMENT_VERSION,
  adaptBreakdownToDesignDocument,
  designDocumentToLegacyBreakdown,
  safeParseDesignDocument,
} from './design-document'
import { validateDesignBreakdown } from '../../api/_utils'

const currentBreakdown = {
  design: {
    metadata: { width: 1080, height: 1350, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
    sections: [
      { id: 'header', name: 'Header', bounds: { x: 0, y: 0, width: 100, height: 24 } },
      { id: 'hero', name: 'Hero', bounds: { x: 0, y: 24, width: 100, height: 76 } },
    ],
    styleTokens: {
      palette: { primary: '#111111', secondary: '#22C55E', accent: '#FFFFFF' },
      typography: { headingFont: 'Space Grotesk', bodyFont: 'Montserrat' },
      visualStyle: 'Premium editorial flyer',
    },
    editableComponents: [
      {
        id: 'brand-logo',
        name: 'Brand Logo',
        type: 'brand',
        editable: true,
        content: 'Existing logo',
        style: 'Small top logo',
        layerIndex: 4,
        boundingBox: { x: 42, y: 4, width: 16, height: 7 },
        sectionId: 'header',
      },
      {
        id: 'headline',
        name: 'Headline',
        type: 'text',
        editable: true,
        content: 'Generate premium quality designs',
        style: 'Large centered headline',
        layerIndex: 8,
        boundingBox: { x: 10, y: 28, width: 80, height: 16 },
        sectionId: 'hero',
      },
    ],
  },
}

describe('Design Document compatibility boundary', () => {
  it('adapts the current breakdown into a strict V2 document', () => {
    const document = adaptBreakdownToDesignDocument(currentBreakdown, {
      id: 'fixture-current',
      provider: 'test-provider',
      createdAt: '2026-07-14T00:00:00.000Z',
    })

    expect(document.schemaVersion).toBe(DESIGN_DOCUMENT_VERSION)
    expect(document.sourceAsset).toEqual({ fileName: null, mimeType: null })
    expect(document.canvas).toMatchObject({ width: 1080, height: 1350, aspectRatio: '4:5' })
    expect(document.sections).toHaveLength(2)
    expect(document.objects).toHaveLength(2)
    expect(document.objects[0]).toMatchObject({
      id: 'brand-logo',
      kind: 'logo',
      sectionId: 'header',
      transform: { bounds: { x: 42, y: 4, width: 16, height: 7 } },
      constraints: { lockPosition: true, lockSize: true, stayInsideCanvas: true },
    })
    expect(document.objects[0].protection.protectedProperties).toContain('identity')
  })

  it('keeps legacy section-based breakdowns readable', () => {
    const document = adaptBreakdownToDesignDocument({
      constants: {
        headingFont: 'Anton',
        bodyFont: 'Inter',
        colors: { primary: '#101010', secondary: '#00CC88', accent: '#FFFFFF' },
      },
      sections: [{
        id: 'old-headline',
        name: 'Old Headline',
        type: 'text',
        current: { text: 'Legacy text', boundingBox: 'top center' },
        replacementNeeded: ['New headline'],
      }],
    }, { createdAt: '2026-07-14T00:00:00.000Z' })

    expect(document.analysis.sourceSchema).toBe('spyda-legacy-sections')
    expect(document.styleTokens.typography).toEqual({ headingFont: 'Anton', bodyFont: 'Inter' })
    expect(document.objects[0].content.text).toBe('Legacy text')
    expect(document.objects[0].transform.bounds).toBeNull()
    expect(document.analysis.warnings).toContain('old-headline: bounds require measurement')
  })

  it('round-trips through the current workspace shape', () => {
    const document = adaptBreakdownToDesignDocument(currentBreakdown, {
      createdAt: '2026-07-14T00:00:00.000Z',
    })
    const legacy = designDocumentToLegacyBreakdown(document, currentBreakdown)

    expect(legacy.design.editableComponents.map(object => object.id)).toEqual(['brand-logo', 'headline'])
    expect(legacy.design.editableComponents[0].type).toBe('brand')
    expect(legacy.design.editableComponents[1].content).toBe('Generate premium quality designs')
    expect(legacy.designDocument).toEqual(document)
  })

  it('adds the canonical document at the existing analysis boundary', () => {
    const breakdown = validateDesignBreakdown(currentBreakdown, {
      designId: 'project-123',
      provider: 'test-provider',
      width: 1080,
      height: 1350,
      fileName: 'reference.png',
      mimeType: 'image/png',
    })

    expect(breakdown.design.editableComponents).toHaveLength(2)
    expect(breakdown.designDocument).toMatchObject({
      schemaVersion: DESIGN_DOCUMENT_VERSION,
      id: 'project-123',
      sourceAsset: { fileName: 'reference.png', mimeType: 'image/png' },
      canvas: { width: 1080, height: 1350 },
      analysis: { provider: 'test-provider' },
    })
  })

  it('rejects canonical documents that reference missing sections', () => {
    const document = adaptBreakdownToDesignDocument(currentBreakdown, {
      createdAt: '2026-07-14T00:00:00.000Z',
    })
    const invalid = structuredClone(document)
    invalid.objects[0].sectionId = 'missing-section'

    const result = safeParseDesignDocument(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.message.includes('Unknown section id'))).toBe(true)
    }
  })

  it('rejects unknown canonical fields instead of silently accepting drift', () => {
    const document = adaptBreakdownToDesignDocument(currentBreakdown, {
      createdAt: '2026-07-14T00:00:00.000Z',
    })
    const invalid = { ...document, unexpectedField: true }

    expect(safeParseDesignDocument(invalid).success).toBe(false)
  })
})
