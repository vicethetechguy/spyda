import { describe, expect, it } from 'vitest'
import { framePsnr, videoTargetBitrate } from './compress'

describe('video compressor quality', () => {
  it('never aims below a bitrate that keeps H.264 crisp', () => {
    // 1080p30 from a lean 2.5 Mbps recording: still at least ~5 Mbps, not a quarter of the source.
    expect(videoTargetBitrate(1920 * 1080, 30, 2_500_000)).toBeGreaterThanOrEqual(4_900_000)
    // A heavy 20 Mbps recording: a good third of it.
    expect(videoTargetBitrate(1920 * 1080, 30, 20_000_000)).toBe(7_000_000)
  })
  it('scores identical frames as perfect and visibly different ones as poor', () => {
    const a = new Uint8ClampedArray(400).fill(120)
    expect(framePsnr(a, a)).toBe(99)
    const b = a.map((value, index) => (index % 4 === 3 ? value : value + 40))
    expect(framePsnr(a, new Uint8ClampedArray(b))).toBeLessThan(30)
  })
})
