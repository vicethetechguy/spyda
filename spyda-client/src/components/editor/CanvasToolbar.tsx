import { Image as ImageIcon, MousePointerClick, Sparkles, Square, Type, type LucideIcon } from '../ui/icons'
import type { NewLayerKind } from '../../lib/editor-objects'

/**
 * The canvas tools: select, the things you can draw, then Spyda AI. A tool
 * column down the left edge on desktop, a floating pill on phones. Each tool
 * names its shortcut.
 */

function CircleGlyph({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block rounded-full border-[1.6px] border-current ${className}`} />
}

function LineGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PenGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3 18 13l-3 7H9l-3-7 6-10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 3v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12.5" r="1.4" fill="currentColor" />
    </svg>
  )
}

type Tool = { id: 'select' | 'pen' | Exclude<NewLayerKind, 'path'>; label: string; key: string; icon: LucideIcon | typeof CircleGlyph }

const TOOLS: Tool[] = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointerClick },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'circle', label: 'Ellipse', key: 'O', icon: CircleGlyph },
  { id: 'line', label: 'Line', key: 'L', icon: LineGlyph },
  { id: 'pen', label: 'Pen', key: 'P', icon: PenGlyph },
  { id: 'image', label: 'Image', key: 'I', icon: ImageIcon },
]

type CanvasToolbarProps = {
  onSelectTool: () => void
  onAdd: (kind: NewLayerKind) => void
  onPen: () => void
  penActive: boolean
  onAssist: () => void
  assistActive: boolean
  /** A floating pill (phones), or the tool column down the left edge (desktop). */
  orientation?: 'horizontal' | 'vertical'
}

export default function CanvasToolbar({ onSelectTool, onAdd, onPen, penActive, onAssist, assistActive, orientation = 'horizontal' }: CanvasToolbarProps) {
  const vertical = orientation === 'vertical'
  const isActive = (id: Tool['id']) => (id === 'pen' ? penActive : id === 'select' ? !penActive : false)
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation={orientation}
      className={vertical
        ? 'flex flex-col items-center gap-1'
        : 'flex items-center gap-0.5 rounded-full border border-white/[0.1] bg-[#121316]/95 p-0.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur'}
    >
      {TOOLS.map((tool, index) => (
        <span key={tool.id} className="contents">
          {vertical && (index === 1 || index === 6) ? <span aria-hidden="true" className="my-0.5 h-px w-6 bg-white/10" /> : null}
          <button
            type="button"
            onClick={() => (tool.id === 'select' ? onSelectTool() : tool.id === 'pen' ? onPen() : onAdd(tool.id))}
            aria-pressed={tool.id === 'pen' || tool.id === 'select' ? isActive(tool.id) : undefined}
            title={`${tool.label} (${tool.key})`}
            aria-label={`${tool.label}, shortcut ${tool.key}`}
            className={`group relative flex items-center justify-center transition-colors hover:bg-white/[0.08] hover:text-foreground ${
              vertical ? 'h-8 w-8 rounded-md' : 'h-8 w-8 rounded-full'
            } ${isActive(tool.id)
              ? tool.id === 'pen'
                ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                : vertical ? 'bg-white/[0.1] text-foreground ring-1 ring-white/15' : 'text-foreground'
              : 'text-muted-foreground'}`}
          >
            <tool.icon className="h-3.5 w-3.5" />
            {vertical ? (
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#1b1c1f] px-2 py-1 text-[11px] text-foreground shadow-lg group-hover:block">
                {tool.label} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{tool.key}</span>
              </span>
            ) : null}
          </button>
        </span>
      ))}
      <span className={vertical ? 'my-0.5 h-px w-6 bg-white/10' : 'mx-0.5 h-4 w-px bg-white/10'} />
      <button
        type="button"
        onClick={onAssist}
        aria-pressed={assistActive}
        title="Spyda AI"
        aria-label="Spyda AI"
        className={vertical
          ? `flex h-8 w-8 items-center justify-center rounded-md transition-colors ${assistActive ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`
          : `inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold transition-colors ${assistActive ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {vertical ? null : <span><span className="hidden min-[420px]:inline">Spyda </span>AI</span>}
      </button>
    </div>
  )
}
