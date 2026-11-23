import { useMemo } from 'react'
import type { ObjectEffects } from '../../core/design-document'
import { DUOTONE_PRESETS, extractPalette, type ColorSwap } from '../../lib/image-colors'

/**
 * The colours of a picture layer: the main colours Spyda found in it, each
 * one clickable to change it everywhere it appears (keeping its shading),
 * plus duotone. Edits are layer effects, so the original picture stays intact
 * and Undo or Reset brings it back.
 */

type Patch = Record<string, unknown>

function ColorButton({ value, original, label, share, onChange, disabled }: { value: string; original?: string; label: string; share?: number; onChange: (hex: string) => void; disabled?: boolean }) {
  const changed = Boolean(original && original.toUpperCase() !== value.toUpperCase())
  return (
    <label title={changed ? `${original} → ${value}` : `${value}${share ? ` · ${Math.round(share * 100)}% of the picture` : ''}`} className={`group relative block cursor-pointer ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <span className="relative block h-9 overflow-hidden rounded-md ring-1 ring-inset ring-white/15 transition-transform group-hover:scale-[1.04] group-active:scale-95" style={{ background: value }}>
        {changed ? <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-tl-md ring-1 ring-black/30" style={{ background: original }} aria-hidden="true" /> : null}
      </span>
      <span className="mt-1 block truncate text-center font-mono text-[9px] text-muted-foreground">{share != null ? `${Math.round(share * 100)}%` : value}</span>
      <input type="color" aria-label={label} value={/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000'} onChange={event => onChange(event.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
  )
}

export default function ImageColorsPanel({ image, fx, onFx, disabled }: { image: HTMLImageElement; fx: ObjectEffects | undefined; onFx: (patch: Patch) => void; disabled?: boolean }) {
  // Read from the original picture: edits never feed back into what was detected.
  const palette = useMemo(() => extractPalette(image, 8), [image])
  const swaps = fx?.recolor ?? []
  const range = fx?.recolorRange ?? 60
  const duotone = fx?.duotone ?? null
  const changedCount = swaps.filter(swap => swap.from.toUpperCase() !== swap.to.toUpperCase()).length

  const setSwap = (from: string, to: string) => {
    const others = swaps.filter(swap => swap.from.toUpperCase() !== from.toUpperCase())
    const next: ColorSwap[] = from.toUpperCase() === to.toUpperCase() ? others : [...others, { from, to }]
    onFx({ recolor: next.length ? next : undefined })
  }

  return (
    <section className="border-b border-white/[0.06] px-0.5 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-foreground/90">Colours in this picture</h3>
        {changedCount || duotone ? (
          <button type="button" onClick={() => onFx({ recolor: undefined, recolorRange: undefined, duotone: null })} disabled={disabled} className="text-[10px] text-muted-foreground hover:text-foreground">Reset colours</button>
        ) : null}
      </div>

      {palette.length ? (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {palette.map(color => {
              const swap = swaps.find(entry => entry.from.toUpperCase() === color.hex.toUpperCase())
              return <ColorButton key={color.hex} value={swap?.to ?? color.hex} original={color.hex} share={color.share} label={`Change ${color.hex}`} onChange={to => setSwap(color.hex, to)} disabled={disabled} />
            })}
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">Click a colour to change it everywhere it appears. Shading and edges are kept.{changedCount ? ` ${changedCount} changed.` : ''}</p>
          {changedCount ? (
            <label className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="w-[62px] shrink-0">Match range</span>
              <input type="range" min={15} max={160} step={1} value={range} disabled={disabled} onChange={event => onFx({ recolorRange: Number(event.target.value) })} onDoubleClick={() => onFx({ recolorRange: undefined })} aria-label="Match range" className="min-w-0 flex-1 accent-[#9dfab0]" />
              <span className="w-7 text-right font-mono text-foreground/80">{range}</span>
            </label>
          ) : null}
        </>
      ) : (
        <p className="text-[10px] leading-4 text-muted-foreground">{image.complete ? 'No colours could be read from this picture.' : 'Reading the picture’s colours…'}</p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-semibold text-foreground/80">Duotone</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" disabled={disabled} onClick={() => onFx({ duotone: null })} className={`h-6 rounded-md px-2 text-[10px] font-medium transition-colors ${!duotone ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>None</button>
          {DUOTONE_PRESETS.map(preset => {
            const active = duotone?.shadow === preset.shadow && duotone.highlight === preset.highlight
            return (
              <button key={preset.name} type="button" disabled={disabled} title={`${preset.shadow} → ${preset.highlight}`} onClick={() => onFx({ duotone: { shadow: preset.shadow, highlight: preset.highlight, amount: duotone?.amount ?? 1 } })} className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors ${active ? 'bg-primary/20 text-primary ring-1 ring-primary/60' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>
                <span className="h-3 w-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${preset.shadow} 50%, ${preset.highlight} 50%)` }} aria-hidden="true" />
                {preset.name}
              </button>
            )
          })}
        </div>
        {duotone ? (
          <div className="mt-2 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div><p className="mb-1 text-[9px] text-muted-foreground">Shadows</p><ColorButton value={duotone.shadow} label="Duotone shadows colour" onChange={shadow => onFx({ duotone: { ...duotone, shadow } })} disabled={disabled} /></div>
              <div><p className="mb-1 text-[9px] text-muted-foreground">Highlights</p><ColorButton value={duotone.highlight} label="Duotone highlights colour" onChange={highlight => onFx({ duotone: { ...duotone, highlight } })} disabled={disabled} /></div>
            </div>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="w-[62px] shrink-0">Strength</span>
              <input type="range" min={0} max={1} step={0.01} value={duotone.amount} disabled={disabled} onChange={event => onFx({ duotone: { ...duotone, amount: Number(event.target.value) } })} aria-label="Duotone strength" className="min-w-0 flex-1 accent-[#9dfab0]" />
              <span className="w-7 text-right font-mono text-foreground/80">{Math.round(duotone.amount * 100)}</span>
            </label>
          </div>
        ) : null}
      </div>
    </section>
  )
}
