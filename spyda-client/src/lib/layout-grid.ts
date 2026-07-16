import { clampBox, parseAtomBox, type AtomBox } from './design'

export type LayoutGridAtomInput = {
  id: string
  name: string
  type: string
  boundingBox: unknown
  box?: AtomBox
  deleted?: boolean
}

export type LayoutGridGuide = {
  schemaVersion: '1.0'
  columns: number
  rows: number
  safeArea: { left: number; right: number; top: number; bottom: number }
  atoms: Array<{
    id: string
    name: string
    type: string
    bounds: AtomBox
    gridCell: { columnStart: number; columnEnd: number; rowStart: number; rowEnd: number }
  }>
  rules: string[]
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function gridShape(size?: { width: number; height: number } | null) {
  if (!size?.width || !size?.height) return { columns: 8, rows: 12 }
  const aspectRatio = size.width / size.height
  if (aspectRatio > 1.2) return { columns: 12, rows: 8 }
  if (aspectRatio >= 0.9) return { columns: 10, rows: 10 }
  return { columns: 8, rows: 12 }
}

function cellSpan(start: number, length: number, count: number) {
  const cellSize = 100 / count
  return {
    start: Math.max(1, Math.min(count, Math.floor(start / cellSize) + 1)),
    end: Math.max(1, Math.min(count, Math.ceil((start + length) / cellSize))),
  }
}

function measuredSafeArea(atoms: LayoutGridGuide['atoms']) {
  const contentAtoms = atoms.filter(atom => (
    !/(background|decor|shape|style|color)/i.test(atom.type)
      && atom.bounds.width < 98
      && atom.bounds.height < 98
  ))
  if (!contentAtoms.length) return { left: 2, right: 2, top: 2, bottom: 2 }

  const left = Math.min(...contentAtoms.map(atom => atom.bounds.x))
  const right = Math.min(...contentAtoms.map(atom => 100 - atom.bounds.x - atom.bounds.width))
  const top = Math.min(...contentAtoms.map(atom => atom.bounds.y))
  const bottom = Math.min(...contentAtoms.map(atom => 100 - atom.bounds.y - atom.bounds.height))
  return {
    left: round(Math.max(0, Math.min(15, left))),
    right: round(Math.max(0, Math.min(15, right))),
    top: round(Math.max(0, Math.min(15, top))),
    bottom: round(Math.max(0, Math.min(15, bottom))),
  }
}

export function buildLayoutGridGuide(
  inputs: LayoutGridAtomInput[],
  size?: { width: number; height: number } | null,
): LayoutGridGuide {
  const { columns, rows } = gridShape(size)
  const atoms = inputs
    .filter(atom => !atom.deleted)
    .flatMap(atom => {
      const parsed = atom.box || parseAtomBox(atom.boundingBox, size)
      if (!parsed) return []
      const bounds = clampBox(parsed)
      const columnSpan = cellSpan(bounds.x, bounds.width, columns)
      const rowSpan = cellSpan(bounds.y, bounds.height, rows)
      return [{
        id: atom.id,
        name: atom.name,
        type: atom.type,
        bounds,
        gridCell: {
          columnStart: columnSpan.start,
          columnEnd: columnSpan.end,
          rowStart: rowSpan.start,
          rowEnd: rowSpan.end,
        },
      }]
    })

  return {
    schemaVersion: '1.0',
    columns,
    rows,
    safeArea: measuredSafeArea(atoms),
    atoms,
    rules: [
      'Keep every unchanged atom inside its measured grid cells and exact normalized bounds.',
      'Fit replacements inside the atom footprint they replace; never expand the footprint.',
      'Keep all important content inside the canvas and preserve the measured edge spacing.',
      'Preserve the parent canvas aspect ratio, layering, alignment, and full-bleed background.',
    ],
  }
}
