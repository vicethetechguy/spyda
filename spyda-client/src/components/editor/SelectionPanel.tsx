import type { ReactElement } from 'react'
import type { DesignObject } from '../../core/design-document'
import { Copy, Layers, Trash2 } from '../ui/icons'
import EffectsPanel from './EffectsPanel'

/**
 * The inspector for several layers at once: align them to each other (or to
 * the frame), spread them evenly, group or ungroup them, and give them all the
 * same effects, opacity or animation in one undoable step.
 */

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

const ALIGN_GLYPHS: Record<AlignMode, ReactElement> = {
  left: <><path d="M4 3v18" /><rect x="7" y="6" width="11" height="4" rx="1" /><rect x="7" y="14" width="7" height="4" rx="1" /></>,
  center: <><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>,
  right: <><path d="M20 3v18" /><rect x="6" y="6" width="11" height="4" rx="1" /><rect x="10" y="14" width="7" height="4" rx="1" /></>,
  top: <><path d="M3 4h18" /><rect x="6" y="7" width="4" height="11" rx="1" /><rect x="14" y="7" width="4" height="7" rx="1" /></>,
  middle: <><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>,
  bottom: <><path d="M3 20h18" /><rect x="6" y="6" width="4" height="11" rx="1" /><rect x="14" y="10" width="4" height="7" rx="1" /></>,
}

function Glyph({ children }: { children: ReactElement }) {
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

const button = 'flex h-7 flex-1 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-30'

export default function SelectionPanel({
  objects, onAlign, onDistribute, onGroup, onUngroup, onDuplicate, onDelete, onOpacity, onFx, onPreview, alignTo, onAlignTo,
}: {
  objects: DesignObject[]
  onAlign: (mode: AlignMode) => void
  onDistribute: (axis: 'x' | 'y') => void
  onGroup: () => void
  onUngroup: () => void
  onDuplicate: () => void
  onDelete: () => void
  onOpacity: (value: number) => void
  onFx: (patch: Record<string, unknown>) => void
  onPreview?: () => void
  alignTo: 'selection' | 'frame'
  onAlignTo: (value: 'selection' | 'frame') => void
}) {
  const groupIds = new Set(objects.map(object => object.relationships.groupId))
  const oneGroup = groupIds.size === 1 && !groupIds.has(null)
  const anyGrouped = objects.some(object => object.relationships.groupId)
  const opacity = Math.round((objects.reduce((sum, object) => sum + object.transform.opacity, 0) / objects.length) * 100)

  return (
    <div className="text-[11px]">
      <div className="flex items-center gap-2 px-0.5 pb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary"><Layers className="h-3.5 w-3.5" /></span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold">{oneGroup ? 'Group' : `${objects.length} layers`}</p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{oneGroup ? `${objects.length} layers, moving as one` : 'Shift-click to add or remove'}</p>
        </div>
      </div>

      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-foreground/90">Align</h3>
          <div className="flex rounded-md bg-white/[0.04] p-0.5 text-[9px]">
            {(['selection', 'frame'] as const).map(value => (
              <button key={value} type="button" onClick={() => onAlignTo(value)} aria-pressed={alignTo === value} className={`rounded px-1.5 py-0.5 capitalize ${alignTo === value ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground'}`}>
                {value === 'selection' ? 'To each other' : 'To frame'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
          {(Object.keys(ALIGN_GLYPHS) as AlignMode[]).map(mode => (
            <button key={mode} type="button" onClick={() => onAlign(mode)} title={`Align ${mode}`} aria-label={`Align ${mode}`} className={button}>
              <Glyph>{ALIGN_GLYPHS[mode]}</Glyph>
            </button>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => onDistribute('x')} disabled={objects.length < 3} title="Equal gaps from left to right" className="h-7 rounded-md bg-white/[0.05] text-[10px] font-medium hover:bg-white/[0.1] disabled:opacity-40">Spread across</button>
          <button type="button" onClick={() => onDistribute('y')} disabled={objects.length < 3} title="Equal gaps from top to bottom" className="h-7 rounded-md bg-white/[0.05] text-[10px] font-medium hover:bg-white/[0.1] disabled:opacity-40">Spread down</button>
        </div>
      </section>

      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <h3 className="mb-2 text-[10px] font-semibold text-foreground/90">Group</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onGroup} disabled={oneGroup} className="h-7 rounded-md bg-primary text-[10px] font-semibold text-primary-foreground disabled:opacity-40">Group · Ctrl+G</button>
          <button type="button" onClick={onUngroup} disabled={!anyGrouped} className="h-7 rounded-md bg-white/[0.05] text-[10px] font-medium hover:bg-white/[0.1] disabled:opacity-40">Ungroup</button>
        </div>
        <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">A group selects, moves and animates as one. Alt-click picks one layer inside it.</p>
      </section>

      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <h3 className="mb-2 text-[10px] font-semibold text-foreground/90">Opacity</h3>
        <span className="flex items-center gap-2">
          <input type="range" aria-label="Opacity of the selection" min={0} max={100} value={opacity} onChange={event => onOpacity(Number(event.target.value) / 100)} className="min-w-0 flex-1 accent-[#9dfab0]" />
          <span className="w-8 text-right font-mono text-[10px]">{opacity}%</span>
        </span>
      </section>

      {/* Effects and animation edit every selected layer; the first one shows the current values. */}
      <EffectsPanel object={objects[0]} onFx={onFx} onPreview={onPreview} />

      <section className="px-0.5 py-2.5">
        <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
          <button type="button" onClick={onDuplicate} title="Duplicate all (Ctrl+D)" aria-label="Duplicate selection" className={button}><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDelete} title="Delete all (Del)" aria-label="Delete selection" className={button}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </section>
    </div>
  )
}
