import { createStore, get, set, del, keys } from 'idb-keyval'

/**
 * Blob storage for extracted layer cut-outs.
 *
 * Project snapshots live in localStorage, where a single 1080px cut-out would
 * blow the quota. Cut-outs therefore live in IndexedDB and the document only
 * carries an `asset:<id>` reference.
 */

const store = createStore('spyda-assets', 'assets')
const REF_PREFIX = 'asset:'

/** Object URLs are cheap to hand out but must not be re-created per render. */
const urlCache = new Map<string, string>()

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function assetIdToRef(id: string) {
  return `${REF_PREFIX}${id}`
}

/** Returns the id behind an `asset:` reference, or null for any other string. */
export function assetRefToId(ref: string | null | undefined) {
  if (!ref || !ref.startsWith(REF_PREFIX)) return null
  const id = ref.slice(REF_PREFIX.length)
  return id || null
}

export async function putAsset(blob: Blob, id = newId()) {
  await set(id, blob, store)
  urlCache.delete(id)
  return id
}

export async function getAssetBlob(id: string) {
  return get<Blob>(id, store)
}

export async function getAssetUrl(id: string) {
  const cached = urlCache.get(id)
  if (cached) return cached
  const blob = await getAssetBlob(id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

/** Resolves an `asset:<id>` reference straight to a usable URL. */
export async function resolveAssetRef(ref: string | null | undefined) {
  const id = assetRefToId(ref)
  return id ? getAssetUrl(id) : null
}

export async function deleteAsset(id: string) {
  const cached = urlCache.get(id)
  if (cached) {
    URL.revokeObjectURL(cached)
    urlCache.delete(id)
  }
  await del(id, store)
}

export async function listAssetIds() {
  return keys<string>(store)
}

export async function clearAssets() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
  for (const id of await listAssetIds()) await del(id, store)
}

/** Test seam: lets callers reset cached object URLs between cases. */
export function __resetAssetUrlCache() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
}
