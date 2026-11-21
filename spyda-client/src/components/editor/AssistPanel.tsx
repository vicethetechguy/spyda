import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Loader2, Mic, Sparkles, Square } from '../ui/icons'
import { useSpeechInput } from '../chat/useSpeechInput'

/**
 * Spyda AI beside the canvas: ask in words, and the design changes as layers
 * you can keep editing, each request one undo step.
 */

export type AssistEntry = { id: string; role: 'user' | 'assistant'; text: string; error?: boolean }

type AssistPanelProps = {
  entries: AssistEntry[]
  draft: string
  setDraft: (value: string) => void
  onSend: (instruction: string) => void
  busy: boolean
  /** A canvas with nothing but its background gets layout ideas instead of edits. */
  blank: boolean
}

const BLANK_IDEAS = [
  'Lay out a flyer for my business: ',
  'Design a sale announcement with a big discount and a call to action',
  'Make an event poster with the date, venue and a ticket button',
]

const EDIT_IDEAS = [
  'Make the headline stand out more',
  'Give it a bold, modern colour palette',
  'Add a call-to-action button at the bottom',
  'Tidy up the alignment and spacing',
]

export default function AssistPanel({ entries, draft, setDraft, onSend, busy, blank }: AssistPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const spokenBase = useRef('')
  const speech = useSpeechInput(text => setDraft(`${spokenBase.current}${spokenBase.current && text ? ' ' : ''}${text}`))

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries.length, busy])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    if (speech.listening) speech.stop()
    onSend(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const ideas = blank ? BLANK_IDEAS : EDIT_IDEAS

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.04] p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Design with Spyda AI</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {blank
                ? 'Describe the flyer you want and Spyda lays it out as layers you can move and edit.'
                : 'Ask for a change and Spyda edits the layers. Every request is one step you can undo.'}
            </p>
          </div>
        ) : null}
        {entries.map(entry => (
          <div key={entry.id} className={entry.role === 'user' ? 'flex justify-end' : 'flex'}>
            <p className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-5 ${
              entry.role === 'user'
                ? 'rounded-br-md bg-primary/15 text-foreground'
                : entry.error
                  ? 'rounded-bl-md border border-destructive/30 bg-destructive/10 text-red-200'
                  : 'rounded-bl-md bg-white/[0.05] text-foreground/90'
            }`}>
              {entry.text}
            </p>
          </div>
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Spyda is designing…
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ideas.map(idea => (
          <button
            key={idea}
            type="button"
            onClick={() => {
              if (idea.endsWith(': ')) {
                setDraft(idea)
                inputRef.current?.focus()
              } else onSend(idea)
            }}
            disabled={busy}
            className="rounded-full bg-white/[0.05] px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.09] hover:text-foreground disabled:opacity-50"
          >
            {idea.replace(/: $/, '…')}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-[20px] border border-white/[0.08] bg-[#08090a] p-2">
        <label htmlFor="spyda-assist-input" className="sr-only">Ask Spyda AI</label>
        <textarea
          id="spyda-assist-input"
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={speech.listening ? 'Listening…' : blank ? 'Describe the design you want…' : 'Ask for a change…'}
          className="block w-full resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex items-center justify-end gap-1.5">
          {speech.supported ? (
            <button
              type="button"
              onClick={() => {
                if (speech.listening) speech.stop()
                else { spokenBase.current = draft.trim(); speech.start() }
              }}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Stop voice input' : 'Talk instead of typing'}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${speech.listening ? 'border-primary/60 bg-primary/15 text-primary' : 'border-white/[0.09] text-muted-foreground hover:text-foreground'}`}
            >
              {speech.listening ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.trim()}
            aria-label="Send to Spyda AI"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:bg-white/10 disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.4} />}
          </button>
        </div>
        {speech.error ? <p className="px-2 pt-1 text-[11px] text-amber-200">{speech.error}</p> : null}
      </div>
    </div>
  )
}
