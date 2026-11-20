import { describe, expect, it } from 'vitest'
import { parseBlocks, parseInline } from './chat-markdown'

describe('chat markdown', () => {
  it('splits bold, code and HEX colours out of a line', () => {
    expect(parseInline('**Colour:** navy #0b1f6b and `Inter`')).toEqual([
      { kind: 'bold', value: 'Colour:' },
      { kind: 'text', value: ' navy ' },
      { kind: 'hex', value: '#0B1F6B' },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: 'Inter' },
    ])
  })

  it('groups lists and headings into blocks', () => {
    const blocks = parseBlocks('## Layout\nA clean grid.\n- Headline top-left\n- Photo centre\n\n1. First\n2. Second')
    expect(blocks.map(block => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list'])
    expect(blocks[2]).toEqual({ kind: 'list', ordered: false, items: ['Headline top-left', 'Photo centre'] })
    expect(blocks[3]).toMatchObject({ ordered: true })
  })

  it('keeps markup as text, never as HTML', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'text', value: '<img src=x onerror=alert(1)>' }])
  })
})
