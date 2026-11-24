import { assetIdToRef, getAssetBlob, putAsset } from './asset-store'
import { saveProject, type StoredProject } from './project-store'

/**
 * A Spyda design package: an editable design and every file it uses, in one
 * file, so a design can be sold on the marketplace and opened by the buyer in
 * the editor with all its layers (flyers) or clips, titles and music (video).
 *
 * Layout: the magic line, a 4-byte little-endian header length, the header as
 * JSON, then each file's bytes one after another at the offsets the header gives.
 */

const MAGIC = 'SPYDAPKG1\n'
export const PACKAGE_TYPE = 'application/vnd.spyda.design'
export const PACKAGE_EXTENSION = 'spyda'

export type PackageKind = 'flyer' | 'video'
export type PackageFile = { key: string; name: string; type: string; blob: Blob }
export type DesignPackage<T = unknown> = { version: 1; kind: PackageKind; name: string; createdAt: string; data: T; files: PackageFile[] }

type Header = Omit<DesignPackage, 'files'> & { files: Array<Omit<PackageFile, 'blob'> & { offset: number; size: number }> }

export async function encodePackage(pkg: Omit<DesignPackage, 'version' | 'createdAt'>): Promise<Blob> {
  let offset = 0
  const files = pkg.files.map(file => {
    const entry = { key: file.key, name: file.name, type: file.type, offset, size: file.blob.size }
    offset += file.blob.size
    return entry
  })
  const header: Header = { version: 1, kind: pkg.kind, name: pkg.name, createdAt: new Date().toISOString(), data: pkg.data, files }
  const json = new TextEncoder().encode(JSON.stringify(header))
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, json.length, true)
  return new Blob([MAGIC, length, json, ...pkg.files.map(file => file.blob)], { type: PACKAGE_TYPE })
}

export async function decodePackage(blob: Blob): Promise<DesignPackage> {
  const magicLength = new TextEncoder().encode(MAGIC).length
  const head = new Uint8Array(await blob.slice(0, magicLength + 4).arrayBuffer())
  if (new TextDecoder().decode(head.slice(0, magicLength)) !== MAGIC) throw new Error('This is not a Spyda design file.')
  const headerLength = new DataView(head.buffer).getUint32(magicLength, true)
  const start = magicLength + 4
  if (headerLength <= 0 || start + headerLength > blob.size) throw new Error('This Spyda design file is damaged.')
  const header = JSON.parse(await blob.slice(start, start + headerLength).text()) as Header
  if (header.version !== 1) throw new Error('This design was made with a newer Spyda. Refresh to update.')
  const body = start + headerLength
  return {
    ...header,
    files: header.files.map(file => ({ key: file.key, name: file.name, type: file.type, blob: blob.slice(body + file.offset, body + file.offset + file.size, file.type) })),
  }
}

// ── Flyers ─────────────────────────────────────────────────────────────────

type FlyerData = { breakdown: unknown; referencePreview?: string | null; generatedImage?: string | null }
const ASSET_REF = /asset:[A-Za-z0-9_-]+/g

/** Packs a saved flyer with every picture its layers use. */
export async function packFlyer(project: StoredProject): Promise<Blob> {
  if (!project.breakdown) throw new Error('This design has no layers to sell yet.')
  const json = JSON.stringify(project.breakdown)
  const refs = [...new Set(json.match(ASSET_REF) ?? [])]
  const files: PackageFile[] = []
  for (const ref of refs) {
    const blob = await getAssetBlob(ref.slice('asset:'.length))
    if (!blob) throw new Error('A picture in this design is still loading. Open it in the editor once, then try again.')
    files.push({ key: ref, name: ref, type: blob.type || 'image/png', blob })
  }
  const data: FlyerData = { breakdown: project.breakdown, referencePreview: project.referencePreview ?? null, generatedImage: project.generatedImage ?? null }
  return encodePackage({ kind: 'flyer', name: project.name, data, files })
}

function newProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `spyda-${crypto.randomUUID()}` : `spyda-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Saves a flyer package as a new project of the buyer's, and returns its id. */
export async function unpackFlyer(pkg: DesignPackage, name = pkg.name): Promise<string> {
  if (pkg.kind !== 'flyer') throw new Error('This file is a video project. Open it in the video editor.')
  const data = pkg.data as FlyerData
  let json = JSON.stringify(data.breakdown)
  for (const file of pkg.files) {
    const id = await putAsset(file.blob)
    json = json.split(file.key).join(assetIdToRef(id))
  }
  const id = newProjectId()
  const now = new Date().toISOString()
  saveProject({ id, name, createdAt: now, updatedAt: now, referencePreview: data.referencePreview ?? null, generatedImage: data.generatedImage ?? null, breakdown: JSON.parse(json), magicLayers: 'done' })
  return id
}

// ── Handing a package to the video editor ─────────────────────────────────

/** Keeps a package on this device until the video editor opens it; returns the key for `/video?open=`. */
export async function stashPackage(blob: Blob): Promise<string> {
  return putAsset(blob)
}
