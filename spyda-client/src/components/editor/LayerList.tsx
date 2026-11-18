import {
  ArrowDown, ArrowUp, BadgeCheck, Copy, Eye, EyeOff, Image as ImageIcon, Lock,
  MousePointerClick, QrCode, Shapes, Sparkles, Square, Trash2, Type,
  type LucideIcon,
} from 'lucide-react'
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
  onSelect: (objectId: string) => void
  onReorder: (objectId: string, direction: 'up' | 'down') => void
  onToggleVisibility: (object: DesignObject) => void
  onDuplicate: (objectId: string) => void
  onRemove: (objectId: string) => void
}

function kindLabel(object: DesignObject) {
  if (object.kind === 'qr-code') return 'QR'
  return object.kind
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
  onSelect,
  onReorder,
  onToggleVisibility,
  onDuplicate,
  onRemove,
}: LayerListProps) {
  // Removed layers live on in history so undo can bring them back, not in the list.
  const ordered = objects
    .filter(object => !object.status.removed)
    .sort((left, right) => right.zIndex - left.zIndex)

  if (!ordered.length) {
    return (
      <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
        No layers yet. Extract them from the reference to start editing this flyer as objects.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {ordered.map(object => {
        const selected = object.id === selectedId
        const movable = !object.constraints.preserveLayerOrder && !object.protection.locked
        const hidden = !object.status.visible

        return (
          <li key={object.id}>
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
                onClick={() => onSelect(object.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-pressed={selected}
              >
                <LayerSwatch object={object} hidden={hidden} />
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
function LayerSwatch({ object, hidden }: { object: DesignObject; hidden: boolean }) {
  const Icon = KIND_ICONS[object.kind] ?? Shapes
  const fill = object.style.fill
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
