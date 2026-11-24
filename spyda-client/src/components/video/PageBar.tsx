import { Clapperboard, Download, Image as ImageIcon, Library, Palette, Scissors, Sparkles, type LucideIcon } from '../ui/icons'
import type { StudioPage } from '../../lib/video/studio-pages'

/**
 * The studio's pages, one job each, left to right in the order a video is
 * made: organise media, make stills, cut, edit, colour, add effects, export.
 * Pages that are still being built show as "Soon" and say what they will do.
 */

const PAGES: Array<{ id: StudioPage; label: string; icon: LucideIcon; key: string; soon?: string; hint: string }> = [
  { id: 'media', label: 'Media', icon: Library, key: '1', hint: 'Bring in and organise your files' },
  { id: 'photo', label: 'Photo', icon: ImageIcon, key: '2', hint: 'Make stills and graphics in the canvas' },
  { id: 'cut', label: 'Cut', icon: Scissors, key: '3', hint: 'Rough cut, fast: add to end, insert, on top, trim to the playhead' },
  { id: 'edit', label: 'Edit', icon: Clapperboard, key: '4', hint: 'The timeline: clips, titles, music and effects' },
  { id: 'color', label: 'Color', icon: Palette, key: '5', soon: 'Colour wheels, curves and scopes', hint: 'Make it look right' },
  { id: 'mixer', label: 'Mixer', icon: Sparkles, key: '6', soon: 'Layers on top of a clip: text, shapes, masks, green screen', hint: 'Effects and motion graphics' },
  { id: 'export', label: 'Export', icon: Download, key: '7', hint: 'Presets for every platform, then download' },
]

export default function PageBar({ page, onChange }: { page: StudioPage; onChange: (page: StudioPage) => void }) {
  return (
    <nav aria-label="Studio pages" className="mac-pagebar flex h-12 shrink-0 items-center justify-center border-t border-white/[0.06] bg-[#111214] px-3">
      <div role="tablist" aria-label="Pages" className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.07]">
        {PAGES.map(item => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={Boolean(item.soon)}
              onClick={() => onChange(item.id)}
              title={item.soon ? `${item.label}, coming soon: ${item.soon}` : `${item.label}: ${item.hint} (Shift+${item.key})`}
              className={`relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-semibold transition-colors ${active ? 'bg-white/[0.14] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_3px_rgba(0,0,0,0.35)]' : item.soon ? 'cursor-default text-muted-foreground/45' : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'}`}
            >
              <item.icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : ''}`} />
              {item.label}
              {item.soon ? <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[8px] font-medium uppercase tracking-wider">Soon</span> : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

