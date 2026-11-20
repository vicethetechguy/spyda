import type { ReactNode } from 'react'

/**
 * Just enough markdown for design replies: headings, bullet and numbered lists,
 * bold, italic, inline code. Built from React nodes, never innerHTML, so model
 * output cannot inject markup. HEX colours get a swatch, because a breakdown
 * that lists a palette should show it.
 */

import { parseBlocks, parseInline } from '../../lib/chat-markdown'

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        if (token.kind === 'bold') return <strong key={index} className="font-semibold text-foreground">{token.value}</strong>
        if (token.kind === 'italic') return <em key={index}>{token.value}</em>
        if (token.kind === 'code') return <code key={index} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.86em] text-primary">{token.value}</code>
        if (token.kind === 'hex') {
          return (
            <span key={index} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-white/[0.06] px-1.5 py-0.5 align-baseline font-mono text-[0.86em]">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border border-white/25" style={{ backgroundColor: token.value }} />
              {token.value}
            </span>
          )
        }
        return <span key={index}>{token.value}</span>
      })}
    </>
  )
}

export default function ChatMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = parseBlocks(text).map((block, index) => {
    if (block.kind === 'heading') {
      return <p key={index} className="mt-1 font-heading text-[15px] font-semibold text-foreground">{<Inline text={block.text} />}</p>
    }
    if (block.kind === 'list') {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List key={index} className={`space-y-1.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-primary/70`}>
          {block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} /></li>)}
        </List>
      )
    }
    return <p key={index}><Inline text={block.text} /></p>
  })
  return <div className="space-y-3 text-[14px] leading-7 text-foreground/85">{nodes}</div>
}
