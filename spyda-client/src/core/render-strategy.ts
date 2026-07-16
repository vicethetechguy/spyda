import type { DesignDocument } from './design-document.js'

export type RenderOperation = {
  objectId: string | null
  kind: 'asset-replacement' | 'text-replacement' | 'remove' | 'brand-style' | 'geometry' | 'synthesis'
  hasMeasuredBounds?: boolean
  reconstructedLayerAvailable?: boolean
}

export type RenderPlan = {
  schemaVersion: '1.0'
  mode: 'passthrough' | 'deterministic-composite' | 'deterministic-reconstruction' | 'ai-assisted'
  invokeImageModel: boolean
  operations: RenderOperation[]
  reasons: string[]
}

export function planRenderStrategy(document: DesignDocument | null, operations: RenderOperation[]): RenderPlan {
  if (!operations.length) {
    return { schemaVersion: '1.0', mode: 'passthrough', invokeImageModel: false, operations, reasons: ['No visual operation requires rendering.'] }
  }

  const unmeasuredAsset = operations.some(operation => operation.kind === 'asset-replacement' && !operation.hasMeasuredBounds)
  const requiresSynthesis = operations.some(operation => operation.kind === 'synthesis' || operation.kind === 'brand-style')
  const complexRemoval = operations.some(operation => operation.kind === 'remove' && !operation.reconstructedLayerAvailable)
  const flatText = operations.some(operation => operation.kind === 'text-replacement' && !operation.reconstructedLayerAvailable)
  const explicitGeometry = operations.some(operation => operation.kind === 'geometry')

  if (requiresSynthesis || complexRemoval || flatText || unmeasuredAsset || explicitGeometry) {
    const reasons = [
      requiresSynthesis && 'The requested change requires visual synthesis.',
      complexRemoval && 'A complex removal has no isolated reconstructed layer.',
      flatText && 'The source text is still embedded in a flat raster region.',
      unmeasuredAsset && 'A replacement asset has no authoritative measured footprint.',
      explicitGeometry && 'An explicit geometry change requires re-composition.',
    ].filter(Boolean) as string[]
    return { schemaVersion: '1.0', mode: 'ai-assisted', invokeImageModel: true, operations, reasons }
  }

  const reconstructed = operations.some(operation => operation.kind === 'text-replacement' || operation.kind === 'remove')
  return {
    schemaVersion: '1.0',
    mode: reconstructed ? 'deterministic-reconstruction' : 'deterministic-composite',
    invokeImageModel: false,
    operations,
    reasons: [reconstructed ? 'All targeted objects have isolated reconstructed layers.' : 'Every replacement has an authoritative measured footprint.'],
  }
}

export function planRecipeRenderStrategy(recipe: Record<string, unknown>): RenderPlan {
  const document = recipe.designDocument && typeof recipe.designDocument === 'object' ? recipe.designDocument as DesignDocument : null
  const operations: RenderOperation[] = []
  const pastedAssets = Array.isArray(recipe.pastedAssets) ? recipe.pastedAssets : []
  const textEdits = Array.isArray(recipe.textEdits) ? recipe.textEdits : []
  const otherEdits = Array.isArray(recipe.otherEdits) ? recipe.otherEdits : []
  const essentials = Array.isArray(recipe.essentials) ? recipe.essentials : []

  pastedAssets.forEach(asset => operations.push({ objectId: String((asset as Record<string, unknown>).objectId || '') || null, kind: 'asset-replacement', hasMeasuredBounds: Boolean((asset as Record<string, unknown>).box) }))
  textEdits.forEach(edit => operations.push({ objectId: String((edit as Record<string, unknown>).objectId || '') || null, kind: 'text-replacement', reconstructedLayerAvailable: Boolean((edit as Record<string, unknown>).layerAvailable) }))
  otherEdits.forEach(edit => operations.push({ objectId: String((edit as Record<string, unknown>).objectId || '') || null, kind: 'synthesis' }))
  if (essentials.length || recipe.essentialsImage) operations.push({ objectId: null, kind: 'synthesis' })
  if (recipe.brandOverrides) operations.push({ objectId: null, kind: 'brand-style' })

  return planRenderStrategy(document, operations)
}
