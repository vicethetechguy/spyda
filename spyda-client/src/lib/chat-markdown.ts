/**
 * Parsers for the chat's small markdown subset, kept apart from the component
 * so they can be tested and the component file only exports a component.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g

export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold' | 'italic' | 'code'; value: string }
  | { kind: 'hex'; value: string }

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ kind: 'text', value: text.slice(last, index) })
    const raw = match[0]
    if (raw.startsWith('**')) tokens.push({ kind: 'bold', value: raw.slice(2, -2) })
    else if (raw.startsWith('`')) tokens.push({ kind: 'code', value: raw.slice(1, -1) })
    else if (raw.startsWith('#')) tokens.push({ kind: 'hex', value: raw.toUpperCase() })
    else tokens.push({ kind: 'italic', value: raw.slice(1, -1) })
    last = index + raw.length
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) })
  return tokens
}

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string }

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    if (list) blocks.push({ kind: 'list', ...list })
    paragraph = []
    list = null
  }

  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
        paragraph = []
      }
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push({ kind: 'list', ...list })
        list = { ordered, items: [] }
      }
      list.items.push((bullet || numbered)![1])
      continue
    }
    if (list) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}
