import { parseDesignDocument, type DesignDocument, type DesignObject, type PercentBox } from './design-document'
import type { LayoutIntelligenceModel } from './layout-intelligence'

export type FidelityMetric = { score: number; issues: string[] }

export type FidelityReport = {
  schemaVersion: '1.0'
  passed: boolean
  overall: number
  metrics: {
    position: FidelityMetric
    scale: FidelityMetric
    typography: FidelityMetric
    alignment: FidelityMetric
    color: FidelityMetric
    layout: FidelityMetric
  }
  missingObjectIds: string[]
  unexpectedObjectIds: string[]
  issues: string[]
}

export type RenderedDimensionReport = {
  passed: boolean
  score: number
  expected: { width: number; height: number; aspectRatio: number } | null
  actual: { width: number; height: number; aspectRatio: number } | null
  issue: string | null
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function boundsDistance(reference: PercentBox, candidate: PercentBox) {
  const referenceCenter = { x: reference.x + reference.width / 2, y: reference.y + reference.height / 2 }
  const candidateCenter = { x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 }
  return Math.hypot(referenceCenter.x - candidateCenter.x, referenceCenter.y - candidateCenter.y)
}

function average(values: number[], fallback = 100) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

function normalizedColor(value: string | null) {
  return (value || '').trim().toLowerCase()
}

function objectMap(document: DesignDocument) {
  return new Map(document.objects.map(object => [object.id, object]))
}

function geometryMetrics(reference: DesignObject[], candidates: Map<string, DesignObject>) {
  const positionScores: number[] = []
  const scaleScores: number[] = []
  const positionIssues: string[] = []
  const scaleIssues: string[] = []

  reference.forEach(object => {
    const candidate = candidates.get(object.id)
    if (!candidate || !object.transform.bounds || !candidate.transform.bounds) return
    const distance = boundsDistance(object.transform.bounds, candidate.transform.bounds)
    const positionScore = clampScore(100 - distance * 10)
    positionScores.push(positionScore)
    if (positionScore < 98) positionIssues.push(`${object.name} moved ${distance.toFixed(2)}% of the canvas.`)

    const widthDelta = Math.abs(candidate.transform.bounds.width - object.transform.bounds.width) / object.transform.bounds.width
    const heightDelta = Math.abs(candidate.transform.bounds.height - object.transform.bounds.height) / object.transform.bounds.height
    const scaleScore = clampScore(100 - (widthDelta + heightDelta) * 100)
    scaleScores.push(scaleScore)
    if (scaleScore < 98) scaleIssues.push(`${object.name} changed visible footprint.`)
  })

  return {
    position: { score: clampScore(average(positionScores)), issues: positionIssues },
    scale: { score: clampScore(average(scaleScores)), issues: scaleIssues },
  }
}

function typographyMetric(reference: DesignObject[], candidates: Map<string, DesignObject>): FidelityMetric {
  const scores: number[] = []
  const issues: string[] = []
  reference.filter(object => object.kind === 'text' || object.kind === 'action').forEach(object => {
    const candidate = candidates.get(object.id)
    if (!candidate) return
    let score = 100
    if (object.style.fontFamily && candidate.style.fontFamily !== object.style.fontFamily) score -= 35
    if (object.style.fontSize && candidate.style.fontSize) {
      score -= Math.min(35, Math.abs(candidate.style.fontSize - object.style.fontSize) / object.style.fontSize * 100)
    }
    if (object.style.fontWeight && candidate.style.fontWeight !== object.style.fontWeight) score -= 15
    if (object.style.textAlign && candidate.style.textAlign !== object.style.textAlign) score -= 15
    scores.push(clampScore(score))
    if (score < 98) issues.push(`${object.name} typography changed beyond its content replacement.`)
  })
  return { score: clampScore(average(scores)), issues }
}

function colorMetric(reference: DesignDocument, candidate: DesignDocument): FidelityMetric {
  const scores: number[] = []
  const issues: string[] = []
  const candidateObjects = objectMap(candidate)
  reference.objects.forEach(object => {
    const candidateObject = candidateObjects.get(object.id)
    if (!candidateObject) return
    const sourceColors = [normalizedColor(object.style.fill), normalizedColor(object.style.stroke)].filter(Boolean)
    const candidateColors = [normalizedColor(candidateObject.style.fill), normalizedColor(candidateObject.style.stroke)].filter(Boolean)
    if (!sourceColors.length && !candidateColors.length) return
    const matches = sourceColors.filter(color => candidateColors.includes(color)).length
    const score = sourceColors.length ? matches / sourceColors.length * 100 : 100
    scores.push(score)
    if (score < 100) issues.push(`${object.name} color treatment changed.`)
  })
  const sourcePalette = Object.values(reference.styleTokens.palette).map(color => color.toLowerCase())
  const candidatePalette = Object.values(candidate.styleTokens.palette).map(color => color.toLowerCase())
  scores.push(sourcePalette.filter(color => candidatePalette.includes(color)).length / sourcePalette.length * 100)
  return { score: clampScore(average(scores)), issues }
}

function alignmentMetric(referenceLayout?: LayoutIntelligenceModel, candidateLayout?: LayoutIntelligenceModel): FidelityMetric {
  if (!referenceLayout || !candidateLayout) return { score: 100, issues: [] }
  const scores: number[] = []
  const issues: string[] = []
  Object.values(referenceLayout.measurements).forEach(measurement => {
    const candidate = candidateLayout.measurements[measurement.objectId]
    if (!candidate) return
    const expectedPeers = new Set(measurement.alignmentPeers)
    const actualPeers = new Set(candidate.alignmentPeers)
    const union = new Set([...expectedPeers, ...actualPeers])
    const intersection = [...expectedPeers].filter(peer => actualPeers.has(peer)).length
    const score = union.size ? intersection / union.size * 100 : 100
    scores.push(score)
    if (score < 100) issues.push(`${measurement.objectId} lost an alignment relationship.`)
  })
  return { score: clampScore(average(scores)), issues }
}

export function validateDesignFidelity(
  referenceInput: DesignDocument,
  candidateInput: DesignDocument,
  referenceLayout?: LayoutIntelligenceModel,
  candidateLayout?: LayoutIntelligenceModel,
): FidelityReport {
  const reference = parseDesignDocument(referenceInput)
  const candidate = parseDesignDocument(candidateInput)
  const candidates = objectMap(candidate)
  const referenceIds = new Set(reference.objects.map(object => object.id))
  const candidateIds = new Set(candidate.objects.map(object => object.id))
  const missingObjectIds = [...referenceIds].filter(id => !candidateIds.has(id))
  const unexpectedObjectIds = [...candidateIds].filter(id => !referenceIds.has(id))
  const geometry = geometryMetrics(reference.objects, candidates)
  const typography = typographyMetric(reference.objects, candidates)
  const color = colorMetric(reference, candidate)
  const alignment = alignmentMetric(referenceLayout, candidateLayout)
  const layerScores = reference.objects.flatMap(object => {
    const candidateObject = candidates.get(object.id)
    return candidateObject ? [candidateObject.zIndex === object.zIndex ? 100 : 0] : []
  })
  const layoutScore = clampScore(average([
    geometry.position.score,
    geometry.scale.score,
    alignment.score,
    average(layerScores),
    missingObjectIds.length ? 0 : 100,
  ]))
  const layout: FidelityMetric = {
    score: layoutScore,
    issues: [
      ...missingObjectIds.map(id => `${id} is missing from the candidate design.`),
      ...unexpectedObjectIds.map(id => `${id} was added without a reference object.`),
    ],
  }
  const overall = clampScore(
    geometry.position.score * 0.25
      + geometry.scale.score * 0.2
      + typography.score * 0.15
      + alignment.score * 0.15
      + color.score * 0.1
      + layout.score * 0.15,
  )
  const issues = [
    ...geometry.position.issues,
    ...geometry.scale.issues,
    ...typography.issues,
    ...alignment.issues,
    ...color.issues,
    ...layout.issues,
  ]

  return {
    schemaVersion: '1.0',
    passed: overall >= 92 && !missingObjectIds.length,
    overall,
    metrics: { position: geometry.position, scale: geometry.scale, typography, alignment, color, layout },
    missingObjectIds,
    unexpectedObjectIds,
    issues,
  }
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  try {
    const binary = atob(base64)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function littleEndian(bytes: Uint8Array, offset: number, length: number) {
  let value = 0
  for (let index = 0; index < length; index += 1) value += bytes[offset + index] << (index * 8)
  return value
}

export function readRasterDimensions(dataUrl: string): { width: number; height: number } | null {
  const bytes = dataUrlBytes(dataUrl)
  if (!bytes || bytes.length < 24) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16))
    if (chunk === 'VP8X' && bytes.length >= 30) return { width: littleEndian(bytes, 24, 3) + 1, height: littleEndian(bytes, 27, 3) + 1 }
    if (chunk === 'VP8 ' && bytes.length >= 30) return { width: littleEndian(bytes, 26, 2) & 0x3fff, height: littleEndian(bytes, 28, 2) & 0x3fff }
    if (chunk === 'VP8L' && bytes.length >= 25) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8)
      const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
      return { width, height }
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] }
      }
      offset += 2 + Math.max(2, length)
    }
  }
  return null
}

export function validateRenderedDimensions(canvas: DesignDocument['canvas'], imageDataUrl: string): RenderedDimensionReport {
  if (!canvas.width || !canvas.height) return { passed: true, score: 100, expected: null, actual: null, issue: null }
  const dimensions = readRasterDimensions(imageDataUrl)
  const expected = { width: canvas.width, height: canvas.height, aspectRatio: canvas.width / canvas.height }
  if (!dimensions) return { passed: false, score: 0, expected, actual: null, issue: 'Generated image dimensions could not be read.' }
  const actual = { ...dimensions, aspectRatio: dimensions.width / dimensions.height }
  const ratioDelta = Math.abs(actual.aspectRatio - expected.aspectRatio) / expected.aspectRatio
  const score = clampScore(100 - ratioDelta * 500)
  return {
    passed: ratioDelta <= 0.01,
    score,
    expected,
    actual,
    issue: ratioDelta <= 0.01 ? null : 'Generated image aspect ratio differs from the source canvas.',
  }
}
