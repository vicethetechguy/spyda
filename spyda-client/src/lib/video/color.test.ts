import { describe, expect, it } from 'vitest'
import { NEUTRAL_CURVES, autoBalance, curveLut, curvesAreNeutral, pictureStats, sampleCurve, wheelUniforms, wheelVector, wheelsAreNeutral, withColor } from './color'

describe('colour wheels', () => {
  it('push towards the colour the dot points at, without changing brightness', () => {
    const red = wheelVector({ x: 1, y: 0, level: 0 }, 1, 0)
    expect(red[0]).toBeGreaterThan(0)
    expect(red[1]).toBeLessThan(0)
    expect(red[0] + red[1] + red[2]).toBeCloseTo(0)
  })
  it('the level makes every channel brighter or darker', () => {
    const lift = wheelVector({ x: 0, y: 0, level: 1 }, 1, 0.2)
    expect(lift).toEqual([0.2, 0.2, 0.2])
  })
  it('a centred wheel is neutral', () => {
    const color = withColor(null)
    expect(wheelsAreNeutral(color)).toBe(true)
    expect(wheelUniforms(color).gain).toEqual([0, 0, 0])
  })
})

describe('curves', () => {
  it('a straight curve leaves everything as it is', () => {
    expect(curvesAreNeutral(NEUTRAL_CURVES)).toBe(true)
    const lut = curveLut(NEUTRAL_CURVES)
    expect([lut[0], lut[128 * 4], lut[255 * 4]]).toEqual([0, 128, 255])
  })
  it('goes through its points and never overshoots', () => {
    const s: Array<[number, number]> = [[0, 0], [0.25, 0.15], [0.75, 0.88], [1, 1]]
    expect(sampleCurve(s, 0.25)).toBeCloseTo(0.15)
    expect(sampleCurve(s, 0.75)).toBeCloseTo(0.88)
    for (let x = 0; x <= 1; x += 0.01) {
      const y = sampleCurve(s, x)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(sampleCurve(s, Math.max(0, x - 0.01)) - 1e-9)
    }
  })
  it('applies the channel curve after the master curve', () => {
    const lut = curveLut({ ...NEUTRAL_CURVES, master: [[0, 0], [1, 0.5]], r: [[0, 1], [1, 1]] })
    expect(lut[255 * 4]).toBe(255) // red curve lifts everything to full
    expect(lut[255 * 4 + 1]).toBe(128) // green follows the master: half
  })
})

describe('auto balance', () => {
  const picture = (r: number, g: number, b: number) => {
    const data = new Uint8ClampedArray(16 * 4)
    for (let i = 0; i < 16; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255 }
    return pictureStats(data)
  }
  it('warms a blue picture and cools an orange one', () => {
    expect(autoBalance(picture(90, 110, 170)).temperature).toBeGreaterThan(0)
    expect(autoBalance(picture(190, 120, 70)).temperature).toBeLessThan(0)
  })
  it('brightens a dark picture and darkens a bright one', () => {
    expect(autoBalance(picture(30, 30, 30)).exposure).toBeGreaterThan(0)
    expect(autoBalance(picture(230, 230, 230)).exposure).toBeLessThan(0)
  })
  it('pulls a green cast towards magenta', () => {
    expect(autoBalance(picture(100, 160, 100)).tint).toBeGreaterThan(0)
  })
})
