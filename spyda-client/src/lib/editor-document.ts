import type { DesignDocument } from '../core/design-document.js'

/**
 * Makes an analysed flyer movable by the person editing it.
 *
 * The adapter locks measured geometry on every object, because its other
 * consumer is the constraint engine deciding whether a rewrite may displace a
 * layer that the analyser placed. In the editor the person *is* the explicit
 * edit, so leaving those locks on would turn every drag into a
 * `bounds-changed` violation and snap the layer back - the canvas would look
 * broken rather than protected.
 *
 * Content protection is deliberately untouched: an object the analysis marked
 * uneditable stays locked, keeps its handles hidden, and still refuses edits.
 * That is the difference between "the model placed this" and "you may not touch
 * this", and only the second one belongs to the editor.
 */
export function prepareForEditing(document: DesignDocument): DesignDocument {
  const next = structuredClone(document)
  for (const object of next.objects) {
    if (object.protection.locked) continue
    object.constraints.lockPosition = false
    object.constraints.lockSize = false
    object.constraints.lockRotation = false
    object.constraints.preserveLayerOrder = false
    // Opacity is presentation, not identity, so it is available on every kind -
    // the analysis only lists it for shapes because shapes are all it expects a
    // rewrite to dim.
    if (!object.protection.editableProperties.includes('opacity')) {
      object.protection.editableProperties.push('opacity')
    }
  }
  return next
}
