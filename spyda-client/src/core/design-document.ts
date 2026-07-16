import { z } from 'zod'

export const DESIGN_DOCUMENT_VERSION = '2.0' as const

const PercentBoxSchema = z.object({
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  width: z.number().finite().positive().max(100),
  height: z.number().finite().positive().max(100),
}).strict().superRefine((box, context) => {
  if (box.x + box.width > 100.001) {
    context.addIssue({ code: 'custom', message: 'Box extends beyond the right canvas edge.' })
  }
  if (box.y + box.height > 100.001) {
    context.addIssue({ code: 'custom', message: 'Box extends beyond the bottom canvas edge.' })
  }
})

const CanvasSchema = z.object({
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  unit: z.literal('px'),
  aspectRatio: z.string().min(1),
  orientation: z.string().min(1),
  colorSpace: z.string().min(1),
  backgroundColor: z.string().nullable(),
}).strict()

const SectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bounds: PercentBoxSchema.nullable(),
  zIndex: z.number().int(),
  objectIds: z.array(z.string().min(1)),
  legacyBounds: z.string().nullable(),
}).strict()

export const DesignObjectKindSchema = z.enum([
  'background',
  'text',
  'image',
  'logo',
  'icon',
  'shape',
  'group',
  'qr-code',
  'action',
  'decor',
  'style',
  'color',
  'unknown',
])

const ObjectTransformSchema = z.object({
  bounds: PercentBoxSchema.nullable(),
  rotation: z.number().finite(),
  opacity: z.number().finite().min(0).max(1),
  coordinateSpace: z.literal('normalized-percent'),
}).strict()

const ObjectContentSchema = z.object({
  text: z.string().nullable(),
  description: z.string(),
  assetRef: z.string().nullable(),
  altText: z.string().nullable(),
}).strict()

const ObjectStyleSchema = z.object({
  description: z.string(),
  fill: z.string().nullable(),
  stroke: z.string().nullable(),
  fontFamily: z.string().nullable(),
  fontSize: z.number().positive().nullable(),
  fontWeight: z.string().nullable(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).nullable(),
  lineHeight: z.number().positive().nullable(),
  letterSpacing: z.number().finite().nullable(),
  borderRadius: z.number().min(0).nullable(),
  effects: z.array(z.string()),
}).strict()

const ObjectConstraintsSchema = z.object({
  lockPosition: z.boolean(),
  lockSize: z.boolean(),
  lockAspectRatio: z.boolean(),
  lockRotation: z.boolean(),
  preserveLayerOrder: z.boolean(),
  stayInsideCanvas: z.boolean(),
  fit: z.enum(['contain', 'cover', 'fill', 'auto']),
}).strict()

const ObjectProtectionSchema = z.object({
  locked: z.boolean(),
  editableProperties: z.array(z.string()),
  protectedProperties: z.array(z.string()),
}).strict()

const ObjectRelationshipsSchema = z.object({
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  anchoredToIds: z.array(z.string()),
  groupId: z.string().nullable(),
}).strict()

const ObjectSourceSchema = z.object({
  provider: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(z.string()),
}).strict()

const ObjectStatusSchema = z.object({
  visible: z.boolean(),
  removed: z.boolean(),
  consumed: z.boolean(),
}).strict()

const DesignObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: DesignObjectKindSchema,
  sectionId: z.string().min(1),
  zIndex: z.number().int(),
  transform: ObjectTransformSchema,
  content: ObjectContentSchema,
  style: ObjectStyleSchema,
  constraints: ObjectConstraintsSchema,
  protection: ObjectProtectionSchema,
  relationships: ObjectRelationshipsSchema,
  source: ObjectSourceSchema,
  status: ObjectStatusSchema,
  legacy: z.record(z.string(), z.unknown()),
}).strict()

const StyleTokensSchema = z.object({
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }).strict(),
  typography: z.object({
    headingFont: z.string(),
    bodyFont: z.string(),
  }).strict(),
  spacing: z.string(),
  shadows: z.string(),
  gradients: z.string(),
  effects: z.string(),
  borderRadius: z.string(),
  lighting: z.string(),
  visualStyle: z.string(),
}).strict()

const AnalysisSchema = z.object({
  provider: z.string().min(1),
  createdAt: z.string().datetime(),
  confidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string()),
  sourceSchema: z.string().min(1),
}).strict()

export const DesignDocumentSchema = z.object({
  schemaVersion: z.literal(DESIGN_DOCUMENT_VERSION),
  id: z.string().min(1),
  sourceAsset: z.object({
    fileName: z.string().nullable(),
    mimeType: z.string().nullable(),
  }).strict(),
  canvas: CanvasSchema,
  sections: z.array(SectionSchema).min(1),
  objects: z.array(DesignObjectSchema),
  styleTokens: StyleTokensSchema,
  analysis: AnalysisSchema,
}).strict().superRefine((document, context) => {
  const sectionIds = new Set<string>()
  const objectIds = new Set<string>()

  document.sections.forEach((section, index) => {
    if (sectionIds.has(section.id)) {
      context.addIssue({ code: 'custom', path: ['sections', index, 'id'], message: `Duplicate section id: ${section.id}` })
    }
    sectionIds.add(section.id)
  })

  document.objects.forEach((object, index) => {
    if (objectIds.has(object.id)) {
      context.addIssue({ code: 'custom', path: ['objects', index, 'id'], message: `Duplicate object id: ${object.id}` })
    }
    objectIds.add(object.id)
    if (!sectionIds.has(object.sectionId)) {
      context.addIssue({ code: 'custom', path: ['objects', index, 'sectionId'], message: `Unknown section id: ${object.sectionId}` })
    }
  })

  document.sections.forEach((section, sectionIndex) => {
    section.objectIds.forEach((objectId, objectIndex) => {
      if (!objectIds.has(objectId)) {
        context.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'objectIds', objectIndex],
          message: `Unknown object id: ${objectId}`,
        })
      }
    })
  })
})

export type PercentBox = z.infer<typeof PercentBoxSchema>
export type DesignObject = z.infer<typeof DesignObjectSchema>
export type DesignDocument = z.infer<typeof DesignDocumentSchema>
export type DesignStyleTokens = z.infer<typeof StyleTokensSchema>

export type LegacyEditableComponent = {
  id: string
  name: string
  type: string
  editable: boolean
  content: string
  style: string
  layerIndex: number
  boundingBox: string | PercentBox
  sectionId: string
  deleted?: boolean
  current?: {
    text?: string
    image?: string
    description?: string
    boundingBox?: unknown
    [key: string]: unknown
  }
  replacementNeeded?: string[]
}

export type LegacyStyleTokens = {
  palette?: { primary?: string; secondary?: string; accent?: string }
  typography?: { headingFont?: string; bodyFont?: string }
  spacing?: string
  shadows?: string
  gradients?: string
  effects?: string
  borderRadius?: string
  lighting?: string
  colors?: { primary?: string; secondary?: string; accent?: string }
  headingFont?: string
  bodyFont?: string
  visualStyle?: string
}

export type LegacyBreakdown = {
  design: {
    metadata?: Record<string, unknown>
    sections?: Array<{ id: string; name: string; bounds: string | PercentBox }>
    styleTokens: LegacyStyleTokens
    editableComponents: LegacyEditableComponent[]
  }
  designDocument?: DesignDocument
  architectureVersion?: 'spyda-v2'
  visionAnalysis?: unknown
  layoutIntelligence?: unknown
  constraintProfile?: unknown
  notes?: string
  [key: string]: unknown
}

type AdapterOptions = {
  id?: string
  provider?: string
  createdAt?: string
  canvas?: { width?: number | null; height?: number | null }
  sourceAsset?: { fileName?: string | null; mimeType?: string | null }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asFiniteNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(number) ? number : null
}

function slugify(value: unknown, fallback: string) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || fallback
}

function uniqueId(requested: string, used: Set<string>) {
  if (!used.has(requested)) {
    used.add(requested)
    return requested
  }

  let suffix = 2
  while (used.has(`${requested}-${suffix}`)) suffix += 1
  const id = `${requested}-${suffix}`
  used.add(id)
  return id
}

function clampPercentBox(box: PercentBox): PercentBox {
  const width = Math.min(100, Math.max(0.01, box.width))
  const height = Math.min(100, Math.max(0.01, box.height))
  return {
    x: Math.min(100 - width, Math.max(0, box.x)),
    y: Math.min(100 - height, Math.max(0, box.y)),
    width,
    height,
  }
}

function parsePercentBox(value: unknown): PercentBox | null {
  const record = asRecord(value)
  if (!Object.keys(record).length) return null

  const x = asFiniteNumber(record.x)
  const y = asFiniteNumber(record.y)
  const width = asFiniteNumber(record.width ?? record.w)
  const height = asFiniteNumber(record.height ?? record.h)

  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null
  if ([x, y, width, height].some(number => number > 100) || x + width > 110 || y + height > 110) return null

  return clampPercentBox({ x, y, width, height })
}

function canonicalKind(value: unknown): DesignObject['kind'] {
  const normalized = asString(value, 'unknown').toLowerCase()
  if (normalized === 'brand') return 'logo'
  if (normalized === 'qr' || normalized === 'qrcode') return 'qr-code'
  if (normalized === 'background') return 'background'
  if (DesignObjectKindSchema.options.includes(normalized as DesignObject['kind'])) {
    return normalized as DesignObject['kind']
  }
  return 'unknown'
}

function editablePropertiesFor(kind: DesignObject['kind']) {
  if (kind === 'text' || kind === 'action') return ['text', 'fontFamily', 'fontSize', 'fill']
  if (kind === 'image' || kind === 'logo' || kind === 'icon' || kind === 'qr-code') return ['assetRef', 'crop', 'opacity']
  if (kind === 'shape' || kind === 'decor' || kind === 'background' || kind === 'color') return ['fill', 'stroke', 'opacity']
  return ['content', 'style']
}

function protectedPropertiesFor(kind: DesignObject['kind']) {
  const protectedProperties = ['x', 'y', 'width', 'height', 'rotation', 'zIndex']
  if (kind === 'image' || kind === 'logo' || kind === 'icon' || kind === 'qr-code') {
    protectedProperties.push('identity', 'sourcePixels', 'intrinsicColors')
  }
  return protectedProperties
}

function readLegacyContent(component: Record<string, unknown>) {
  const current = asRecord(component.current)
  return asString(
    component.content
      ?? current.text
      ?? current.image
      ?? current.description
      ?? component.text
      ?? component.image,
  )
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

export function parseDesignDocument(value: unknown): DesignDocument {
  return DesignDocumentSchema.parse(value)
}

export function safeParseDesignDocument(value: unknown) {
  return DesignDocumentSchema.safeParse(value)
}

export function adaptBreakdownToDesignDocument(input: unknown, options: AdapterOptions = {}): DesignDocument {
  const root = asRecord(input)
  if (root.schemaVersion === DESIGN_DOCUMENT_VERSION) return parseDesignDocument(root)
  if (root.designDocument) return parseDesignDocument(root.designDocument)

  const design = asRecord(root.design)
  const metadata = asRecord(design.metadata)
  const legacyConstants = asRecord(root.constants)
  const legacyStyle = asRecord(design.styleTokens)
  const legacyPalette = asRecord(legacyStyle.palette ?? legacyStyle.colors ?? legacyConstants.colors)
  const legacyTypography = asRecord(legacyStyle.typography)
  const sourceSections = Array.isArray(design.sections) ? design.sections : []
  const sourceObjects = Array.isArray(design.editableComponents)
    ? design.editableComponents
    : Array.isArray(root.sections) ? root.sections : []

  const sectionIds = new Set<string>()
  const sections = sourceSections.map((value, index) => {
    const section = asRecord(value)
    const id = uniqueId(slugify(section.id ?? section.name, `section-${index + 1}`), sectionIds)
    return {
      id,
      name: asString(section.name, `Section ${index + 1}`),
      bounds: parsePercentBox(section.bounds),
      zIndex: index,
      objectIds: [] as string[],
      legacyBounds: typeof section.bounds === 'string' ? section.bounds : null,
    }
  })

  if (!sections.length) {
    sectionIds.add('main-section')
    sections.push({
      id: 'main-section',
      name: 'Main Design',
      bounds: null,
      zIndex: 0,
      objectIds: [],
      legacyBounds: 'full canvas',
    })
  }

  const sectionAliases = new Map<string, string>()
  sourceSections.forEach((value, index) => {
    const section = asRecord(value)
    sectionAliases.set(asString(section.id, sections[index]?.id), sections[index]?.id)
  })

  const objectIds = new Set<string>()
  const objects = sourceObjects.map((value, index) => {
    const component = asRecord(value)
    const id = uniqueId(slugify(component.id ?? component.name, `object-${index + 1}`), objectIds)
    const requestedSectionId = asString(component.sectionId, sections[0].id)
    const sectionId = sectionAliases.get(requestedSectionId)
      || (sectionIds.has(requestedSectionId) ? requestedSectionId : sections[0].id)
    const kind = canonicalKind(component.type)
    const editable = component.editable !== false
    const content = readLegacyContent(component)
    const styleDescription = typeof component.style === 'string'
      ? component.style
      : asString(asRecord(component.current).description ?? component.description)
    const bounds = parsePercentBox(component.boundingBox ?? asRecord(component.current).boundingBox ?? component.bounds)

    const legacy: Record<string, unknown> = {
      type: asString(component.type, 'unknown'),
      boundingBox: component.boundingBox ?? asRecord(component.current).boundingBox ?? component.bounds ?? 'approx placement',
      current: component.current,
      replacementNeeded: component.replacementNeeded,
    }

    sections.find(section => section.id === sectionId)?.objectIds.push(id)

    return {
      id,
      name: asString(component.name, `Object ${index + 1}`),
      kind,
      sectionId,
      zIndex: asFiniteNumber(component.layerIndex) === null ? index : Math.round(asFiniteNumber(component.layerIndex)!),
      transform: {
        bounds,
        rotation: asFiniteNumber(component.rotation) ?? 0,
        opacity: Math.min(1, Math.max(0, asFiniteNumber(component.opacity) ?? 1)),
        coordinateSpace: 'normalized-percent' as const,
      },
      content: {
        text: kind === 'text' || kind === 'action' ? content : null,
        description: content,
        assetRef: asString(component.assetRef) || null,
        altText: asString(component.altText) || null,
      },
      style: {
        description: styleDescription,
        fill: asString(component.fill) || null,
        stroke: asString(component.stroke) || null,
        fontFamily: asString(component.fontFamily) || null,
        fontSize: asFiniteNumber(component.fontSize),
        fontWeight: asString(component.fontWeight) || null,
        textAlign: null,
        lineHeight: asFiniteNumber(component.lineHeight),
        letterSpacing: asFiniteNumber(component.letterSpacing),
        borderRadius: asFiniteNumber(component.borderRadius),
        effects: readStringArray(component.effects),
      },
      constraints: {
        lockPosition: true,
        lockSize: true,
        lockAspectRatio: kind !== 'text' && kind !== 'action',
        lockRotation: true,
        preserveLayerOrder: true,
        stayInsideCanvas: true,
        fit: kind === 'image' || kind === 'logo' || kind === 'icon' || kind === 'qr-code' ? 'contain' as const : 'auto' as const,
      },
      protection: {
        locked: !editable,
        editableProperties: editable ? editablePropertiesFor(kind) : [],
        protectedProperties: protectedPropertiesFor(kind),
      },
      relationships: {
        parentId: null,
        childIds: [],
        anchoredToIds: [],
        groupId: null,
      },
      source: {
        provider: options.provider || 'legacy-adapter',
        confidence: asFiniteNumber(component.confidence),
        evidence: bounds ? ['legacy-numeric-bounds'] : ['legacy-unmeasured-bounds'],
      },
      status: {
        visible: component.visible !== false,
        removed: component.removed === true,
        consumed: component.deleted === true,
      },
      legacy,
    }
  })

  const width = options.canvas?.width ?? asFiniteNumber(metadata.width)
  const height = options.canvas?.height ?? asFiniteNumber(metadata.height)
  const createdAt = options.createdAt || new Date().toISOString()

  return parseDesignDocument({
    schemaVersion: DESIGN_DOCUMENT_VERSION,
    id: options.id || asString(design.id ?? root.id, 'design-document'),
    sourceAsset: {
      fileName: options.sourceAsset?.fileName || asString(metadata.fileName) || null,
      mimeType: options.sourceAsset?.mimeType || asString(metadata.mimeType) || null,
    },
    canvas: {
      width: width && width > 0 ? Math.round(width) : null,
      height: height && height > 0 ? Math.round(height) : null,
      unit: 'px',
      aspectRatio: asString(metadata.aspectRatio, width && height ? `${width}:${height}` : 'unknown'),
      orientation: asString(metadata.orientation, 'unknown'),
      colorSpace: asString(metadata.colorSpace, 'RGB'),
      backgroundColor: asString(metadata.backgroundColor) || null,
    },
    sections,
    objects,
    styleTokens: {
      palette: {
        primary: asString(legacyPalette.primary, '#0F172A'),
        secondary: asString(legacyPalette.secondary, '#22C55E'),
        accent: asString(legacyPalette.accent, '#F8FAFC'),
      },
      typography: {
        headingFont: asString(legacyTypography.headingFont ?? legacyStyle.headingFont ?? legacyConstants.headingFont, 'Space Grotesk'),
        bodyFont: asString(legacyTypography.bodyFont ?? legacyStyle.bodyFont ?? legacyConstants.bodyFont, 'Montserrat'),
      },
      spacing: asString(legacyStyle.spacing, 'unknown'),
      shadows: asString(legacyStyle.shadows, 'unknown'),
      gradients: asString(legacyStyle.gradients, 'unknown'),
      effects: asString(legacyStyle.effects, 'unknown'),
      borderRadius: asString(legacyStyle.borderRadius, 'unknown'),
      lighting: asString(legacyStyle.lighting, 'unknown'),
      visualStyle: asString(legacyStyle.visualStyle ?? legacyConstants.visualStyle, 'Same as uploaded design'),
    },
    analysis: {
      provider: options.provider || 'legacy-adapter',
      createdAt,
      confidence: asFiniteNumber(asRecord(root.analysis).confidence),
      warnings: objects.filter(object => !object.transform.bounds).map(object => `${object.id}: bounds require measurement`),
      sourceSchema: design.editableComponents ? 'spyda-breakdown-v1' : 'spyda-legacy-sections',
    },
  })
}

function legacyTypeFor(object: DesignObject) {
  const original = asString(object.legacy.type)
  if (original) return original
  if (object.kind === 'logo') return 'brand'
  if (object.kind === 'shape') return 'decor'
  return object.kind
}

export function designDocumentToLegacyBreakdown(documentInput: DesignDocument, originalInput: unknown = {}): LegacyBreakdown {
  const document = parseDesignDocument(documentInput)
  const original = asRecord(originalInput)
  const originalDesign = asRecord(original.design)

  const editableComponents: LegacyEditableComponent[] = document.objects.map(object => {
    const content = object.content.text ?? object.content.description
    const legacyCurrent = asRecord(object.legacy.current)
    const current = Object.keys(legacyCurrent).length
      ? {
          ...legacyCurrent,
          text: typeof legacyCurrent.text === 'string' ? legacyCurrent.text : undefined,
          image: typeof legacyCurrent.image === 'string' ? legacyCurrent.image : undefined,
          description: typeof legacyCurrent.description === 'string' ? legacyCurrent.description : undefined,
          boundingBox: legacyCurrent.boundingBox,
        }
      : object.kind === 'text' || object.kind === 'action'
        ? { text: content }
        : { image: content }
    const legacyBox = object.legacy.boundingBox

    return {
      id: object.id,
      name: object.name,
      type: legacyTypeFor(object),
      editable: !object.protection.locked,
      content,
      style: object.style.description,
      layerIndex: object.zIndex,
      boundingBox: object.transform.bounds || (typeof legacyBox === 'string' ? legacyBox : 'approx placement'),
      sectionId: object.sectionId,
      deleted: object.status.consumed || undefined,
      current,
      replacementNeeded: readStringArray(object.legacy.replacementNeeded).length
        ? readStringArray(object.legacy.replacementNeeded)
        : ['Keep as-is or replace this component.'],
    }
  })

  return {
    ...original,
    design: {
      ...originalDesign,
      metadata: {
        ...asRecord(originalDesign.metadata),
        width: document.canvas.width,
        height: document.canvas.height,
        aspectRatio: document.canvas.aspectRatio,
        orientation: document.canvas.orientation,
        colorSpace: document.canvas.colorSpace,
      },
      sections: document.sections.map(section => ({
        id: section.id,
        name: section.name,
        bounds: section.bounds || section.legacyBounds || 'approximate layout box',
      })),
      styleTokens: {
        palette: document.styleTokens.palette,
        typography: document.styleTokens.typography,
        spacing: document.styleTokens.spacing,
        shadows: document.styleTokens.shadows,
        gradients: document.styleTokens.gradients,
        effects: document.styleTokens.effects,
        borderRadius: document.styleTokens.borderRadius,
        lighting: document.styleTokens.lighting,
        visualStyle: document.styleTokens.visualStyle,
      },
      editableComponents,
    },
    designDocument: document,
  } as LegacyBreakdown
}
