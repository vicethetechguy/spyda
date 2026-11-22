import { useEffect, useRef, useState } from 'react'

/**
 * The desktop-app menu bar over canvas mode: File, Edit, Object and the rest,
 * each a dropdown of commands with their shortcuts. Once one menu is open,
 * hovering another opens it, as in a native app; Escape or a click outside
 * closes it.
 */

export type MenuCommand =
  | { separator: true }
  | {
    label: string
    shortcut?: string
    onSelect: () => void
    disabled?: boolean
    /** Shows a tick, for toggles such as "Show layers". */
    checked?: boolean
  }

export type EditorMenu = { label: string; items: MenuCommand[] }

export default function EditorMenuBar({ menus }: { menus: EditorMenu[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open === null) return
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(null) }
      if (event.key === 'ArrowRight') setOpen(current => (current === null ? current : (current + 1) % menus.length))
      if (event.key === 'ArrowLeft') setOpen(current => (current === null ? current : (current - 1 + menus.length) % menus.length))
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menus.length, open])

  return (
    <div ref={barRef} role="menubar" aria-label="Canvas menu" className="flex items-center">
      {menus.map((menu, index) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => setOpen(current => (current === index ? null : index))}
            onPointerEnter={() => { if (open !== null) setOpen(index) }}
            className={`h-7 rounded px-2 text-[12px] transition-colors ${open === index ? 'bg-white/[0.1] text-foreground' : 'text-foreground/80 hover:bg-white/[0.06] hover:text-foreground'}`}
          >
            {menu.label}
          </button>
          {open === index ? (
            <div role="menu" aria-label={menu.label} className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-white/[0.1] bg-[#1b1c1f] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
              {menu.items.map((item, itemIndex) => 'separator' in item ? (
                <div key={`sep-${itemIndex}`} role="separator" className="my-1 h-px bg-white/[0.07]" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => { setOpen(null); item.onSelect() }}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-foreground/90 transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:text-muted-foreground/40"
                >
                  <span className="w-3 text-[10px]">{item.checked ? '✓' : ''}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut ? <span className="font-mono text-[10px] opacity-60">{item.shortcut}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
