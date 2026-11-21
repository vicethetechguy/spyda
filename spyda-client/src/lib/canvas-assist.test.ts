import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument } from '../core/design-document'
import { applyDesignEdits } from '../core/constraint-engine'
import { blankBreakdown, CANVAS_PRESETS, makeLayer } from './editor-objects'
import { describeCanvas, readBounds, translateOperations } from './canvas-assist'
import { commitStep, createHistory, currentDocument, redo, undo } from './intent-history'

function blank() {
  return adaptBreakdownToDesignDocument(blankBreakdown(CANVAS_PRESETS[0]), { id: 'blank' })
}

describe('canvas assist', () => {
  it('describes a blank canvas as one editable background', () => {
    const description = describeCanvas(blank())
    expect(description.canvas).toEqual({ width: 1080, height: 1350 })
    expect(description.layers).toEqual([expect.objectContaining({ id: 'background', kind: 'background', fill: '#ffffff' })])
  })

  it('turns a laid-out design into layers in one step', () => {
    const document = blank()
    const { intents, created, skipped } = translateOperations(document, [
      { op: 'background', fill: '#FFF5E6' },
      { op: 'create', kind: 'rect', name: 'Button', set: { x: 30, y: 70, width: 40, height: 10, fill: '#D2691E' } },
      { op: 'create', kind: 'text', name: 'Headline', set: { text: 'Mama Tee Bakery', x: 6, y: 12, width: 88, height: 10, fontFamily: 'bebas neue', fontSize: 96, fontWeight: 700 } },
    ])
    expect(created).toBe(2)
    expect(skipped).toBe(0)

    const result = applyDesignEdits(document, intents)
    expect(result.violations).toEqual([])
    const headline = result.document.objects.find(object => object.name === 'Headline')!
    expect(headline.content.text).toBe('Mama Tee Bakery')
    expect(headline.style).toMatchObject({ fontFamily: 'Bebas Neue', fontSize: 96, fontWeight: '700' })
    expect(result.document.objects.find(object => object.kind === 'background')?.style.fill).toBe('#FFF5E6')
    // shapes first, text last, as given
    expect(headline.zIndex).toBeGreaterThan(result.document.objects.find(object => object.name === 'Button')!.zIndex)
  })

  it('reads a centred x as a centre and keeps boxes on the canvas', () => {
    expect(readBounds({ x: 50, y: 18, width: 88, height: 10 }, null)).toEqual({ x: 6, y: 18, width: 88, height: 10 })
    expect(readBounds({ x: -40, y: 200, width: 30, height: 20 }, null)).toEqual({ x: 0, y: 80, width: 30, height: 20 })
    expect(readBounds({ text: 'no geometry' }, null)).toBeNull()
  })

  it('drops what it cannot trust', () => {
    const document = blank()
    const layer = makeLayer(document, 'text', { id: 'headline' })
    const withHeadline = applyDesignEdits(document, [{ objectId: 'headline', property: 'create', value: layer }]).document
    const { intents, skipped } = translateOperations(withHeadline, [
      { op: 'update', id: 'nope', set: { fill: '#000' } },
      { op: 'update', id: 'headline', set: { fill: 'javascript:alert(1)', fontFamily: 'Comic Sans' } },
      { op: 'delete', id: 'background' },
      { op: 'explode' },
    ])
    expect(intents).toEqual([])
    expect(skipped).toBe(4)
  })

  it('moves and restyles an existing layer', () => {
    const document = blank()
    const layer = makeLayer(document, 'text', { id: 'headline' })
    const withHeadline = applyDesignEdits(document, [{ objectId: 'headline', property: 'create', value: layer }]).document
    const { intents } = translateOperations(withHeadline, [{ op: 'update', id: 'headline', set: { y: 5, fill: '#111111', fontSize: 120 } }])
    const result = applyDesignEdits(withHeadline, intents)
    expect(result.violations).toEqual([])
    const updated = result.document.objects.find(object => object.id === 'headline')!
    expect(updated.transform.bounds?.y).toBe(5)
    expect(updated.style).toMatchObject({ fill: '#111111', fontSize: 120 })
  })

  it('undoes a whole AI layout in one step and redoes it exactly', () => {
    const document = blank()
    const { intents } = translateOperations(document, [
      { op: 'create', kind: 'rect', set: { x: 10, y: 10, width: 80, height: 20 } },
      { op: 'create', kind: 'text', set: { text: 'Hello', x: 10, y: 40, width: 80, height: 10 } },
    ])
    const step = commitStep(createHistory(document), intents, { label: 'Spyda AI: layout' })
    expect(step.recorded).toBe(true)
    expect(currentDocument(step.history).objects).toHaveLength(3)
    const undone = undo(step.history)
    expect(currentDocument(undone).objects).toHaveLength(1)
    expect(currentDocument(redo(undone))).toEqual(currentDocument(step.history))
  })
})
