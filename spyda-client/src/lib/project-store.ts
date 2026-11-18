/**
 * The saved-project list that the workspace library and the editor both read.
 *
 * Snapshots live in localStorage, which is why layer pixels never go here: an
 * asset reference points into IndexedDB instead (see `asset-store.ts`). This
 * module exists so the storage key and the read/patch shape have exactly one
 * definition while the editor and the legacy workspace share them.
 */

export const SAVED_PROJECTS_KEY = 'spyda.savedProjects.v1'
export const PROJECTS_UPDATED_EVENT = 'spyda-projects-updated'
const MAX_PROJECTS = 24

export type StoredProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  referencePreview?: string | null
  generatedImage?: string | null
  breakdown?: unknown
  [key: string]: unknown
}

export function readProjects(): StoredProject[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SAVED_PROJECTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string') : []
  } catch {
    return []
  }
}

export function readProject(id: string): StoredProject | null {
  return readProjects().find(project => project.id === id) ?? null
}

function writeProjects(projects: StoredProject[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(projects.slice(0, MAX_PROJECTS)))
    window.dispatchEvent(new CustomEvent(PROJECTS_UPDATED_EVENT))
  } catch (error) {
    // Quota is the expected failure here, and it is not fatal for the caller.
    console.warn('Spyda could not write the local project list.', error)
  }
}

/** Replaces a project in place, or puts a new one at the front. */
export function saveProject(project: StoredProject) {
  const existing = readProjects()
  const index = existing.findIndex(item => item.id === project.id)
  const next = index === -1
    ? [project, ...existing]
    : existing.map((item, itemIndex) => (itemIndex === index ? project : item))
  writeProjects(next)
}

/** Merges fields into an existing project, keeping everything else intact. */
export function patchProject(id: string, updates: Partial<StoredProject>): StoredProject | null {
  const existing = readProjects()
  const target = existing.find(project => project.id === id)
  if (!target) return null

  const merged: StoredProject = { ...target, ...updates, id, updatedAt: new Date().toISOString() }
  writeProjects(existing.map(project => (project.id === id ? merged : project)))
  return merged
}
