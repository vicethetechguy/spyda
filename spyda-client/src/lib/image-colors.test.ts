import { describe, expect, it } from 'vitest'
import { duotoneFilter, hexToRgb, recolorFilter, rgbToHex } from './image-colors'

const node = (attrs: Record<string, unknown>) => ({ getAttr: (name: string) => attrs[name] })
const pixels = (...rgb: Array<[number, number, number]>) => ({ data: new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255])) }) as unknown as ImageData

describe('image colours', () => {
  it('converts hex and rgb', () => {
    expect(hexToRgb('#D9262B')).toEqual([217, 38, 43])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(rgbToHex([217, 38, 43])).toBe('#D9262B')
  })

  it('moves only pixels near the chosen colour, keeping their shading', () => {
    const image = pixels([217, 38, 43], [190, 30, 36], [42, 107, 214])
    recolorFilter.call(node({ spydaRecolor: [{ from: '#D9262B', to: '#1FBF4F' }], spydaRecolorRange: 60 }), image)
    expect(Array.from(image.data.slice(0, 3))).toEqual([31, 191, 79])
    // A darker red becomes a darker green, not the flat target.
    expect(image.data[5]).toBeGreaterThan(120)
    expect(image.data[4]).toBeLessThan(image.data[5])
    // The blue is out of range and untouched.
    expect(Array.from(image.data.slice(8, 11))).toEqual([42, 107, 214])
  })

  it('maps light and dark onto two colours for duotone', () => {
    const image = pixels([0, 0, 0], [255, 255, 255])
    duotoneFilter.call(node({ spydaDuotone: { shadow: '#1C1259', highlight: '#9DFAB0', amount: 1 } }), image)
    expect(Array.from(image.data.slice(0, 3))).toEqual([28, 18, 89])
    expect(Array.from(image.data.slice(4, 7))).toEqual([157, 250, 176])
  })
})
