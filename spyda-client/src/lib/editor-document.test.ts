import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument } from '../core/design-document'
import { applyEditIntent } from '../core/constraint-engine'
import { prepareForEditing } from './editor-document'

const breakdown = {
  design: {
    metadata: { width: 1080, height: 1350, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
    sections: [{ id: 'hero', name: 'Hero', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
    styleTokens: {
      palette: { primary: '#111111', secondary: '#22C55E', accent: '#FFFFFF' },
      typography: { headingFont: 'Space Grotesk', bodyFont: 'Montserrat' },
      visualStyle: 'Premium editorial flyer',
    },
    editableComponents: [
      {
        id: 'headline', name: 'Headline', type: 'text', editable: true,
        content: 'Move me', layerIndex: 2, boundingBox: { x: 10, y: 10, width: 60, height: 12 }, sectionId: 'hero',
      },
      {
        id: 'badge', name: 'Verified badge', type: 'icon', editable: false,
        content: 'Seal', layerIndex: 3, boundingBox: { x: 80, y: 80, width: 10, height: 8 }, sectionId: 'hero',
      },
    ],
  },
}

function documentWithLocks() {
  return adaptBreakdownToDesignDocument(breakdown, {
    id: 'fixture-locks',
    createdAt: '2026-07-14T00:00:00.000Z',
  })
}

const movedBox = { x: 20, y: 30, width: 40, height: 10 }

describe('Editor document preparation', () => {
  it('leaves the adapter output locked, so the editor has something to relax', () => {
    const document = documentWithLocks()
    const headline = document.objects.find(object => object.id === 'headline')!

    expect(headline.constraints.lockPosition).toBe(true)
    expect(headline.constraints.lockSize).toBe(true)
    expect(headline.constraints.lockRotation).toBe(true)
    expect(headline.constraints.preserveLayerOrder).toBe(true)
  })

  it('relaxes measured-geometry locks on editable layers only', () => {
    const relaxed = prepareForEditing(documentWithLocks())
    const headline = relaxed.objects.find(object => object.id === 'headline')!
    const badge = relaxed.objects.find(object => object.id === 'badge')!

    expect(headline.constraints).toMatchObject({
      lockPosition: false,
      lockSize: false,
      lockRotation: false,
      preserveLayerOrder: false,
    })
    expect(badge.constraints).toMatchObject({
      lockPosition: true,
      lockSize: true,
      lockRotation: true,
      preserveLayerOrder: true,
    })
    expect(badge.protection.locked).toBe(true)
  })

  it('keeps the constraints that protect meaning, not placement', () => {
    const relaxed = prepareForEditing(documentWithLocks())
    const headline = relaxed.objects.find(object => object.id === 'headline')!

    expect(headline.constraints.lockAspectRatio).toBe(false)
    expect(headline.constraints.stayInsideCanvas).toBe(true)
    expect(headline.protection.protectedProperties).toContain('width')

    const icon = relaxed.objects.find(object => object.id === 'badge')!
    expect(icon.protection.protectedProperties).toContain('sourcePixels')
    expect(icon.constraints.lockAspectRatio).toBe(true)
    expect(icon.constraints.fit).toBe('contain')
  })

  it('lets a relaxed layer actually be dragged', () => {
    const relaxed = prepareForEditing(documentWithLocks())
    const moved = applyEditIntent(relaxed, {
      objectId: 'headline',
      property: 'bounds',
      value: movedBox,
      explicitGeometryChange: true,
    })

    expect(moved.violations).toEqual([])
    expect(moved.document.objects.find(object => object.id === 'headline')!.transform.bounds).toEqual(movedBox)
  })

  it('still snaps a locked layer back, which is the whole point of locking', () => {
    const relaxed = prepareForEditing(documentWithLocks())
    const moved = applyEditIntent(relaxed, {
      objectId: 'badge',
      property: 'bounds',
      value: movedBox,
      explicitGeometryChange: true,
    })

    expect(moved.violations.map(violation => violation.code)).toContain('object-locked')
    expect(moved.document.objects.find(object => object.id === 'badge')!.transform.bounds)
      .toEqual({ x: 80, y: 80, width: 10, height: 8 })
  })

  it('does not mutate the document it was given', () => {
    const document = documentWithLocks()
    prepareForEditing(document)

    expect(document.objects[0].constraints.lockPosition).toBe(true)
  })
})
