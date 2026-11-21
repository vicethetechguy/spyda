import type { DesignDocument, DesignObject, PercentBox } from '../core/design-document'

/**
 * New layers and blank canvases for canvas mode.
 *
 * Analysed flyers start with protective locks; layers a person draws are
 * theirs from the first frame, so they come fully editable and movable.
 */

export type NewLayerKind = 'text' | 'rect' | 'circle' | 'image'

export type CanvasPreset = { id: string; name: string; detail: string; width: number; height: number }

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'portrait', name: 'Instagram post', detail: '4:5 · 1080 × 1350', width: 1080, height: 1350 },
  { id: 'story', name: 'Story or reel', detail: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  { id: 'square', name: 'Square post', detail: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { id: 'a4', name: 'A4 flyer', detail: 'Portrait · 1240 × 1754', width: 1240, height: 1754 },
  { id: 'banner', name: 'Banner', detail: '16:9 · 1920 × 1080', width: 1920, height: 1080 },
]

export function newLayerId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `layer-${crypto.randomUUID().slice(0, 8)}`
    : `layer-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const TEXT_PROPERTIES = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'fill', 'opacity']
const SHAPE_PROPERTIES = ['fill', 'stroke', 'opacity']
const IMAGE_PROPERTIES = ['assetRef', 'opacity']

export type LayerOptions = {
  id?: string
  name?: string
  bounds?: PercentBox
  text?: string
  fill?: string | null
  stroke?: string | null
  fontFamily?: string | null
  fontSize?: number | null
  fontWeight?: string | null
  textAlign?: DesignObject['style']['textAlign']
  assetRef?: string | null
  opacity?: number
  zIndex?: number
}

function topZ(document: DesignDocument) {
  return document.objects.reduce((max, object) => Math.max(max, object.zIndex), 0)
}

/** A complete, editable design object, ready for a `create` intent. */
export function makeLayer(document: DesignDocument, kind: NewLayerKind, options: LayerOptions = {}): DesignObject {
  const isText = kind === 'text'
  const isImage = kind === 'image'
  const objectKind: DesignObject['kind'] = isText ? 'text' : isImage ? 'image' : 'shape'
  const fallbackBounds: PercentBox = isText
    ? { x: 12, y: 42, width: 76, height: 12 }
    : kind === 'circle'
      ? { x: 35, y: 35, width: 30, height: 30 * ((document.canvas.width || 1) / (document.canvas.height || 1)) }
      : { x: 25, y: 38, width: 50, height: 24 }

  return {
    id: options.id ?? newLayerId(),
    name: options.name ?? (isText ? 'Text' : isImage ? 'Image' : kind === 'circle' ? 'Circle' : 'Rectangle'),
    kind: objectKind,
    sectionId: document.sections[0]?.id ?? 'main',
    zIndex: options.zIndex ?? topZ(document) + 1,
    transform: {
      bounds: options.bounds ?? fallbackBounds,
      rotation: 0,
      opacity: options.opacity ?? 1,
      coordinateSpace: 'normalized-percent',
    },
    content: {
      text: isText ? options.text ?? 'Your headline' : null,
      description: isText ? options.text ?? 'Your headline' : options.name ?? (isImage ? 'Image' : 'Shape'),
      assetRef: isImage ? options.assetRef ?? null : null,
      altText: null,
    },
    style: {
      description: isText ? 'Text layer' : isImage ? 'Image layer' : 'Shape layer',
      fill: options.fill !== undefined ? options.fill : isText ? '#ffffff' : isImage ? null : '#9dfab0',
      stroke: options.stroke ?? null,
      fontFamily: isText ? options.fontFamily ?? 'Space Grotesk' : null,
      fontSize: isText ? options.fontSize ?? 72 : null,
      fontWeight: isText ? options.fontWeight ?? '700' : null,
      textAlign: isText ? options.textAlign ?? 'center' : null,
      lineHeight: isText ? 1.15 : null,
      letterSpacing: null,
      borderRadius: kind === 'circle' ? 9999 : kind === 'rect' ? 24 : null,
      effects: [],
    },
    constraints: {
      lockPosition: false,
      lockSize: false,
      lockAspectRatio: kind === 'circle' || isImage,
      lockRotation: false,
      preserveLayerOrder: false,
      stayInsideCanvas: false,
      fit: isImage ? 'contain' : 'auto',
    },
    protection: {
      locked: false,
      editableProperties: isText ? [...TEXT_PROPERTIES] : isImage ? [...IMAGE_PROPERTIES] : [...SHAPE_PROPERTIES],
      protectedProperties: [],
    },
    relationships: { parentId: null, childIds: [], anchoredToIds: [], groupId: null },
    source: { provider: 'canvas', confidence: 1, evidence: ['drawn-in-canvas-mode'] },
    status: { visible: true, removed: false, consumed: false },
    legacy: { type: objectKind },
  }
}

/** The legacy breakdown a blank canvas is stored as, so it opens like any project. */
export function blankBreakdown(preset: CanvasPreset, background = '#ffffff') {
  const divisor = gcd(preset.width, preset.height)
  return {
    design: {
      metadata: {
        width: preset.width,
        height: preset.height,
        aspectRatio: `${preset.width / divisor}:${preset.height / divisor}`,
        orientation: preset.height > preset.width ? 'portrait' : preset.height < preset.width ? 'landscape' : 'square',
        colorSpace: 'RGB',
      },
      sections: [{ id: 'main', name: 'Canvas', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: {},
      editableComponents: [
        {
          id: 'background',
          name: 'Background',
          type: 'background',
          editable: true,
          content: 'Background',
          style: 'Solid background',
          fill: background,
          layerIndex: 0,
          boundingBox: { x: 0, y: 0, width: 100, height: 100 },
          sectionId: 'main',
        },
      ],
    },
  }
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}
