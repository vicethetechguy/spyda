import { blankBreakdown, CANVAS_PRESETS, type CanvasPreset } from './editor-objects'
import { patchProject, readProjects, saveProject, type StoredProject } from './project-store'

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

/**
 * Pages: a design can have several pages of the same size, side by side as
 * tabs. Each page is its own saved project that shares a `pageGroup` with the
 * first one, so it saves, exports and undoes on its own.
 */
export function designPages(projectId: string): StoredProject[] {
  const projects = readProjects()
  const current = projects.find(project => project.id === projectId)
  if (!current) return []
  const group = typeof current.pageGroup === 'string' ? current.pageGroup : null
  if (!group) return [current]
  return projects
    .filter(project => project.pageGroup === group)
    .sort((a, b) => Number(a.pageNumber ?? 1) - Number(b.pageNumber ?? 1))
}

/** Adds a blank page of the same size to the design `projectId` belongs to, and returns its id. */
export function addDesignPage(projectId: string, size: { width: number; height: number }): string | null {
  const current = readProjects().find(project => project.id === projectId)
  if (!current) return null
  const group = typeof current.pageGroup === 'string' ? current.pageGroup : current.id
  if (current.pageGroup !== group) patchProject(current.id, { pageGroup: group, pageNumber: 1 })
  const pages = readProjects().filter(project => project.pageGroup === group)
  const nextNumber = Math.max(1, ...pages.map(page => Number(page.pageNumber ?? 1))) + 1
  const id = newProjectId()
  const now = new Date().toISOString()
  const baseName = current.name.replace(/ · Page \d+$/, '')
  saveProject({
    id,
    name: `${baseName} · Page ${nextNumber}`,
    createdAt: now,
    updatedAt: now,
    referencePreview: null,
    generatedImage: null,
    breakdown: blankBreakdown({ id: 'page', name: 'Page', detail: '', width: Math.round(size.width), height: Math.round(size.height) }),
    pageGroup: group,
    pageNumber: nextNumber,
  })
  return id
}
