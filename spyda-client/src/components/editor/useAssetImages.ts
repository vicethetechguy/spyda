import { useEffect, useRef, useState } from 'react'
import type { DesignDocument } from '../../core/design-document.js'
import { resolveAssetRef } from '../../lib/asset-store.js'

/**
 * Decoded pixels for every `asset:` reference in a document.
 *
 * Konva needs an `HTMLImageElement`, and `content.assetRef` is only an IndexedDB
 * key, so the two are joined here once per document revision instead of on every
 * layer render.
 */

function decode(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not decode ${url}`))
    image.src = url
  })
}

export function useAssetImages(document: DesignDocument | null) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  const [missing, setMissing] = useState<string[]>([])
  const cache = useRef(new Map<string, HTMLImageElement>())

  // A value signature, because the ref list gets a new identity on every edit.
  const signature = document
    ? [...new Set(document.objects.map(object => object.content.assetRef).filter(Boolean))].sort().join('|')
    : ''

  useEffect(() => {
    let active = true
    const refs = signature ? signature.split('|') : []
    const pending = refs.filter(ref => !cache.current.has(ref))

    const publish = () => {
      const resolved: Record<string, HTMLImageElement> = {}
      const failed: string[] = []
      for (const ref of refs) {
        const image = cache.current.get(ref)
        if (image) resolved[ref] = image
        else failed.push(ref)
      }
      setImages(resolved)
      setMissing(failed)
    }

    if (!pending.length) {
      publish()
      return () => { active = false }
    }

    Promise.all(pending.map(async ref => {
      const url = await resolveAssetRef(ref)
      if (!url) return null
      try {
        return { ref, image: await decode(url) } as const
      } catch {
        return null
      }
    })).then(loaded => {
      if (!active) return
      for (const entry of loaded) {
        if (entry) cache.current.set(entry.ref, entry.image)
      }
      publish()
    })

    return () => { active = false }
  }, [signature])

  return { images, missing }
}
