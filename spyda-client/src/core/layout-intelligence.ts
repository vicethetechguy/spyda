import type { DesignDocument, DesignObject, PercentBox } from './design-document'
import type { VisionAnalysis } from './vision-adapter'

export type LayoutLine = {
  position: number
  strength: number
  objectIds: string[]
}

export type ObjectMeasurement = {
  objectId: string
  bounds: PercentBox
  pixelBounds: { x: number; y: number; width: number; height: number } | null
  aspectRatio: number
  rotation: number
  alignmentAnchors: {
    left: number
    centerX: number
    right: number
    top: number
    centerY: number
    bottom: number
  }
  margins: { left: number; right: number; top: number; bottom: number }
  paddingToParent: { left: number; right: number; top: number; bottom: number } | null
  gridCell: { columnStart: number; columnEnd: number; rowStart: number; rowEnd: number }
  layerOrder: number
  parentId: string | null
  childIds: string[]
  groupId: string | null
  relativePosition: { x: number; y: number }
  alignmentPeers: string[]
  visualHierarchyRank: number
  confidence: number | null
}

export type LayoutIntelligenceModel = {
  schemaVersion: '1.0'
  canvas: { width: number | null; height: number | null; aspectRatio: string }
  grid: {
    columns: LayoutLine[]
    rows: LayoutLine[]
    columnGaps: number[]
    rowGaps: number[]
  }
  safeMargins: { left: number; right: number; top: number; bottom: number }
  groups: Array<{ id: string; objectIds: string[]; bounds: PercentBox; reason: string }>
  hierarchy: string[]
  measurements: Record<string, ObjectMeasurement>
  warnings: string[]
}

type AxisPoint = { position: number; objectId: string }

const ALIGNMENT_TOLERANCE = 1.5

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function clusterAxisPoints(points: AxisPoint[], tolerance = ALIGNMENT_TOLERANCE): LayoutLine[] {
  const clusters: AxisPoint[][] = []
  for (const point of [...points].sort((a, b) => a.position - b.position)) {
    const cluster = clusters.find(items => Math.abs(median(items.map(item => item.position)) - point.position) <= tolerance)
    if (cluster) cluster.push(point)
    else clusters.push([point])
  }

  return clusters
    .filter(cluster => cluster.length > 1)
    .map(cluster => ({
      position: round(median(cluster.map(item => item.position))),
      strength: cluster.length,
      objectIds: [...new Set(cluster.map(item => item.objectId))],
    }))
    .sort((a, b) => a.position - b.position)
}

function resolveObjectBounds(document: DesignDocument, vision: VisionAnalysis) {
  const detections = new Map(
    vision.detections
      .filter(detection => detection.sourceObjectId)
      .map(detection => [detection.sourceObjectId as string, detection]),
  )
  return document.objects.flatMap(object => {
    const detection = detections.get(object.id)
    const bounds = detection?.bounds || object.transform.bounds
    return bounds ? [{ object, bounds, confidence: detection?.confidence ?? object.source.confidence }] : []
  })
}

function boxUnion(boxes: PercentBox[]): PercentBox {
  const left = Math.min(...boxes.map(box => box.x))
  const top = Math.min(...boxes.map(box => box.y))
  const right = Math.max(...boxes.map(box => box.x + box.width))
  const bottom = Math.max(...boxes.map(box => box.y + box.height))
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) }
}

function overlaps(aStart: number, aSize: number, bStart: number, bSize: number) {
  return Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart) > 0
}

function inferGaps(items: Array<{ bounds: PercentBox }>, axis: 'x' | 'y') {
  const gaps: number[] = []
  for (let index = 0; index < items.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const first = items[index].bounds
      const second = items[otherIndex].bounds
      const horizontal = axis === 'x'
      const crossOverlap = horizontal
        ? overlaps(first.y, first.height, second.y, second.height)
        : overlaps(first.x, first.width, second.x, second.width)
      if (!crossOverlap) continue
      const firstStart = horizontal ? first.x : first.y
      const firstSize = horizontal ? first.width : first.height
      const secondStart = horizontal ? second.x : second.y
      const secondSize = horizontal ? second.width : second.height
      const gap = Math.max(firstStart, secondStart) - Math.min(firstStart + firstSize, secondStart + secondSize)
      if (gap > 0 && gap < 40) gaps.push(round(gap, 2))
    }
  }
  return [...new Set(gaps)].sort((a, b) => a - b).slice(0, 12)
}

function nearestLineIndex(lines: LayoutLine[], value: number, fallback: number) {
  if (!lines.length) return fallback
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  lines.forEach((line, index) => {
    const distance = Math.abs(line.position - value)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

function hierarchyWeight(object: DesignObject, bounds: PercentBox) {
  const kindWeight: Record<DesignObject['kind'], number> = {
    text: 8,
    action: 7,
    image: 6,
    logo: 5,
    'qr-code': 4,
    icon: 3,
    shape: 2,
    decor: 1,
    background: 0,
    group: 0,
    style: 0,
    color: 0,
    unknown: 0,
  }
  return kindWeight[object.kind] * 1000 + bounds.width * bounds.height + object.zIndex / 100
}

export function inferLayoutIntelligence(document: DesignDocument, vision: VisionAnalysis): LayoutIntelligenceModel {
  const measured = resolveObjectBounds(document, vision)
  const horizontalPoints: AxisPoint[] = []
  const verticalPoints: AxisPoint[] = []

  measured.forEach(({ object, bounds }) => {
    horizontalPoints.push(
      { position: bounds.x, objectId: object.id },
      { position: bounds.x + bounds.width / 2, objectId: object.id },
      { position: bounds.x + bounds.width, objectId: object.id },
    )
    verticalPoints.push(
      { position: bounds.y, objectId: object.id },
      { position: bounds.y + bounds.height / 2, objectId: object.id },
      { position: bounds.y + bounds.height, objectId: object.id },
    )
  })

  const columns = clusterAxisPoints(horizontalPoints)
  const rows = clusterAxisPoints(verticalPoints)
  const objectBounds = new Map(measured.map(item => [item.object.id, item.bounds]))
  const hierarchy = [...measured]
    .sort((a, b) => hierarchyWeight(b.object, b.bounds) - hierarchyWeight(a.object, a.bounds))
    .map(item => item.object.id)

  const groups = document.sections.flatMap(section => {
    const boxes = section.objectIds.map(id => objectBounds.get(id)).filter(Boolean) as PercentBox[]
    if (!boxes.length) return []
    return [{ id: `section:${section.id}`, objectIds: section.objectIds.filter(id => objectBounds.has(id)), bounds: boxUnion(boxes), reason: 'shared-section' }]
  })

  const measurements: Record<string, ObjectMeasurement> = {}
  measured.forEach(({ object, bounds, confidence }) => {
    const parentBounds = object.relationships.parentId ? objectBounds.get(object.relationships.parentId) : null
    const anchors = {
      left: round(bounds.x),
      centerX: round(bounds.x + bounds.width / 2),
      right: round(bounds.x + bounds.width),
      top: round(bounds.y),
      centerY: round(bounds.y + bounds.height / 2),
      bottom: round(bounds.y + bounds.height),
    }
    const alignmentPeers = measured
      .filter(other => other.object.id !== object.id)
      .filter(other => {
        const otherAnchors = [other.bounds.x, other.bounds.x + other.bounds.width / 2, other.bounds.x + other.bounds.width]
        const currentAnchors = [anchors.left, anchors.centerX, anchors.right]
        const verticalOther = [other.bounds.y, other.bounds.y + other.bounds.height / 2, other.bounds.y + other.bounds.height]
        const verticalCurrent = [anchors.top, anchors.centerY, anchors.bottom]
        return currentAnchors.some(value => otherAnchors.some(otherValue => Math.abs(value - otherValue) <= ALIGNMENT_TOLERANCE))
          || verticalCurrent.some(value => verticalOther.some(otherValue => Math.abs(value - otherValue) <= ALIGNMENT_TOLERANCE))
      })
      .map(other => other.object.id)

    measurements[object.id] = {
      objectId: object.id,
      bounds,
      pixelBounds: document.canvas.width && document.canvas.height ? {
        x: round(bounds.x / 100 * document.canvas.width, 1),
        y: round(bounds.y / 100 * document.canvas.height, 1),
        width: round(bounds.width / 100 * document.canvas.width, 1),
        height: round(bounds.height / 100 * document.canvas.height, 1),
      } : null,
      aspectRatio: round(bounds.width / bounds.height),
      rotation: object.transform.rotation,
      alignmentAnchors: anchors,
      margins: {
        left: round(bounds.x),
        right: round(100 - bounds.x - bounds.width),
        top: round(bounds.y),
        bottom: round(100 - bounds.y - bounds.height),
      },
      paddingToParent: parentBounds ? {
        left: round(bounds.x - parentBounds.x),
        right: round(parentBounds.x + parentBounds.width - bounds.x - bounds.width),
        top: round(bounds.y - parentBounds.y),
        bottom: round(parentBounds.y + parentBounds.height - bounds.y - bounds.height),
      } : null,
      gridCell: {
        columnStart: nearestLineIndex(columns, anchors.left, 0),
        columnEnd: nearestLineIndex(columns, anchors.right, Math.max(0, columns.length - 1)),
        rowStart: nearestLineIndex(rows, anchors.top, 0),
        rowEnd: nearestLineIndex(rows, anchors.bottom, Math.max(0, rows.length - 1)),
      },
      layerOrder: object.zIndex,
      parentId: object.relationships.parentId,
      childIds: object.relationships.childIds,
      groupId: object.relationships.groupId || `section:${object.sectionId}`,
      relativePosition: {
        x: round(bounds.x + bounds.width / 2),
        y: round(bounds.y + bounds.height / 2),
      },
      alignmentPeers,
      visualHierarchyRank: hierarchy.indexOf(object.id) + 1,
      confidence,
    }
  })

  return {
    schemaVersion: '1.0',
    canvas: { width: document.canvas.width, height: document.canvas.height, aspectRatio: document.canvas.aspectRatio },
    grid: {
      columns,
      rows,
      columnGaps: inferGaps(measured, 'x'),
      rowGaps: inferGaps(measured, 'y'),
    },
    safeMargins: {
      left: round(median(measured.map(item => item.bounds.x))),
      right: round(median(measured.map(item => 100 - item.bounds.x - item.bounds.width))),
      top: round(median(measured.map(item => item.bounds.y))),
      bottom: round(median(measured.map(item => 100 - item.bounds.y - item.bounds.height))),
    },
    groups,
    hierarchy,
    measurements,
    warnings: [
      ...vision.warnings,
      ...document.objects.filter(object => !measurements[object.id]).map(object => `${object.id}: excluded from layout inference because it has no bounds`),
    ],
  }
}
