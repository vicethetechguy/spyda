/**
 * Picks the largest font size at which `text` word-wraps inside a box.
 *
 * Analyses usually measure where a headline sits but not how big its type is.
 * Guessing a size from the box height alone fits one short word and clips the
 * rest of the sentence, so the size is searched against real glyph widths.
 */

/** Width in pixels of `text` set at `fontSize`. */
export type MeasureText = (text: string, fontSize: number) => number

export type FitTextOptions = {
  text: string
  width: number
  height: number
  measure: MeasureText
  lineHeight?: number
  minSize?: number
  maxSize?: number
}

/** Line count when `text` is greedily word-wrapped at `width`. */
export function countWrappedLines(text: string, width: number, fontSize: number, measure: MeasureText) {
  let lines = 0
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines += 1
      continue
    }
    let line = ''
    lines += 1
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate, fontSize) > width) {
        lines += 1
        line = word
      } else {
        line = candidate
      }
    }
  }
  return lines
}

function fits(options: Required<FitTextOptions>, size: number) {
  const { text, width, height, measure, lineHeight } = options
  // A single word wider than the box would be broken mid-word, so it does not fit.
  const widest = Math.max(0, ...text.split(/\s+/).filter(Boolean).map(word => measure(word, size)))
  if (widest > width) return false
  return countWrappedLines(text, width, size, measure) * size * lineHeight <= height
}

export function fitFontSize(input: FitTextOptions) {
  const options: Required<FitTextOptions> = {
    lineHeight: 1.2,
    minSize: 8,
    maxSize: Math.max(8, input.height),
    ...input,
  }
  const { minSize, maxSize, width, height } = options
  if (!options.text.trim() || width <= 0 || height <= 0) return minSize
  if (fits(options, maxSize)) return maxSize

  let low = minSize
  let high = maxSize
  // Half-pixel precision is finer than anyone can see at display scale.
  while (high - low > 0.5) {
    const middle = (low + high) / 2
    if (fits(options, middle)) low = middle
    else high = middle
  }
  return Math.floor(low * 2) / 2
}
