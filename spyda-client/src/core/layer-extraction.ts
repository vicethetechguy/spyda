import type { DesignDocument, DesignObject } from './design-document.js'

/**
 * Turns an analysed document into a layer document whose image layers hold real
 * pixel cut-outs.
 *
 * Pixel work is injected (`produceCutout`, `saveAsset`) so the decision logic
 * here - which layers get cut, when a cut is rejected, how confidence and
 * evidence are recorded - is testable without a canvas.
 */

/** Layers that can meaningfully be cut out of the flyer. */
export const CUTOUT_KINDS: ReadonlyArray<DesignObject['kind']> = ['image', 'logo', 'icon']

/**
 * Below this share of foreground pixels a mask is treated as a failure and the
 * layer falls back to its plain rectangle. Measured cut-outs on our samples land
 * at 0.12-0.51, while the broken cases measured 0.00.
 */
export const MIN_CUTOUT_COVERAGE = 0.02

/**
 * A second floor, on fully opaque pixels only, because coverage alone cannot
 * tell a real cut-out from a ghost. A region that caught nothing but soft
 * shadow measured 0.00 solid while still clearing the coverage floor, whereas
 * the faintest legible layer measured 0.0062 solid. Without this check a
 * transparent smear would be shipped as if it were a subject.
 */
export const MIN_SOLID_COVERAGE = 0.005

/** Confidence assigned when a mask fails and only a rectangle is available. */
const RECTANGLE_FALLBACK_CONFIDENCE = 0.3

export type CutoutOutcome = 'cutout' | 'rectangle-fallback' | 'no-bounds' | 'failed'

export type CutoutRecord = {
  objectId: string
  assetRef: string | null
  /** Share of pixels with meaningful alpha in the crop, 0..1. */
  coverage: number
  /** Share of fully opaque pixels in the crop, 0..1. */
  solidCoverage: number
  outcome: CutoutOutcome
}

export type CutoutDraft = {
  blob: Blob
  /** Share of foreground pixels in the crop, used to accept or reject the mask. */
  coverage: number
  /** Share of opaque pixels in the crop; catches masks that painted only edges. */
  solidCoverage: number
}

/** Accepts a mask only when it is neither empty nor made of faint edges. */
export function isUsableMask(draft: Pick<CutoutDraft, 'coverage' | 'solidCoverage'>) {
  return draft.coverage >= MIN_CUTOUT_COVERAGE && draft.solidCoverage >= MIN_SOLID_COVERAGE
}

/**
 * Produces the pixels for one layer. Implementations must fall back to an
 * unmasked rectangle crop when masking yields nothing, and report the coverage
 * they actually achieved so the caller can classify the outcome.
 */
export type CutoutProducer = (object: DesignObject) => Promise<CutoutDraft | null>

export type ExtractLayersOptions = {
  document: DesignDocument
  produceCutout: CutoutProducer
  /** Full-frame asset for the background layer, when one is present. */
  produceBackground?: () => Promise<Blob | null>
  saveAsset: (blob: Blob) => Promise<string>
  onProgress?: (done: number, total: number, objectId: string) => void
  signal?: AbortSignal
}

export type ExtractLayersResult = {
  document: DesignDocument
  cutouts: CutoutRecord[]
  warnings: string[]
}

function addEvidence(object: DesignObject, evidence: string) {
  if (!object.source.evidence.includes(evidence)) object.source.evidence.push(evidence)
}

function downgradeConfidence(object: DesignObject) {
  const current = object.source.confidence
  object.source.confidence = current === null
    ? RECTANGLE_FALLBACK_CONFIDENCE
    : Math.min(current, RECTANGLE_FALLBACK_CONFIDENCE)
}

function isCutoutTarget(object: DesignObject) {
  return CUTOUT_KINDS.includes(object.kind) && !object.status.removed
}

/**
 * The full flyer as a layer, for documents that never had one.
 *
 * Analyses rarely describe their own backdrop, but without it the document is
 * not self-sufficient: the canvas would show cut-outs floating on nothing and a
 * later deterministic render would export them on transparent black. The
 * backdrop is locked, because moving the flyer itself is not an edit.
 */
function createBackgroundLayer(document: DesignDocument, assetRef: string): DesignObject {
  const lowest = document.objects.reduce((min, object) => Math.min(min, object.zIndex), 0)
  return {
    id: 'background',
    name: 'Background',
    kind: 'background',
    sectionId: document.sections[0]?.id ?? 'main-section',
    zIndex: lowest - 1,
    transform: {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      rotation: 0,
      opacity: 1,
      coordinateSpace: 'normalized-percent',
    },
    content: { text: null, description: 'Full flyer', assetRef, altText: null },
    style: {
      description: 'Full-frame flyer',
      fill: null,
      stroke: null,
      fontFamily: null,
      fontSize: null,
      fontWeight: null,
      textAlign: null,
      lineHeight: null,
      letterSpacing: null,
      borderRadius: null,
      effects: [],
    },
    constraints: {
      lockPosition: true,
      lockSize: true,
      lockAspectRatio: true,
      lockRotation: true,
      preserveLayerOrder: true,
      stayInsideCanvas: true,
      fit: 'cover',
    },
    protection: {
      locked: true,
      editableProperties: ['assetRef'],
      protectedProperties: ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'identity'],
    },
    relationships: { parentId: null, childIds: [], anchoredToIds: [], groupId: null },
    source: { provider: 'layer-extraction', confidence: 1, evidence: ['full-frame-background'] },
    status: { visible: true, removed: false, consumed: false },
    legacy: {},
  }
}

export async function extractLayers({
  document,
  produceCutout,
  produceBackground,
  saveAsset,
  onProgress,
  signal,
}: ExtractLayersOptions): Promise<ExtractLayersResult> {
  const next = structuredClone(document)
  const warnings: string[] = []
  const cutouts: CutoutRecord[] = []

  const background = next.objects.find(object => object.kind === 'background')
  if (produceBackground) {
    try {
      const blob = await produceBackground()
      if (blob) {
        const assetRef = `asset:${await saveAsset(blob)}`
        if (background) {
          background.content.assetRef = assetRef
          addEvidence(background, 'full-frame-background')
        } else {
          const created = createBackgroundLayer(next, assetRef)
          next.objects.unshift(created)
          next.sections.find(section => section.id === created.sectionId)?.objectIds.unshift(created.id)
        }
      }
    } catch (error) {
      warnings.push(`Background asset failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  const targets = next.objects.filter(isCutoutTarget)
  let done = 0

  for (const object of targets) {
    if (signal?.aborted) throw new DOMException('Layer extraction cancelled.', 'AbortError')

    if (!object.transform.bounds) {
      cutouts.push({ objectId: object.id, assetRef: null, coverage: 0, solidCoverage: 0, outcome: 'no-bounds' })
      warnings.push(`${object.id}: no measurable bounds, so no cut-out was produced.`)
      done += 1
      onProgress?.(done, targets.length, object.id)
      continue
    }

    try {
      const draft = await produceCutout(object)
      if (!draft) {
        cutouts.push({ objectId: object.id, assetRef: null, coverage: 0, solidCoverage: 0, outcome: 'failed' })
        warnings.push(`${object.id}: cut-out could not be produced.`)
      } else {
        const id = await saveAsset(draft.blob)
        const accepted = isUsableMask(draft)
        object.content.assetRef = `asset:${id}`

        if (accepted) {
          addEvidence(object, 'onnx-cutout')
        } else {
          // A near-empty mask means the model could not separate this object.
          // Keep the rectangle so the layer is still usable, and say so loudly
          // enough for the review step to flag it.
          addEvidence(object, 'rectangle-fallback')
          downgradeConfidence(object)
          warnings.push(
            `${object.id}: mask painted ${(draft.coverage * 100).toFixed(2)}% of the crop `
            + `(${(draft.solidCoverage * 100).toFixed(2)}% solid), so the plain rectangle was kept.`,
          )
        }

        cutouts.push({
          objectId: object.id,
          assetRef: object.content.assetRef,
          coverage: draft.coverage,
          solidCoverage: draft.solidCoverage,
          outcome: accepted ? 'cutout' : 'rectangle-fallback',
        })
      }
    } catch (error) {
      cutouts.push({ objectId: object.id, assetRef: null, coverage: 0, solidCoverage: 0, outcome: 'failed' })
      warnings.push(`${object.id}: ${error instanceof Error ? error.message : 'cut-out failed'}`)
    }

    done += 1
    onProgress?.(done, targets.length, object.id)
  }

  return {
    document: {
      ...next,
      analysis: {
        ...next.analysis,
        warnings: [...next.analysis.warnings, ...warnings],
      },
    },
    cutouts,
    warnings,
  }
}
