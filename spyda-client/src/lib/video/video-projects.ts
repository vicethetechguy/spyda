import { deleteAsset, getAssetBlob, putAsset } from '../asset-store'
import type { MediaItem, VideoProject } from './timeline'

/**
 * Saved video projects. The edit itself (clips, titles, audio, size, frame
 * rate) and the media list live in localStorage; each imported file's bytes
 * live in IndexedDB under `vmedia-<media id>`, so a project survives a refresh
 * and can be reopened from the Media page. Built-in sound effects are not
 * stored: they are made again on every visit with the same ids.
 */

const KEY = 'spyda.videoProjects.v1'
const CURRENT = 'spyda.videoProjects.current'
export const VIDEO_PROJECTS_EVENT = 'spyda-video-projects'

export type SavedMedia = Omit<MediaItem, 'url'>

export type SavedVideoProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  format: string
  fps: number
  quality: string
  project: VideoProject
  media: SavedMedia[]
  folders: string[]
  /** A small frame of the edit, for the project list. */
  cover?: string | null
}

function read(): SavedVideoProject[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string') : []
  } catch {
    return []
  }
}

function write(projects: SavedVideoProject[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects))
    window.dispatchEvent(new CustomEvent(VIDEO_PROJECTS_EVENT))
    return true
  } catch (error) {
    console.warn('Spyda could not save the video project list.', error)
    return false
  }
}

export function listVideoProjects() {
  return read().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

export function readVideoProject(id: string) {
  return read().find(project => project.id === id) ?? null
}

/** Saves the project in place, or adds it. Returns false when the browser refused (storage full). */
export function saveVideoProject(project: SavedVideoProject) {
  const all = read()
  const index = all.findIndex(item => item.id === project.id)
  const next = index < 0 ? [project, ...all] : all.map(item => (item.id === project.id ? project : item))
  return write(next)
}

export function newVideoProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `video-${crypto.randomUUID()}` : `video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function blankVideoProject(name = 'Untitled video'): SavedVideoProject {
  const now = new Date().toISOString()
  return {
    id: newVideoProjectId(), name, createdAt: now, updatedAt: now,
    format: 'landscape', fps: 30, quality: 'high',
    project: { width: 1920, height: 1080, clips: [], titles: [], audio: [] },
    media: [], folders: [], cover: null,
  }
}

export function currentVideoProjectId() {
  try { return window.localStorage.getItem(CURRENT) } catch { return null }
}

export function setCurrentVideoProject(id: string) {
  try { window.localStorage.setItem(CURRENT, id) } catch { /* storage off */ }
}

/** Deletes a project and the media files no other project uses. */
export async function deleteVideoProject(id: string) {
  const all = read()
  const target = all.find(item => item.id === id)
  if (!target) return
  const rest = all.filter(item => item.id !== id)
  write(rest)
  const stillUsed = new Set(rest.flatMap(item => item.media.map(entry => entry.id)))
  for (const item of target.media) if (!item.sfx && !stillUsed.has(item.id)) await deleteAsset(mediaKey(item.id)).catch(() => undefined)
  if (currentVideoProjectId() === id) { try { window.localStorage.removeItem(CURRENT) } catch { /* storage off */ } }
}

const mediaKey = (id: string) => `vmedia-${id}`

export async function storeMediaFile(id: string, blob: Blob) {
  await putAsset(blob, mediaKey(id))
}

export async function loadMediaFile(id: string) {
  return getAssetBlob(mediaKey(id))
}

export async function forgetMediaFile(id: string) {
  await deleteAsset(mediaKey(id)).catch(() => undefined)
}
