import { DesignObjectSchema, parseDesignDocument, type DesignDocument, type DesignObject } from './design-document.js'
import type { LayoutIntelligenceModel } from './layout-intelligence.js'

export type ConstraintViolation = {
  code: string
  severity: 'error' | 'warning'
  objectId: string | null
  message: string
}

export type ConstraintProfile = {
  schemaVersion: '1.0'
  canvas: { width: number | null; height: number | null; lockSize: true }
  objects: Record<string, {
    lockPosition: boolean
    lockSize: boolean
    lockAspectRatio: boolean
    lockRotation: boolean
    preserveLayerOrder: boolean
    stayInsideCanvas: boolean
    protectedProperties: string[]
    originalBounds: DesignObject['transform']['bounds']
    alignmentPeers: string[]
  }>
}

/**
 * The single edit vocabulary. The canvas, the typed-instruction door, the undo
 * log and the animation sampler all speak this and nothing else.
 *
 * `bounds`, `rotation`, `zIndex` and `duplicate` change structure, so they are
 * allowed even when a layer protects its measured geometry - they still report
 * violations for locked layers.
 */
export type DesignEditIntent = {
  objectId: string
  property:
    | 'text' | 'assetRef' | 'fill' | 'stroke' | 'opacity'
    | 'removed' | 'visible' | 'bounds' | 'rotation'
    | 'fontFamily' | 'fontSize' | 'fontWeight' | 'textAlign'
    | 'zIndex' | 'duplicate' | 'create'
    | 'borderRadius' | 'strokeWidth' | 'letterSpacing' | 'lineHeight'
    | 'flipX' | 'flipY' | 'lockAspectRatio'
  value: unknown
  explicitGeometryChange?: boolean
}

/** Intents that are not property edits on `protection.editableProperties`. */
const STRUCTURAL_PROPERTIES: ReadonlyArray<DesignEditIntent['property']> = [
  'removed', 'visible', 'bounds', 'rotation', 'zIndex', 'duplicate', 'create',
  // Orientation and the proportion lock are transform settings, like rotation.
  'flipX', 'flipY', 'lockAspectRatio',
]

type DuplicateSpec = { id: string; name?: string; zIndex?: number }

function readDuplicateSpec(value: unknown): DuplicateSpec | null {
  if (!value || typeof value !== 'object') return null
  const spec = value as Record<string, unknown>
  if (typeof spec.id !== 'string' || !spec.id) return null
  return {
    id: spec.id,
    name: typeof spec.name === 'string' ? spec.name : undefined,
    zIndex: typeof spec.zIndex === 'number' ? Math.round(spec.zIndex) : undefined,
  }
}

function cloneDocument(document: DesignDocument) {
  return structuredClone(document)
}

function sameBounds(left: DesignObject['transform']['bounds'], right: DesignObject['transform']['bounds'], tolerance = 0.001) {
  if (!left || !right) return left === right
  return Math.abs(left.x - right.x) <= tolerance
    && Math.abs(left.y - right.y) <= tolerance
    && Math.abs(left.width - right.width) <= tolerance
    && Math.abs(left.height - right.height) <= tolerance
}

const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const

function readTextAlign(value: unknown): DesignObject['style']['textAlign'] {
  return TEXT_ALIGNMENTS.includes(value as typeof TEXT_ALIGNMENTS[number])
    ? value as DesignObject['style']['textAlign']
    : null
}

export function buildConstraintProfile(document: DesignDocument, layout: LayoutIntelligenceModel): ConstraintProfile {
  return {
    schemaVersion: '1.0',
    canvas: { width: document.canvas.width, height: document.canvas.height, lockSize: true },
    objects: Object.fromEntries(document.objects.map(object => [object.id, {
      lockPosition: object.constraints.lockPosition,
      lockSize: object.constraints.lockSize,
      lockAspectRatio: object.constraints.lockAspectRatio,
      lockRotation: object.constraints.lockRotation,
      preserveLayerOrder: object.constraints.preserveLayerOrder,
      stayInsideCanvas: object.constraints.stayInsideCanvas,
      protectedProperties: object.protection.protectedProperties,
      originalBounds: layout.measurements[object.id]?.bounds || object.transform.bounds,
      alignmentPeers: layout.measurements[object.id]?.alignmentPeers || [],
    }])),
  }
}

export function applyDesignEdits(referenceInput: DesignDocument, intents: DesignEditIntent[]) {
  const reference = parseDesignDocument(referenceInput)
  const candidate = cloneDocument(reference)
  const violations: ConstraintViolation[] = []

  for (const intent of intents) {
    // A new layer: the whole object travels in the intent, so replaying the log
    // rebuilds it exactly and undo removes it.
    if (intent.property === 'create') {
      const parsed = DesignObjectSchema.safeParse(intent.value)
      if (!parsed.success || parsed.data.id !== intent.objectId) {
        violations.push({ code: 'create-invalid', severity: 'error', objectId: intent.objectId, message: 'That new layer is not a valid design object.' })
        continue
      }
      if (candidate.objects.some(item => item.id === parsed.data.id)) {
        violations.push({ code: 'create-id-taken', severity: 'error', objectId: intent.objectId, message: `Object id ${parsed.data.id} is already used.` })
        continue
      }
      const created = structuredClone(parsed.data)
      const section = candidate.sections.find(item => item.id === created.sectionId) ?? candidate.sections[0]
      if (section) {
        created.sectionId = section.id
        if (!section.objectIds.includes(created.id)) section.objectIds.push(created.id)
      }
      candidate.objects.push(created)
      continue
    }

    const object = candidate.objects.find(item => item.id === intent.objectId)
    if (!object) {
      violations.push({ code: 'unknown-object', severity: 'error', objectId: intent.objectId, message: `Unknown design object: ${intent.objectId}` })
      continue
    }
    if (object.protection.locked) {
      violations.push({ code: 'object-locked', severity: 'error', objectId: object.id, message: `${object.name} is protected and cannot be edited.` })
      continue
    }
    if ((intent.property === 'bounds' || intent.property === 'rotation') && !intent.explicitGeometryChange) {
      violations.push({ code: 'geometry-not-explicit', severity: 'error', objectId: object.id, message: `${object.name} geometry can change only through an explicit geometry edit.` })
      continue
    }
    if (!object.protection.editableProperties.includes(intent.property) && !STRUCTURAL_PROPERTIES.includes(intent.property)) {
      violations.push({ code: 'property-protected', severity: 'error', objectId: object.id, message: `${intent.property} is not editable on ${object.name}.` })
      continue
    }

    if (intent.property === 'text') object.content.text = String(intent.value ?? '')
    if (intent.property === 'assetRef') object.content.assetRef = String(intent.value ?? '') || null
    if (intent.property === 'fill') object.style.fill = String(intent.value ?? '') || null
    if (intent.property === 'stroke') object.style.stroke = String(intent.value ?? '') || null
    if (intent.property === 'opacity') object.transform.opacity = Math.min(1, Math.max(0, Number(intent.value)))
    if (intent.property === 'removed') object.status.removed = Boolean(intent.value)
    // Hiding is reversible from the layer list; removing takes the layer out of it.
    if (intent.property === 'visible') object.status.visible = Boolean(intent.value)
    if (intent.property === 'bounds' && intent.explicitGeometryChange) object.transform.bounds = intent.value as DesignObject['transform']['bounds']
    if (intent.property === 'rotation' && intent.explicitGeometryChange) object.transform.rotation = Number(intent.value)
    if (intent.property === 'fontFamily') object.style.fontFamily = String(intent.value ?? '') || null
    if (intent.property === 'fontSize') object.style.fontSize = Number(intent.value) > 0 ? Number(intent.value) : null
    if (intent.property === 'fontWeight') object.style.fontWeight = String(intent.value ?? '') || null
    if (intent.property === 'textAlign') object.style.textAlign = readTextAlign(intent.value)
    if (intent.property === 'zIndex') object.zIndex = Math.round(Number(intent.value))
    if (intent.property === 'borderRadius') object.style.borderRadius = Math.max(0, Number(intent.value) || 0)
    if (intent.property === 'strokeWidth') object.style.strokeWidth = Math.max(0, Number(intent.value) || 0)
    if (intent.property === 'letterSpacing') object.style.letterSpacing = Number.isFinite(Number(intent.value)) ? Number(intent.value) : null
    if (intent.property === 'lineHeight') object.style.lineHeight = Number(intent.value) > 0 ? Number(intent.value) : null
    if (intent.property === 'flipX') object.transform.flipX = Boolean(intent.value)
    if (intent.property === 'flipY') object.transform.flipY = Boolean(intent.value)
    if (intent.property === 'lockAspectRatio') object.constraints.lockAspectRatio = Boolean(intent.value)

    if (intent.property === 'duplicate') {
      const spec = readDuplicateSpec(intent.value)
      if (!spec) {
        violations.push({ code: 'duplicate-needs-id', severity: 'error', objectId: object.id, message: 'A duplicate needs a new object id.' })
        continue
      }
      if (candidate.objects.some(item => item.id === spec.id)) {
        violations.push({ code: 'duplicate-id-taken', severity: 'error', objectId: object.id, message: `Object id ${spec.id} is already used.` })
        continue
      }
      const copy = structuredClone(object)
      copy.id = spec.id
      copy.name = spec.name || `${object.name} copy`
      copy.zIndex = spec.zIndex ?? object.zIndex + 1
      copy.status.removed = false
      copy.status.consumed = false
      candidate.objects.push(copy)
      const section = candidate.sections.find(item => item.id === copy.sectionId)
      if (section && !section.objectIds.includes(copy.id)) section.objectIds.push(copy.id)
    }
  }

  return { document: candidate, violations }
}

export function applyEditIntent(document: DesignDocument, intent: DesignEditIntent) {
  return applyDesignEdits(document, [intent])
}

export function enforceDesignConstraints(referenceInput: DesignDocument, candidateInput: DesignDocument) {
  const reference = parseDesignDocument(referenceInput)
  const candidate = cloneDocument(parseDesignDocument(candidateInput))
  const violations: ConstraintViolation[] = []

  if (reference.canvas.width !== candidate.canvas.width || reference.canvas.height !== candidate.canvas.height) {
    violations.push({ code: 'canvas-size-changed', severity: 'error', objectId: null, message: 'Canvas size was restored to the reference dimensions.' })
    candidate.canvas.width = reference.canvas.width
    candidate.canvas.height = reference.canvas.height
    candidate.canvas.aspectRatio = reference.canvas.aspectRatio
  }

  reference.objects.forEach(referenceObject => {
    const index = candidate.objects.findIndex(object => object.id === referenceObject.id)
    if (index === -1) {
      violations.push({ code: 'protected-object-missing', severity: 'error', objectId: referenceObject.id, message: `${referenceObject.name} was restored because it disappeared from the candidate design.` })
      candidate.objects.push(cloneDocument({ ...reference, objects: [referenceObject] }).objects[0])
      return
    }
    const object = candidate.objects[index]
    if (referenceObject.protection.locked) {
      if (JSON.stringify(object) !== JSON.stringify(referenceObject)) {
        violations.push({ code: 'locked-object-changed', severity: 'error', objectId: object.id, message: `${object.name} was restored because it is locked.` })
      }
      candidate.objects[index] = structuredClone(referenceObject)
      return
    }
    if ((referenceObject.constraints.lockPosition || referenceObject.constraints.lockSize) && !sameBounds(referenceObject.transform.bounds, object.transform.bounds)) {
      violations.push({ code: 'bounds-changed', severity: 'error', objectId: object.id, message: `${object.name} was returned to its measured position and size.` })
      object.transform.bounds = structuredClone(referenceObject.transform.bounds)
    }
    if (referenceObject.constraints.lockRotation && object.transform.rotation !== referenceObject.transform.rotation) {
      violations.push({ code: 'rotation-changed', severity: 'error', objectId: object.id, message: `${object.name} rotation was restored.` })
      object.transform.rotation = referenceObject.transform.rotation
    }
    if (referenceObject.constraints.preserveLayerOrder && object.zIndex !== referenceObject.zIndex) {
      violations.push({ code: 'layer-order-changed', severity: 'error', objectId: object.id, message: `${object.name} layer order was restored.` })
      object.zIndex = referenceObject.zIndex
    }
    if (referenceObject.protection.protectedProperties.includes('intrinsicColors') && object.content.assetRef === referenceObject.content.assetRef) {
      object.style.fill = referenceObject.style.fill
      object.style.stroke = referenceObject.style.stroke
    }
  })

  return { document: parseDesignDocument(candidate), violations }
}
