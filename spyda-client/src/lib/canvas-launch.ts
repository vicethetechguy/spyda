import { blankBreakdown, CANVAS_PRESETS, type CanvasPreset } from './editor-objects'
import { readProjects, saveProject } from './project-store'

/**
 * Opening Canvas mode goes straight to a canvas: the most recent design that
 * has layers, or a new blank one. Creating other sizes lives behind the
 * canvas's + Create button.
 */

function newProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `spyda-${crypto.randomUUID()}`
    : `spyda-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** The most recently edited design that can open in the canvas. */
export function latestCanvasProjectId(): string | null {
  const projects = readProjects()
    .filter(project => Boolean(project.breakdown))
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
  return projects[0]?.id ?? null
}

/** Saves a new blank design and returns its id. */
export function createBlankCanvasProject(preset: CanvasPreset = CANVAS_PRESETS[0]): string {
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
  return id
}

/** Where the Canvas mode button goes: the latest design, or a fresh blank canvas. */
export function canvasModePath() {
  return `/editor/${encodeURIComponent(latestCanvasProjectId() ?? createBlankCanvasProject())}`
}
