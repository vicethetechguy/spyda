import { Image as ImageIcon, MousePointerClick, Sparkles, Square, Type, type LucideIcon } from '../ui/icons'
import type { NewLayerKind } from '../../lib/editor-objects'

/**
 * The floating tool pill over the canvas, Figma-style: select, then the four
 * things you can draw, then Spyda AI. Each tool names its shortcut.
 */

function CircleGlyph({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block rounded-full border-[1.6px] border-current ${className}`} />
}

type Tool = { id: 'select' | NewLayerKind; label: string; key: string; icon: LucideIcon | typeof CircleGlyph }

const TOOLS: Tool[] = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointerClick },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'circle', label: 'Circle', key: 'O', icon: CircleGlyph },
  { id: 'image', label: 'Image', key: 'I', icon: ImageIcon },
]

type CanvasToolbarProps = {
  onSelectTool: () => void
  onAdd: (kind: NewLayerKind) => void
  onAssist: () => void
  assistActive: boolean
}

export default function CanvasToolbar({ onSelectTool, onAdd, onAssist, assistActive }: CanvasToolbarProps) {
  return (
    <div role="toolbar" aria-label="Canvas tools" className="flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#121316]/95 p-1 shadow-[0_14px_40px_rgba(0,0,0,0.5)] backdrop-blur">
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          type="button"
          onClick={() => (tool.id === 'select' ? onSelectTool() : onAdd(tool.id))}
          title={`${tool.label} (${tool.key})`}
          aria-label={`${tool.label}, shortcut ${tool.key}`}
          className="group relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <tool.icon className="h-4 w-4" />
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-white/10" />
      <button
        type="button"
        onClick={onAssist}
        aria-pressed={assistActive}
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors sm:px-3.5 ${
          assistActive ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-primary/10'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" /> <span><span className="hidden min-[420px]:inline">Spyda </span>AI</span>
      </button>
    </div>
  )
}
