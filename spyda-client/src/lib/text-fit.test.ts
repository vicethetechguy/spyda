import { describe, expect, it } from 'vitest'
import { countWrappedLines, fitFontSize, type MeasureText } from './text-fit'

// Every glyph is 0.5em wide, so widths are easy to reason about.
const monospace: MeasureText = (text, size) => text.length * size * 0.5

describe('countWrappedLines', () => {
  it('wraps greedily at word boundaries', () => {
    // At size 10 each glyph is 5px, so 50px holds 10 characters per line.
    expect(countWrappedLines('aaaa bbbb cccc', 50, 10, monospace)).toBe(2)
    expect(countWrappedLines('aaaa', 50, 10, monospace)).toBe(1)
  })

  it('counts explicit line breaks', () => {
    expect(countWrappedLines('one\ntwo', 500, 10, monospace)).toBe(2)
  })
})

describe('fitFontSize', () => {
  it('fits a whole sentence instead of sizing to the box height', () => {
    const text = "Money doesn't have to be boring"
    const width = 280
    const height = 120
    const size = fitFontSize({ text, width, height, measure: monospace })

    // The old heuristic (62% of height) would have been 74px - one word per line.
    expect(size).toBeLessThan(height * 0.62)
    const lines = countWrappedLines(text, width, size, monospace)
    expect(lines * size * 1.2).toBeLessThanOrEqual(height)
    // and it is not needlessly tiny
    expect(fitFontSize({ text, width, height, measure: monospace, maxSize: size + 2 })).toBeGreaterThanOrEqual(size)
  })

  it('never breaks a single word across lines', () => {
    const size = fitFontSize({ text: 'Unbreakable', width: 55, height: 500, measure: monospace })
    expect(monospace('Unbreakable', size)).toBeLessThanOrEqual(55)
  })

  it('respects the bounds it is given', () => {
    expect(fitFontSize({ text: 'Hi', width: 1000, height: 40, measure: monospace, maxSize: 24 })).toBe(24)
    expect(fitFontSize({ text: 'a very long line of text', width: 4, height: 4, measure: monospace, minSize: 8 })).toBe(8)
    expect(fitFontSize({ text: '   ', width: 100, height: 100, measure: monospace })).toBe(8)
  })
})
