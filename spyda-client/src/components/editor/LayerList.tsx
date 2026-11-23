import { useState } from 'react'
import {
  ArrowDown, ArrowUp, BadgeCheck, ChevronRight, Copy, Eye, EyeOff, Image as ImageIcon, Layers, Lock,
  MousePointerClick, QrCode, Shapes, Sparkles, Square, Trash2, Type,
  type LucideIcon,
} from '../ui/icons'
import type { DesignObject } from '../../core/design-document'

/**
 * The layer stack, top of the canvas first.
 *
 * Reorder is refused where `preserveLayerOrder` is set, because that constraint
 * exists precisely to stop a detected stack from being reshuffled. Locked layers
 * show a lock instead of reorder arrows, matching the canvas having no handles.
 */

export type LayerListProps = {
  objects: DesignObject[]
  selectedId: string | null
  /** Every selected layer, when several are. */
  selectedIds?: string[]
  /** Shift- or Ctrl-click toggles a layer in and out of the selection. */
  onSelect: (objectId: string, mode?: 'replace' | 'toggle') => void
  onReorder: (objectId: string, direction: 'up' | 'down') => void
  onToggleVisibility: (object: DesignObject) => void
  onDuplicate: (objectId: string) => void
  onRemove: (objectId: string) => void
  /** The picture a layer shows, for its thumbnail. */
  thumbnail?: (object: DesignObject) => string | undefined
  /** Only layers whose name or text contains this. */
  query?: string
}

const KIND_NAMES: Partial<Record<DesignObject['kind'], string>> = {
  text: 'Text', image: 'Picture', logo: 'Logo', icon: 'Icon', 'qr-code': 'QR code', action: 'Button',
  background: 'Background', shape: 'Shape', decor: 'Decoration', group: 'Group',
}

function kindLabel(object: DesignObject) {
  return KIND_NAMES[object.kind] ?? object.kind
}

const KIND_ICONS: Partial<Record<DesignObject['kind'], LucideIcon>> = {
  text: Type,
  image: ImageIcon,
  logo: BadgeCheck,
  icon: Sparkles,
  'qr-code': QrCode,
  action: MousePointerClick,
  background: Square,
}

function layerTitle(object: DesignObject) {
  const text = object.content.text?.trim()
  if (text) return text
  const description = object.content.description?.trim()
  if (description) return description
  return object.name
}

export default function LayerList({
  objects,
  selectedId,
  selectedIds,
  onSelect,
  onReorder,
  onToggleVisibility,
  onDuplicate,
  onRemove,
  thumbnail,
  query = '',
}: LayerListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const needle = query.trim().toLowerCase()
  // Removed layers live on in history so undo can bring them back, not in the list.
  const ordered = objects
    .filter(object => !object.status.removed)
    .filter(object => !needle || `${layerTitle(object)} ${object.name} ${kindLabel(object)}`.toLowerCase().includes(needle))
    .sort((left, right) => right.zIndex - left.zIndex)

  if (!ordered.length) {
    return (
      <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
        {needle ? `No layer matches “${query.trim()}”.` : 'No layers yet. Add text, pictures or shapes, or use Magic layers on a flyer.'}
      </p>
    )
  }

  // Grouped layers sit together under their group, at the position of the group's top layer.
  const rows: Array<{ type: 'group'; id: string; members: DesignObject[] } | { type: 'layer'; object: DesignObject; nested: boolean }> = []
  const placedGroups = new Set<string>()
  for (const object of ordered) {
    const group = object.relationships.groupId
    if (!group) { rows.push({ type: 'layer', object, nested: false }); continue }
    if (placedGroups.has(group)) continue
    placedGroups.add(group)
    const members = ordered.filter(item => item.relationships.groupId === group)
    if (members.length < 2) { rows.push({ type: 'layer', object, nested: false }); continue }
    rows.push({ type: 'group', id: group, members })
    if (!collapsed.has(group)) for (const member of members) rows.push({ type: 'layer', object: member, nested: true })
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map(row => {
        if (row.type === 'group') {
          const open = !collapsed.has(row.id)
          const allSelected = row.members.every(member => (selectedIds ?? [selectedId]).includes(member.id))
          return (
            <li key={`group-${row.id}`}>
              <div className={`flex items-center gap-1 rounded-lg border px-1 py-1 ${allSelected ? 'border-primary/40 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                <button type="button" onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} aria-label={open ? 'Collapse group' : 'Expand group'} aria-expanded={open} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                <button type="button" onClick={event => onSelect(row.members[0].id, event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace')} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10 text-primary"><Layers className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">Group</span>
                    <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{row.members.length} layers</span>
                  </span>
                </button>
              </div>
            </li>
          )
        }
        const object = row.object
        const selected = selectedIds ? selectedIds.includes(object.id) : object.id === selectedId
        const movable = !object.constraints.preserveLayerOrder && !object.protection.locked
        const hidden = !object.status.visible

        return (
          <li key={object.id} className={row.nested ? 'ml-4 border-l border-white/[0.08] pl-1.5' : undefined}>
            <div
              className={[
                'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                selected
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-transparent hover:border-white/10 hover:bg-white/[0.035]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={event => onSelect(object.id, event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace')}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-pressed={selected}
              >
                <LayerSwatch object={object} hidden={hidden} src={thumbnail?.(object)} />
                <span className="min-w-0">
                  <span className={[
                    'block truncate text-[13px] font-medium',
                    hidden ? 'text-muted-foreground line-through' : 'text-foreground',
                  ].join(' ')}>
                    {layerTitle(object)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {object.protection.locked ? <Lock className="h-2.5 w-2.5" aria-hidden /> : null}
                    {kindLabel(object)}
                    {object.relationships.groupId && !row.nested ? <span className="rounded bg-primary/15 px-1 normal-case tracking-normal text-primary">group</span> : null}
                    {hidden ? <span className="normal-case tracking-normal">· hidden</span> : null}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onReorder(object.id, 'up')}
                  disabled={!movable}
                  title={movable ? 'Bring forward' : 'Layer order is protected'}
                  aria-label={`Bring ${object.name} forward`}
                  className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(object.id, 'down')}
                  disabled={!movable}
                  title={movable ? 'Send backward' : 'Layer order is protected'}
                  aria-label={`Send ${object.name} backward`}
                  className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleVisibility(object)}
                  title={hidden ? 'Show layer' : 'Hide layer'}
                  aria-label={hidden ? `Show ${object.name}` : `Hide ${object.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  {hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(object.id)}
                  title="Duplicate layer"
                  aria-label={`Duplicate ${object.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(object.id)}
                  title="Remove layer"
                  aria-label={`Remove ${object.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** What the layer is at a glance: its kind, tinted with its own colour if it has one. */
function LayerSwatch({ object, hidden, src }: { object: DesignObject; hidden: boolean; src?: string }) {
  const Icon = KIND_ICONS[object.kind] ?? Shapes
  const fill = object.style.fill
  if (src) {
    return (
      <span aria-hidden className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-white/15 bg-[repeating-conic-gradient(#1c1d21_0%_25%,#141518_0%_50%)] bg-[length:8px_8px] ${hidden ? 'opacity-40' : ''}`}>
        <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
      </span>
    )
  }
  if (object.kind === 'text' || object.kind === 'action') {
    return (
      <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-white/[0.06] text-[11px] font-semibold ${hidden ? 'opacity-40' : ''}`} style={{ color: fill || undefined, fontFamily: object.style.fontFamily ? `"${object.style.fontFamily}", system-ui, sans-serif` : undefined }}>
        Aa
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={[
        'relative flex h-6 w-6 shrink-0 items-center justify-center rounded border',
        hidden ? 'border-white/10 text-muted-foreground/40' : 'border-white/15 bg-white/[0.06] text-muted-foreground',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {fill && !hidden ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black/50"
          style={{ backgroundColor: fill }}
        />
      ) : null}
    </span>
  )
}
