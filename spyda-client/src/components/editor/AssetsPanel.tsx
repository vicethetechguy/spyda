import { useMemo, useState } from 'react'
import { Copy, EyeOff, ImagePlus, Type } from '../ui/icons'
import type { DesignObject } from '../../core/design-document'

/**
 * Everything the design uses, in one place: its pictures and logos, its fonts
 * and its colours, each with how many layers use it. Clicking any of them
 * selects those layers on the canvas, so nothing is hard to find.
 */

type Props = {
  objects: DesignObject[]
  images: Record<string, HTMLImageElement | undefined>
  selectedIds: string[]
  onSelect: (objectIds: string[], additive: boolean) => void
  onAddPicture: () => void
}

type PictureUse = { key: string; src: string | undefined; name: string; kind: string; ids: string[]; hidden: boolean }

const KIND_NAMES: Record<string, string> = { image: 'Picture', background: 'Background', logo: 'Logo', icon: 'Icon', 'qr-code': 'QR code' }

function Heading({ title, count, action }: { title: string; count: number; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 flex items-center justify-between first:mt-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title} <span className="ml-1 rounded bg-white/[0.06] px-1 font-mono text-[9px] normal-case tracking-normal">{count}</span></h4>
      {action}
    </div>
  )
}

export default function AssetsPanel({ objects, images, selectedIds, onSelect, onAddPicture }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const live = useMemo(() => objects.filter(object => !object.status.removed), [objects])

  const pictures = useMemo(() => {
    const byKey = new Map<string, PictureUse>()
    for (const object of [...live].sort((a, b) => b.zIndex - a.zIndex)) {
      const ref = object.content.assetRef
      if (!ref || !['image', 'background', 'logo', 'icon', 'qr-code'].includes(object.kind)) continue
      const use = byKey.get(ref) ?? { key: ref, src: images[ref]?.src, name: object.name || KIND_NAMES[object.kind] || 'Picture', kind: KIND_NAMES[object.kind] ?? 'Picture', ids: [], hidden: true }
      use.ids.push(object.id)
      use.hidden = use.hidden && !object.status.visible
      byKey.set(ref, use)
    }
    return [...byKey.values()]
  }, [images, live])

  const fonts = useMemo(() => {
    const byFamily = new Map<string, { family: string; weights: Set<string>; ids: string[] }>()
    for (const object of live) {
      if (object.kind !== 'text' && object.kind !== 'action') continue
      const family = object.style.fontFamily || 'Default'
      const entry = byFamily.get(family) ?? { family, weights: new Set<string>(), ids: [] }
      entry.weights.add(object.style.fontWeight || '400')
      entry.ids.push(object.id)
      byFamily.set(family, entry)
    }
    return [...byFamily.values()].sort((a, b) => b.ids.length - a.ids.length)
  }, [live])

  const colours = useMemo(() => {
    const byHex = new Map<string, string[]>()
    for (const object of live) {
      for (const value of [object.style.fill, object.style.stroke]) {
        if (typeof value !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(value)) continue
        const hex = value.toUpperCase()
        const ids = byHex.get(hex) ?? []
        if (!ids.includes(object.id)) ids.push(object.id)
        byHex.set(hex, ids)
      }
    }
    return [...byHex.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [live])

  const isSelected = (ids: string[]) => ids.length > 0 && ids.every(id => selectedIds.includes(id))
  const pick = (ids: string[], event: React.MouseEvent) => onSelect(ids, event.shiftKey || event.metaKey || event.ctrlKey)
  const uses = (count: number) => (count === 1 ? 'Used once' : `Used ${count}×`)

  return (
    <div className="editor-dense px-1 pb-1">
      <Heading title="Pictures & logos" count={pictures.length} action={<button type="button" onClick={onAddPicture} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><ImagePlus className="h-3 w-3" /> Add</button>} />
      {pictures.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {pictures.map(picture => (
            <button
              key={picture.key}
              type="button"
              onClick={event => pick(picture.ids, event)}
              title={`${picture.name} · ${uses(picture.ids.length)}. Click to select it on the canvas.`}
              className={`group relative overflow-hidden rounded-md border text-left transition-colors ${isSelected(picture.ids) ? 'border-primary ring-1 ring-primary/50' : 'border-white/[0.08] hover:border-white/25'}`}
            >
              <span className="block aspect-square bg-[repeating-conic-gradient(#1c1d21_0%_25%,#141518_0%_50%)] bg-[length:10px_10px]">
                {picture.src ? <img src={picture.src} alt="" draggable={false} className={`h-full w-full object-contain ${picture.hidden ? 'opacity-40' : ''}`} /> : <span className="flex h-full items-center justify-center text-[9px] text-muted-foreground">Loading</span>}
              </span>
              <span className="block truncate px-1 pt-0.5 text-[9px] font-medium">{picture.name}</span>
              <span className="flex items-center gap-1 px-1 pb-0.5 text-[8px] text-muted-foreground">{picture.kind} · {picture.ids.length}×{picture.hidden ? <EyeOff className="h-2.5 w-2.5" /> : null}</span>
            </button>
          ))}
        </div>
      ) : <p className="rounded-md bg-white/[0.02] px-2 py-2 text-[10px] text-muted-foreground">No pictures yet. Add one, or use Magic layers to lift them out of a flyer.</p>}

      <Heading title="Fonts" count={fonts.length} />
      {fonts.length ? (
        <ul className="space-y-1">
          {fonts.map(font => (
            <li key={font.family}>
              <button type="button" onClick={event => pick(font.ids, event)} title="Click to select every text layer in this font" className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${isSelected(font.ids) ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06] hover:border-white/20'}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[13px]" style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}>Aa</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium" style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}>{font.family}</span>
                  <span className="block text-[9px] text-muted-foreground">{[...font.weights].sort().join(' · ')} · {font.ids.length} text {font.ids.length === 1 ? 'layer' : 'layers'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="flex items-center gap-1.5 rounded-md bg-white/[0.02] px-2 py-2 text-[10px] text-muted-foreground"><Type className="h-3 w-3" /> No text yet.</p>}

      <Heading title="Colours" count={colours.length} />
      {colours.length ? (
        <div className="flex flex-wrap gap-1.5">
          {colours.map(([hex, ids]) => (
            <span key={hex} className={`group flex items-center gap-1 rounded-md border py-0.5 pl-0.5 pr-1 ${isSelected(ids) ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06]'}`}>
              <button type="button" onClick={event => pick(ids, event)} title={`${hex} · ${uses(ids.length)}. Click to select those layers.`} className="h-5 w-5 rounded border border-black/30" style={{ backgroundColor: hex }} aria-label={`Select layers using ${hex}`} />
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(hex); setCopied(hex); window.setTimeout(() => setCopied(current => (current === hex ? null : current)), 1200) }} title="Copy the HEX code" className="flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground">
                {copied === hex ? 'Copied' : hex}<Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
              </button>
              <span className="font-mono text-[8px] text-muted-foreground">{ids.length}</span>
            </span>
          ))}
        </div>
      ) : <p className="rounded-md bg-white/[0.02] px-2 py-2 text-[10px] text-muted-foreground">No colours yet.</p>}
    </div>
  )
}
