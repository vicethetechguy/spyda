import type { DesignEditIntent } from '../core/constraint-engine'
import type { DesignDocument, DesignObject, PercentBox } from '../core/design-document'
import { makeLayer, type NewLayerKind } from './editor-objects'

/**
 * The bridge between Spyda AI and the canvas.
 *
 * `describeCanvas` is what the model sees: layers as plain numbers, no
 * internals. `translateOperations` turns the model's answer back into edit
 * intents, and it is the only gate the answer passes through, so it trusts
 * nothing: unknown ids, locked layers, bad colours and wild numbers are dropped
 * or clamped, and the rest becomes one undoable step.
 */

export const ASSIST_FONTS = ['Space Grotesk', 'Montserrat', 'Inter', 'Poppins', 'Playfair Display', 'Bebas Neue', 'DM Sans', 'Outfit']

const round = (value: number) => Math.round(value * 10) / 10

export function describeCanvas(document: DesignDocument) {
  const layers = [...document.objects]
    .filter(object => !object.status.removed)
    .sort((left, right) => left.zIndex - right.zIndex)
    .map(object => {
      const bounds = object.transform.bounds
      return {
        id: object.id,
        name: object.name,
        kind: object.kind,
        ...(object.content.text ? { text: object.content.text } : {}),
        ...(bounds ? { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) } : {}),
        ...(object.style.fill ? { fill: object.style.fill } : {}),
        ...(object.style.stroke ? { stroke: object.style.stroke } : {}),
        ...(object.style.fontFamily ? { fontFamily: object.style.fontFamily } : {}),
        ...(object.style.fontSize ? { fontSize: object.style.fontSize } : {}),
        ...(object.style.fontWeight ? { fontWeight: object.style.fontWeight } : {}),
        ...(object.style.textAlign ? { textAlign: object.style.textAlign } : {}),
        ...(object.transform.opacity !== 1 ? { opacity: object.transform.opacity } : {}),
        ...(object.transform.rotation ? { rotation: object.transform.rotation } : {}),
        ...(object.content.assetRef ? { hasPicture: true } : {}),
        ...(!object.status.visible ? { hidden: true } : {}),
        ...(object.protection.locked ? { locked: true } : {}),
      }
    })
  return {
    canvas: { width: document.canvas.width || 1080, height: document.canvas.height || 1350 },
    layers,
  }
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i
const ALIGN = ['left', 'center', 'right', 'justify'] as const

function colour(value: unknown) {
  return typeof value === 'string' && COLOUR.test(value.trim()) ? value.trim() : undefined
}

function number(value: unknown, min: number, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined
}

function font(value: unknown) {
  if (typeof value !== 'string') return undefined
  return ASSIST_FONTS.find(name => name.toLowerCase() === value.trim().toLowerCase()) ?? undefined
}

function weight(value: unknown) {
  const parsed = Math.round(Number(value) / 100) * 100
  return parsed >= 100 && parsed <= 900 ? String(parsed) : undefined
}

/**
 * Bounds from a partial update. Models often give x as the centre of the box;
 * when the box would run off the right edge but fits as a centre, read it so.
 */
export function readBounds(set: Record<string, unknown>, current: PercentBox | null): PercentBox | null {
  const keys = ['x', 'y', 'width', 'height'] as const
  if (!keys.some(key => set[key] !== undefined)) return null
  const base = current ?? { x: 10, y: 10, width: 80, height: 10 }
  const width = number(set.width, 1, 100) ?? base.width
  const height = number(set.height, 1, 100) ?? base.height
  let x = number(set.x, -50, 150) ?? base.x
  let y = number(set.y, -50, 150) ?? base.y
  if (set.x !== undefined && x + width > 100.5 && x - width / 2 >= -0.5) x -= width / 2
  if (set.y !== undefined && y + height > 100.5 && y - height / 2 >= -0.5) y -= height / 2
  return {
    x: round(Math.min(100 - Math.min(width, 100), Math.max(0, x))),
    y: round(Math.min(100 - Math.min(height, 100), Math.max(0, y))),
    width: round(width),
    height: round(height),
  }
}

function styleIntents(object: DesignObject, set: Record<string, unknown>) {
  const intents: DesignEditIntent[] = []
  const allowed = (property: DesignEditIntent['property']) => object.protection.editableProperties.includes(property)
  const push = (property: DesignEditIntent['property'], value: unknown) => {
    if (value !== undefined && allowed(property)) intents.push({ objectId: object.id, property, value })
  }
  if (typeof set.text === 'string' && set.text.trim()) push('text', set.text.slice(0, 600))
  push('fill', colour(set.fill))
  push('stroke', colour(set.stroke))
  push('fontFamily', font(set.fontFamily))
  push('fontSize', number(set.fontSize, 6, 600))
  push('fontWeight', weight(set.fontWeight))
  push('textAlign', ALIGN.find(align => align === set.textAlign))
  push('opacity', number(set.opacity, 0, 1))

  const bounds = readBounds(set, object.transform.bounds)
  if (bounds && !object.constraints.lockPosition) intents.push({ objectId: object.id, property: 'bounds', value: bounds, explicitGeometryChange: true })
  const rotation = number(set.rotation, -360, 360)
  if (rotation !== undefined && !object.constraints.lockRotation) intents.push({ objectId: object.id, property: 'rotation', value: rotation, explicitGeometryChange: true })
  return intents
}

export type TranslatedOperations = { intents: DesignEditIntent[]; skipped: number; created: number }

export function translateOperations(document: DesignDocument, operations: unknown[]): TranslatedOperations {
  const intents: DesignEditIntent[] = []
  let skipped = 0
  let created = 0
  // Created layers stack in the order given; ids of new layers can be used later in the same answer.
  let working = document

  for (const raw of operations) {
    const operation = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const set = (operation.set && typeof operation.set === 'object' ? operation.set : {}) as Record<string, unknown>
    const target = typeof operation.id === 'string' ? working.objects.find(object => object.id === operation.id && !object.status.removed) : undefined

    if (operation.op === 'background') {
      const background = working.objects.find(object => object.kind === 'background' && !object.status.removed)
      const fill = colour(operation.fill ?? set.fill)
      if (background && fill && !background.protection.locked && background.protection.editableProperties.includes('fill')) {
        intents.push({ objectId: background.id, property: 'fill', value: fill })
      } else skipped += 1
      continue
    }

    if (operation.op === 'create') {
      const kind: NewLayerKind = operation.kind === 'rect' || operation.kind === 'circle' ? operation.kind : 'text'
      const bounds = readBounds(set, null) ?? undefined
      const layer = makeLayer(working, kind, {
        name: typeof operation.name === 'string' ? operation.name.slice(0, 60) : undefined,
        bounds,
        text: typeof set.text === 'string' && set.text.trim() ? set.text.slice(0, 600) : undefined,
        fill: colour(set.fill),
        stroke: colour(set.stroke),
        fontFamily: font(set.fontFamily),
        fontSize: number(set.fontSize, 6, 600),
        fontWeight: weight(set.fontWeight),
        textAlign: ALIGN.find(align => align === set.textAlign),
        opacity: number(set.opacity, 0, 1),
      })
      const rotation = number(set.rotation, -360, 360)
      if (rotation) layer.transform.rotation = rotation
      intents.push({ objectId: layer.id, property: 'create', value: layer })
      working = { ...working, objects: [...working.objects, layer] }
      created += 1
      continue
    }

    if (!target || target.protection.locked) {
      skipped += 1
      continue
    }

    if (operation.op === 'delete') {
      if (target.kind === 'background') skipped += 1
      else intents.push({ objectId: target.id, property: 'removed', value: true })
      continue
    }

    if (operation.op === 'update') {
      const next = styleIntents(target, set)
      if (next.length) intents.push(...next)
      else skipped += 1
      continue
    }

    skipped += 1
  }

  return { intents, skipped, created }
}
