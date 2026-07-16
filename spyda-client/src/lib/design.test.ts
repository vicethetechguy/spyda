import { describe, expect, it } from 'vitest'
import { findVisiblePixelBounds, resizeBoxFromCorner } from './design.js'

function pixels(width: number, height: number, background: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) data.set(background, offset)
  return data
}

function paint(data: Uint8ClampedArray, width: number, x: number, y: number, color: [number, number, number, number]) {
  data.set(color, (y * width + x) * 4)
}

describe('visible logo bounds', () => {
  it('ignores transparent padding around a logo', () => {
    const data = pixels(10, 10, [0, 0, 0, 0])
    for (let y = 3; y <= 6; y += 1) for (let x = 2; x <= 7; x += 1) paint(data, 10, x, y, [20, 30, 40, 255])

    expect(findVisiblePixelBounds(data, 10, 10)).toEqual({ x: 1, y: 2, width: 8, height: 6 })
  })

  it('ignores a flat white margin around opaque artwork', () => {
    const data = pixels(12, 8, [255, 255, 255, 255])
    for (let y = 2; y <= 5; y += 1) for (let x = 4; x <= 8; x += 1) paint(data, 12, x, y, [10, 10, 10, 255])

    expect(findVisiblePixelBounds(data, 12, 8)).toEqual({ x: 3, y: 1, width: 7, height: 6 })
  })
})

describe('placement box resizing', () => {
  it('resizes proportionally from the bottom-right corner', () => {
    expect(resizeBoxFromCorner({ x: 10, y: 20, width: 20, height: 10 }, 'se', 10, 2)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
  })

  it('keeps the opposite corner fixed when resizing from the top-left', () => {
    expect(resizeBoxFromCorner({ x: 20, y: 30, width: 20, height: 10 }, 'nw', -10, -2)).toEqual({
      x: 10,
      y: 25,
      width: 30,
      height: 15,
    })
  })

  it('keeps resized assets inside the flyer canvas', () => {
    const resized = resizeBoxFromCorner({ x: 80, y: 80, width: 15, height: 10 }, 'se', 80, 80)
    expect(resized.x + resized.width).toBeLessThanOrEqual(100)
    expect(resized.y + resized.height).toBeLessThanOrEqual(100)
    expect(resized.width / resized.height).toBeCloseTo(1.5)
  })
})
