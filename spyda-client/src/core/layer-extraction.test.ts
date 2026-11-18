import { describe, expect, it, vi } from 'vitest'
import { adaptBreakdownToDesignDocument, safeParseDesignDocument, type DesignDocument } from './design-document'
import { MIN_CUTOUT_COVERAGE, MIN_SOLID_COVERAGE, extractLayers, type CutoutDraft } from './layer-extraction'

function flyerDocument(): DesignDocument {
  return adaptBreakdownToDesignDocument({
    design: {
      metadata: { width: 1080, height: 1350, aspectRatio: '4:5', orientation: 'portrait', colorSpace: 'RGB' },
      sections: [{ id: 'main', name: 'Main', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      styleTokens: {},
      editableComponents: [
        {
          id: 'page-background',
          name: 'Page background',
          type: 'background',
          editable: true,
          content: 'Full bleed wash',
          style: 'Flat gradient',
          layerIndex: 0,
          boundingBox: { x: 0, y: 0, width: 100, height: 100 },
          sectionId: 'main',
        },
        {
          id: 'product-photo',
          name: 'Product photo',
          type: 'image',
          editable: true,
          content: 'Bottle on a plinth',
          style: 'Photographic cut-out',
          layerIndex: 3,
          confidence: 0.88,
          boundingBox: { x: 22, y: 44, width: 36, height: 28 },
          sectionId: 'main',
        },
        {
          id: 'brand-logo',
          name: 'Brand logo',
          type: 'brand',
          editable: true,
          content: 'Wordmark',
          style: 'Small top logo',
          layerIndex: 4,
          boundingBox: { x: 6, y: 4, width: 14, height: 6 },
          sectionId: 'main',
        },
        {
          id: 'star-icon',
          name: 'Star icon',
          type: 'icon',
          editable: true,
          content: 'Rating star',
          style: 'Flat gold',
          layerIndex: 5,
          boundingBox: { x: 78, y: 6, width: 8, height: 8 },
          sectionId: 'main',
        },
        {
          id: 'headline',
          name: 'Headline',
          type: 'text',
          editable: true,
          content: 'Big sale',
          style: 'Bold centered',
          layerIndex: 8,
          boundingBox: { x: 10, y: 20, width: 80, height: 12 },
          sectionId: 'main',
        },
      ],
    },
  }, { id: 'fixture-layers', provider: 'test-provider', createdAt: '2026-07-14T00:00:00.000Z' })
}

function draft(coverage: number, solidCoverage = coverage): CutoutDraft {
  return { blob: new Blob(['cut-out pixels']), coverage, solidCoverage }
}

function sequentialAssets() {
  let counter = 0
  return async () => {
    counter += 1
    return String(counter)
  }
}

function objectById(document: DesignDocument, id: string) {
  const object = document.objects.find(candidate => candidate.id === id)
  if (!object) throw new Error(`Missing object ${id} in fixture`)
  return object
}

describe('Layer extraction', () => {
  it('gives every image-kind layer a cut-out and never touches geometry', () => {
    const document = flyerDocument()
    const originalBounds = document.objects.map(object => ({ id: object.id, bounds: object.transform.bounds }))
    const produceCutout = vi.fn(async () => draft(0.31))
    const saveAsset = vi.fn(sequentialAssets())

    return extractLayers({
      document,
      produceCutout,
      saveAsset,
      produceBackground: async () => new Blob(['full flyer']),
    }).then(result => {
      // text is not a cut-out target, background has its own full-frame asset
      expect(produceCutout).toHaveBeenCalledTimes(3)
      expect(result.cutouts.map(record => record.objectId)).toEqual(['product-photo', 'brand-logo', 'star-icon'])
      expect(result.cutouts.every(record => record.outcome === 'cutout')).toBe(true)
      expect(result.warnings).toEqual([])

      const photo = objectById(result.document, 'product-photo')
      expect(photo.content.assetRef).toBe('asset:2')
      expect(photo.source.evidence).toContain('onnx-cutout')
      // a clean cut-out must not cost the layer its measured confidence
      expect(photo.source.confidence).toBe(0.88)

      expect(objectById(result.document, 'headline').content.assetRef).toBeNull()

      // bounds stay byte-identical, which is the gate for this phase
      expect(result.document.objects.map(object => ({ id: object.id, bounds: object.transform.bounds })))
        .toEqual(originalBounds)

      // the input document is left alone; extraction returns a new one
      expect(objectById(document, 'product-photo').content.assetRef).toBeNull()

      expect(safeParseDesignDocument(result.document).success).toBe(true)
    })
  })

  it('keeps the plain rectangle and warns when the mask is degenerate', () => {
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async () => draft(0.004),
      saveAsset: sequentialAssets(),
      produceBackground: async () => new Blob(['full flyer']),
    }).then(result => {
      expect(result.cutouts.every(record => record.outcome === 'rectangle-fallback')).toBe(true)

      const photo = objectById(result.document, 'product-photo')
      // still editable as a rectangle rather than dropped
      expect(photo.content.assetRef).toBe('asset:2')
      expect(photo.source.evidence).toContain('rectangle-fallback')
      expect(photo.source.evidence).not.toContain('onnx-cutout')
      expect(photo.source.confidence).toBe(0.3)

      expect(result.warnings).toHaveLength(3)
      expect(result.warnings[0]).toContain('product-photo')
      expect(result.warnings[0]).toContain('0.40%')

      // lower confidence has to survive schema validation
      expect(safeParseDesignDocument(result.document).success).toBe(true)
      const reparsed = safeParseDesignDocument(result.document)
      expect(reparsed.success && reparsed.data.analysis.warnings).toContain(result.warnings[0])
    })
  })

  it('rejects a mask that painted only faint edges', () => {
    // Measured on a real flyer: a region that caught nothing but soft shadow
    // cleared the coverage floor at 2.32% while holding 0.00% solid pixels. That
    // is a transparent smear, not a cut-out.
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async () => draft(0.0232, 0),
      saveAsset: sequentialAssets(),
    }).then(result => {
      expect(result.cutouts.every(record => record.outcome === 'rectangle-fallback')).toBe(true)
      expect(objectById(result.document, 'star-icon').source.evidence).toContain('rectangle-fallback')
      expect(result.warnings[0]).toContain('0.00% solid')
    })
  })

  it('accepts a soft mask that still has solid pixels', () => {
    // The faintest legible layer on the same flyer measured 15.77% coverage and
    // 0.62% solid. It reads as text, so it must not be thrown away.
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async () => draft(0.1577, 0.0062),
      saveAsset: sequentialAssets(),
    }).then(result => {
      expect(result.cutouts.every(record => record.outcome === 'cutout')).toBe(true)
      expect(result.warnings).toEqual([])
    })
  })

  it('accepts a mask exactly at both coverage floors', () => {
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async () => draft(MIN_CUTOUT_COVERAGE, MIN_SOLID_COVERAGE),
      saveAsset: sequentialAssets(),
    }).then(result => {
      expect(result.cutouts.every(record => record.outcome === 'cutout')).toBe(true)
      expect(result.warnings).toEqual([])
    })
  })

  it('stores the untouched flyer as the background asset', () => {
    const document = flyerDocument()
    const saveAsset = vi.fn(sequentialAssets())

    return extractLayers({
      document,
      produceCutout: async () => draft(0.4),
      produceBackground: async () => new Blob(['full flyer'], { type: 'image/jpeg' }),
      saveAsset,
    }).then(result => {
      const background = objectById(result.document, 'page-background')
      expect(background.content.assetRef).toBe('asset:1')
      expect(background.source.evidence).toContain('full-frame-background')
      // no cut-out producer runs for the background
      expect(result.cutouts.map(record => record.objectId)).not.toContain('page-background')
    })
  })

  it('adds a locked full-frame background when the analysis described none', () => {
    const document = flyerDocument()
    document.objects = document.objects.filter(object => object.kind !== 'background')

    return extractLayers({
      document,
      produceCutout: async () => draft(0.4),
      produceBackground: async () => new Blob(['full flyer'], { type: 'image/jpeg' }),
      saveAsset: sequentialAssets(),
    }).then(result => {
      const background = objectById(result.document, 'background')
      expect(background.kind).toBe('background')
      expect(background.content.assetRef).toBe('asset:1')
      expect(background.transform.bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 })
      // the backdrop is the flyer, not a thing to drag around
      expect(background.protection.locked).toBe(true)
      expect(result.document.objects[0].id).toBe('background')
      expect(objectById(result.document, 'product-photo').content.assetRef).toBe('asset:2')
    })
  })

  it('skips removed layers and reports layers with no measurable bounds', () => {
    const document = flyerDocument()
    objectById(document, 'star-icon').status.removed = true
    objectById(document, 'brand-logo').transform.bounds = null
    const produceCutout = vi.fn(async () => draft(0.4))

    return extractLayers({ document, produceCutout, saveAsset: sequentialAssets() }).then(result => {
      expect(produceCutout).toHaveBeenCalledTimes(1)
      expect(result.cutouts).toEqual([
        { objectId: 'product-photo', assetRef: 'asset:1', coverage: 0.4, solidCoverage: 0.4, outcome: 'cutout' },
        { objectId: 'brand-logo', assetRef: null, coverage: 0, solidCoverage: 0, outcome: 'no-bounds' },
      ])
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('brand-logo')
    })
  })

  it('reports a failed cut-out and keeps going', () => {
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async object => {
        if (object.id === 'brand-logo') throw new Error('canvas tainted')
        return draft(0.4)
      },
      saveAsset: sequentialAssets(),
    }).then(result => {
      expect(result.cutouts).toEqual([
        { objectId: 'product-photo', assetRef: 'asset:1', coverage: 0.4, solidCoverage: 0.4, outcome: 'cutout' },
        { objectId: 'brand-logo', assetRef: null, coverage: 0, solidCoverage: 0, outcome: 'failed' },
        { objectId: 'star-icon', assetRef: 'asset:2', coverage: 0.4, solidCoverage: 0.4, outcome: 'cutout' },
      ])
      expect(result.warnings[0]).toContain('canvas tainted')
      expect(objectById(result.document, 'star-icon').content.assetRef).toBe('asset:2')
    })
  })

  it('a null draft is a failure, not an empty cut-out', () => {
    const document = flyerDocument()

    return extractLayers({
      document,
      produceCutout: async () => null,
      saveAsset: sequentialAssets(),
    }).then(result => {
      expect(result.cutouts.every(record => record.outcome === 'failed')).toBe(true)
      expect(result.document.objects.every(object => object.content.assetRef === null)).toBe(true)
    })
  })

  it('reports progress and stops when cancelled', () => {
    const document = flyerDocument()
    const progress: string[] = []
    const controller = new AbortController()
    const saveAsset = vi.fn(sequentialAssets())

    return extractLayers({
      document,
      produceCutout: async object => {
        if (object.id === 'brand-logo') controller.abort()
        return draft(0.4)
      },
      saveAsset,
      signal: controller.signal,
      onProgress: (_done, _total, objectId) => progress.push(objectId),
    }).then(
      () => { throw new Error('Extraction should have been cancelled.') },
      (error: unknown) => {
        expect((error as Error).name).toBe('AbortError')
        expect(progress).toEqual(['product-photo', 'brand-logo'])
        // the third layer is never cut, so its asset is never stored
        expect(saveAsset).toHaveBeenCalledTimes(2)
      },
    )
  })
})
