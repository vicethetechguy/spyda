import { useEffect, useState, type RefObject } from 'react'

/**
 * Shared gates for the paper-design shaders.
 *
 * A live shader is the most expensive thing this app can paint, and both the
 * brand mark and the hero field are decoration. These helpers decide whether
 * decoration is allowed at all, so that decision lives in one place instead of
 * drifting between components.
 */

let shaderEligible: boolean | undefined

/** WebGL2 and enough memory to justify a live shader on a marketing page. */
export function canRenderShader() {
  if (shaderEligible !== undefined) return shaderEligible
  if (typeof window === 'undefined') return false

  shaderEligible = false

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory !== undefined && memory < 4) return shaderEligible

  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2')
    shaderEligible = Boolean(gl)
    // The probe context counts against the browser's per-page limit until it is
    // released, so give it back immediately.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    shaderEligible = false
  }

  return shaderEligible
}

export function usePrefersReducedMotion() {
  // Start conservative so a reduced-motion visitor never sees one animated frame.
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

/**
 * Reports the first time the element comes near the viewport. Deferred work
 * hangs off this instead of mount, so nothing below the fold pays for itself
 * before it can be seen.
 */
export function useSeen(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (!enabled || seen) return

    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setSeen(true)
    }, { rootMargin: '200px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, ref, seen])

  return seen
}
