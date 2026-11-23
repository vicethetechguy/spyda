import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from './icons'

/**
 * Spyda's dropdown. Native <select> menus are drawn by the operating system
 * (white, unstyled, often unreadable on the dark editors), so every editor
 * uses this instead: a rounded, animated dark card, opened in a portal so a
 * scrolling panel never clips it, with full keyboard support.
 */

export type SpydaOption<T extends string | number> = {
  value: T
  label: ReactNode
  /** Plain text for type-to-find and the closed button, when `label` is not a string. */
  text?: string
  hint?: ReactNode
  /** Style for the option's label, e.g. a font preview. */
  style?: CSSProperties
  disabled?: boolean
}

type Props<T extends string | number> = {
  value: T
  options: Array<SpydaOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
  /** Classes for the closed button (size, background, radius). */
  className?: string
  /** Width of the open card; defaults to the button's width (at least 160px). */
  menuWidth?: number
  placeholder?: string
  id?: string
  /** Called as the menu opens (e.g. to load the fonts it previews). */
  onOpen?: () => void
}

const MENU_GAP = 6
const MAX_HEIGHT = 300

export default function SpydaSelect<T extends string | number>({ value, options, onChange, ariaLabel, disabled, className, menuWidth, placeholder, id, onOpen }: Props<T>) {
  const [open, setOpen] = useState(false)
  /** The card stays mounted briefly after closing, to fold away. */
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(0)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()
  const selectedIndex = options.findIndex(option => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const position = useCallback(() => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.max(menuWidth ?? rect.width, 160)
    const below = window.innerHeight - rect.bottom - MENU_GAP - 8
    const above = rect.top - MENU_GAP - 8
    const up = below < Math.min(MAX_HEIGHT, options.length * 34 + 12) && above > below
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
    setPlace({ left, width, up, top: up ? rect.top - MENU_GAP : rect.bottom + MENU_GAP, maxHeight: Math.min(MAX_HEIGHT, up ? above : below) })
  }, [menuWidth, options.length])

  const openMenu = () => {
    if (disabled) return
    onOpen?.()
    position()
    window.clearTimeout(closeTimer.current)
    setClosing(false)
    setActive(Math.max(0, selectedIndex))
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    setClosing(true)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setClosing(false), 150)
    if (focus) button.current?.focus()
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close()
  }

  useLayoutEffect(() => {
    if (!open) return
    const item = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!list.current?.contains(target) && !button.current?.contains(target)) close(false)
    }
    const reflow = () => position()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [open, position])

  const step = (from: number, delta: number) => {
    for (let k = 1; k <= options.length; k++) {
      const index = (from + delta * k + options.length * k) % options.length
      if (!options[index]?.disabled) return index
    }
    return from
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu() }
      return
    }
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(event.key === 'Escape'); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => step(current, 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => step(current, -1)) }
    else if (event.key === 'Home') { event.preventDefault(); setActive(step(-1, 1)) }
    else if (event.key === 'End') { event.preventDefault(); setActive(step(options.length, -1)) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active) }
    else if (event.key.length === 1) {
      // Type to jump to an option.
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase(), at: now }
      const found = options.findIndex(option => !option.disabled && textOf(option).toLowerCase().startsWith(typed.current.text))
      if (found >= 0) setActive(found)
    }
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`group inline-flex min-w-0 items-center justify-between gap-1.5 text-left text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-40 ${open ? 'ring-1 ring-primary/50' : ''} ${className ?? 'h-7 rounded-md bg-white/[0.05] px-2 text-[11px] hover:bg-white/[0.08]'}`}
      >
        <span className="min-w-0 truncate" style={selected?.style}>{selected ? selected.label : <span className="text-muted-foreground">{placeholder ?? 'Choose…'}</span>}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180 text-primary' : ''}`} aria-hidden />
      </button>
      {(open || closing) && place ? createPortal(
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          data-up={place.up}
          data-closing={!open && closing}
          onKeyDown={onKeyDown}
          className="spyda-select-menu fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-white/[0.1] bg-[#15161a]/95 p-1 text-foreground shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(157,250,176,0.05)] backdrop-blur-xl [scrollbar-width:thin]"
          style={{
            left: place.left,
            width: place.width,
            maxHeight: place.maxHeight,
            ...(place.up ? { bottom: window.innerHeight - place.top } : { top: place.top }),
            transformOrigin: place.up ? 'bottom center' : 'top center',
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <div
                key={String(option.value)}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={index === active}
                style={{ '--i': index } as CSSProperties}
                onPointerEnter={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12px] transition-colors ${option.disabled ? 'cursor-not-allowed opacity-40' : ''} ${index === active ? 'bg-white/[0.08]' : ''} ${isSelected ? 'text-primary' : 'text-foreground/90'}`}
              >
                <span className="min-w-0 flex-1 truncate" style={option.style}>{option.label}</span>
                {option.hint ? <span className="shrink-0 text-[10px] text-muted-foreground">{option.hint}</span> : null}
                <Check className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
              </div>
            )
          })}
        </div>,
        document.body,
      ) : null}
    </>
  )
}

function textOf<T extends string | number>(option: SpydaOption<T>) {
  return option.text ?? (typeof option.label === 'string' ? option.label : String(option.value))
}
