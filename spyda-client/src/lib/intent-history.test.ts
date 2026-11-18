import { describe, expect, it } from 'vitest'
import { adaptBreakdownToDesignDocument, type DesignDocument } from '../core/design-document'
import {
  canRedo,
  canUndo,
  commitIntent,
  commitStep,
  createHistory,
  currentDocument,
  documentAt,
  redo,
  undo,
} from './intent-history'

function flyerDocument(): DesignDocument {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1080, height: 1350, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
      sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: {},
      editableComponents: [
        {
          id: 'headline',
          name: 'Headline',
          type: 'text',
          editable: true,
          content: 'Buy one get one',
          style: 'Large centered',
          layerIndex: 8,
          boundingBox: { x: 10, y: 20, width: 80, height: 12 },
          sectionId: 'main',
        },
        {
          id: 'product-photo',
          name: 'Product photo',
          type: 'image',
          editable: true,
          content: 'Bottle',
          style: 'Cut-out',
          layerIndex: 3,
          boundingBox: { x: 22, y: 44, width: 36, height: 28 },
          sectionId: 'main',
        },
      ],
    },
  }, { id: 'fixture-history', provider: 'test-provider', createdAt: '2026-07-14T00:00:00.000Z' })
}

function objectById(document: DesignDocument, id: string) {
  const object = document.objects.find(candidate => candidate.id === id)
  if (!object) throw new Error(`Missing object ${id}`)
  return object
}

describe('Intent history', () => {
  it('replays the log into the same document every time', () => {
    const base = flyerDocument()
    let history = createHistory(base)

    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Half price' }).history
    history = commitIntent(history, { objectId: 'headline', property: 'fill', value: '#00FF88' }).history
    history = commitIntent(history, {
      objectId: 'product-photo',
      property: 'bounds',
      value: { x: 30, y: 50, width: 30, height: 20 },
      explicitGeometryChange: true,
    }).history

    const first = documentAt(history, 3)
    const second = documentAt(history, 3)
    expect(first).toEqual(second)
    expect(objectById(first, 'headline').content.text).toBe('Half price')
    expect(objectById(first, 'headline').style.fill).toBe('#00FF88')
    expect(objectById(first, 'product-photo').transform.bounds).toEqual({ x: 30, y: 50, width: 30, height: 20 })

    // the base document is never mutated by the log
    expect(objectById(base, 'headline').content.text).toBe('Buy one get one')
  })

  it('undoes and redoes by moving the cursor', () => {
    const base = flyerDocument()
    let history = createHistory(base)
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Step one' }).history
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Step two' }).history

    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Step two')

    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Step one')
    expect(canRedo(history)).toBe(true)

    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Buy one get one')
    expect(canUndo(history)).toBe(false)

    history = redo(history)
    history = redo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Step two')
  })

  it('drops the abandoned tail when a new edit follows an undo', () => {
    const base = flyerDocument()
    let history = createHistory(base)
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'First' }).history
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Second' }).history
    history = undo(history)
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Replacement' }).history

    expect(history.steps).toHaveLength(2)
    expect(canRedo(history)).toBe(false)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Replacement')
    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('First')
  })

  it('refuses to record an intent the constraints reject', () => {
    const base = flyerDocument()
    objectById(base, 'product-photo').protection.locked = true
    const history = createHistory(base)

    const result = commitIntent(history, { objectId: 'product-photo', property: 'opacity', value: 0.2 })

    expect(result.recorded).toBe(false)
    expect(result.violations[0].code).toBe('object-locked')
    // a no-op step would make undo look broken
    expect(result.history).toBe(history)
    expect(result.history.steps).toHaveLength(0)
    expect(canUndo(result.history)).toBe(false)
  })

  it('refuses an implicit geometry change', () => {
    const history = createHistory(flyerDocument())
    const result = commitIntent(history, {
      objectId: 'product-photo',
      property: 'bounds',
      value: { x: 1, y: 1, width: 10, height: 10 },
    })

    expect(result.recorded).toBe(false)
    expect(result.violations[0].code).toBe('geometry-not-explicit')
  })

  it('folds the oldest intent into the base at the depth limit instead of losing it', () => {
    const base = flyerDocument()
    let history = createHistory(base, 2)
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'One' }).history
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Two' }).history
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Three' }).history

    expect(history.steps).toHaveLength(2)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Three')
    // the effect of the folded intent survives, it is just no longer a step
    expect(objectById(history.base, 'headline').content.text).toBe('One')
    history = undo(history)
    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('One')
  })

  it('reorders and duplicates through the same vocabulary', () => {
    const base = flyerDocument()
    let history = createHistory(base)

    const reorder = commitIntent(history, { objectId: 'product-photo', property: 'zIndex', value: 12 })
    expect(reorder.recorded).toBe(true)
    history = reorder.history
    expect(objectById(currentDocument(history), 'product-photo').zIndex).toBe(12)

    const duplicate = commitIntent(history, {
      objectId: 'headline',
      property: 'duplicate',
      value: { id: 'headline-copy', name: 'Headline copy' },
    })
    expect(duplicate.recorded).toBe(true)
    history = duplicate.history

    const document = currentDocument(history)
    expect(document.objects).toHaveLength(3)
    expect(objectById(document, 'headline-copy').name).toBe('Headline copy')
    expect(objectById(document, 'headline-copy').content.text).toBe('Buy one get one')
    expect(document.sections[0].objectIds).toContain('headline-copy')

    history = undo(history)
    expect(currentDocument(history).objects).toHaveLength(2)
  })

  it('keeps the cached tip identical to a full replay at every cursor', () => {
    let history = createHistory(flyerDocument())
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'One' }).history
    history = commitIntent(history, { objectId: 'product-photo', property: 'opacity', value: 0.5 }).history
    history = commitIntent(history, { objectId: 'headline', property: 'fill', value: '#123456' }).history

    // the fast path must agree with the slow one, or undo would jump
    expect(currentDocument(history)).toEqual(documentAt(history, history.cursor))

    history = undo(history)
    expect(currentDocument(history)).toEqual(documentAt(history, history.cursor))

    history = redo(history)
    expect(currentDocument(history)).toEqual(documentAt(history, history.cursor))

    expect(documentAt(history, 0)).toEqual(history.base)
  })

  it('swaps two layers as a single undoable step', () => {
    const base = flyerDocument()
    const headlineZ = objectById(base, 'headline').zIndex
    const photoZ = objectById(base, 'product-photo').zIndex
    let history = createHistory(base)

    const swap = commitStep(history, [
      { objectId: 'headline', property: 'zIndex', value: photoZ },
      { objectId: 'product-photo', property: 'zIndex', value: headlineZ },
    ], 'Reorder layers')

    expect(swap.recorded).toBe(true)
    history = swap.history
    expect(history.steps).toHaveLength(1)
    expect(history.steps[0].label).toBe('Reorder layers')
    expect(objectById(currentDocument(history), 'headline').zIndex).toBe(photoZ)
    expect(objectById(currentDocument(history), 'product-photo').zIndex).toBe(headlineZ)

    // one press of undo has to reverse both halves of the swap
    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').zIndex).toBe(headlineZ)
    expect(objectById(currentDocument(history), 'product-photo').zIndex).toBe(photoZ)
  })

  it('folds a burst of typing into one undoable step', () => {
    let history = createHistory(flyerDocument())
    const key = { coalesceKey: 'headline:text' }

    // a word arrives one character at a time
    for (const [index, value] of ['H', 'HE', 'HEL', 'HELL', 'HELLO'].entries()) {
      history = commitIntent(history, { objectId: 'headline', property: 'text', value }, { ...key, now: 1000 + index * 60 }).history
    }

    expect(history.steps).toHaveLength(1)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('HELLO')

    // so the first undo goes back to the text before the word
    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('Buy one get one')

    // and the fold replays to the same place as the cached tip
    history = redo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('HELLO')
    expect(currentDocument(history)).toEqual(documentAt(history, history.cursor))
  })

  it('starts a new step when the edit stream pauses', () => {
    let history = createHistory(flyerDocument())

    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'First word' }, { coalesceKey: 'headline:text', now: 1000 }).history
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'First word again' }, { coalesceKey: 'headline:text', now: 5000 }).history

    expect(history.steps).toHaveLength(2)
    history = undo(history)
    expect(objectById(currentDocument(history), 'headline').content.text).toBe('First word')
  })

  it('keeps separate streams and structural edits apart', () => {
    let history = createHistory(flyerDocument())

    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Title' }, { coalesceKey: 'headline:text', now: 1000 }).history
    history = commitIntent(history, { objectId: 'product-photo', property: 'opacity', value: 0.5 }, { coalesceKey: 'product-photo:opacity', now: 1010 }).history
    expect(history.steps).toHaveLength(2)

    // two duplicates are two layers, however fast they arrive
    history = commitIntent(history, { objectId: 'headline', property: 'duplicate', value: { id: 'copy-a' } }, { now: 1020 }).history
    history = commitIntent(history, { objectId: 'headline', property: 'duplicate', value: { id: 'copy-b' } }, { now: 1030 }).history
    expect(history.steps).toHaveLength(4)
    expect(currentDocument(history).objects).toHaveLength(4)
  })

  it('does not fold into a step that undo has walked back over', () => {
    let history = createHistory(flyerDocument())
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Committed' }, { coalesceKey: 'headline:text', now: 1000 }).history
    history = undo(history)

    // folding here would rewrite a step the cursor has already left behind
    history = commitIntent(history, { objectId: 'headline', property: 'text', value: 'Fresh' }, { coalesceKey: 'headline:text', now: 1010 }).history
    expect(history.steps).toHaveLength(1)
    expect(history.steps[0].intents[0].value).toBe('Fresh')
  })
})
