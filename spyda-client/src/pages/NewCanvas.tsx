import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from '../components/ui/icons'
import { blankBreakdown, CANVAS_PRESETS, type CanvasPreset } from '../lib/editor-objects'
import { saveProject } from '../lib/project-store'

/**
 * Canvas mode from nothing: pick a size, get a blank canvas, build the flyer
 * by hand or with Spyda AI. The blank project is stored like any other, so it
 * shows up in Projects and reopens in the editor.
 */

function newProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `spyda-${crypto.randomUUID()}`
    : `spyda-${Date.now().toString(36)}`
}

export default function NewCanvas() {
  const navigate = useNavigate()

  const start = (preset: CanvasPreset) => {
    const id = newProjectId()
    const now = new Date().toISOString()
    saveProject({
      id,
      name: `Untitled ${preset.name.toLowerCase()}`,
      createdAt: now,
      updatedAt: now,
      referencePreview: null,
      generatedImage: null,
      breakdown: blankBreakdown(preset),
    })
    navigate(`/editor/${encodeURIComponent(id)}`, { replace: true })
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-surface-raised px-4 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Spyda AI
        </button>

        <p className="mt-10 font-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Canvas mode</p>
        <h1 className="mt-3 font-heading text-[2.2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-5xl">Start a new design</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Pick a size. You get a blank canvas with text, shape and image tools, and Spyda AI beside it to lay out or restyle the design when you ask.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CANVAS_PRESETS.map(preset => {
            const landscape = preset.width > preset.height
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => start(preset)}
                className="group flex items-center gap-5 rounded-[24px] border border-white/[0.07] bg-surface p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 active:translate-y-0 active:scale-[0.99]"
              >
                <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-[#08090a]">
                  <span
                    className="block rounded-md border border-white/25 bg-white transition-transform duration-200 group-hover:scale-105"
                    style={{
                      width: landscape ? 72 : Math.round(72 * (preset.width / preset.height)),
                      height: landscape ? Math.round(72 * (preset.height / preset.width)) : 72,
                    }}
                  />
                </span>
                <span>
                  <span className="block font-heading text-lg font-semibold">{preset.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{preset.detail}</span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Have a flyer already? Import it in Spyda AI and open Canvas mode from there to edit its layers.
        </p>
      </div>
    </main>
  )
}
