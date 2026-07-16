import { describe, expect, it } from 'vitest'
import { buildLayoutGridGuide } from './layout-grid'

describe('buildLayoutGridGuide', () => {
  it('uses a portrait grid and maps atoms to bounded cells', () => {
    const guide = buildLayoutGridGuide([{
      id: 'headline',
      name: 'Headline',
      type: 'text',
      boundingBox: { x: 12, y: 20, width: 76, height: 18 },
    }], { width: 1080, height: 1350 })

    expect(guide.columns).toBe(8)
    expect(guide.rows).toBe(12)
    expect(guide.atoms[0].gridCell).toEqual({
      columnStart: 1,
      columnEnd: 8,
      rowStart: 3,
      rowEnd: 5,
    })
  })

  it('converts pixel boxes and never allows a footprint beyond the canvas', () => {
    const guide = buildLayoutGridGuide([{
      id: 'logo',
      name: 'Logo',
      type: 'logo',
      boundingBox: 'x:900, y:20, width:300, height:160',
    }], { width: 1000, height: 1000 })

    expect(guide.columns).toBe(10)
    expect(guide.rows).toBe(10)
    expect(guide.atoms[0].bounds.x + guide.atoms[0].bounds.width).toBeLessThanOrEqual(100)
    expect(guide.atoms[0].gridCell.columnEnd).toBe(10)
  })
})
