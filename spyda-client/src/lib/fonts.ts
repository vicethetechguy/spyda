/**
 * Font availability for canvas rendering.
 *
 * Konva draws into a canvas, so a font that has not finished loading does not
 * show a flash of unstyled text - it silently falls back and the layer renders
 * in the wrong face with wrong metrics. `document.fonts.load` is awaited here and
 * `check` is consulted afterwards, so a missing family is reported instead of
 * quietly swapped.
 *
 * Only Montserrat and Space Grotesk are declared in `index.html`. Anything else
 * in a document came from the analyser guessing, and will be substituted.
 */

export const FALLBACK_FAMILY = 'Montserrat'

/** Families the app actually ships, per the Google Fonts link in `index.html`. */
export const BUNDLED_FAMILIES: ReadonlyArray<{ family: string; weights: string[] }> = [
  { family: 'Montserrat', weights: ['400', '500', '600', '700'] },
  { family: 'Space Grotesk', weights: ['500', '600', '700'] },
  { family: 'Inter', weights: ['400', '500', '600', '700', '800'] },
  { family: 'Poppins', weights: ['400', '500', '600', '700', '800'] },
  { family: 'DM Sans', weights: ['400', '500', '700'] },
  { family: 'Outfit', weights: ['400', '500', '600', '700', '800'] },
  { family: 'Playfair Display', weights: ['400', '600', '700', '800'] },
  { family: 'Bebas Neue', weights: ['400'] },
]

/** index.html already loads these two; the rest come from Google Fonts on first use. */
const PAGE_FAMILIES = new Set(['Montserrat', 'Space Grotesk'])
const requestedStylesheets = new Set<string>()

/** Adds the Google Fonts stylesheet for families a layer uses, once each. */
function ensureStylesheet(families: string[]) {
  const needed = families.filter(family => !PAGE_FAMILIES.has(family) && !requestedStylesheets.has(family))
    .map(family => BUNDLED_FAMILIES.find(item => item.family === family))
    .filter((item): item is { family: string; weights: string[] } => Boolean(item))
  if (!needed.length || typeof document === 'undefined') return Promise.resolve()
  needed.forEach(item => requestedStylesheets.add(item.family))
  const query = needed.map(item => `family=${item.family.replace(/ /g, '+')}:wght@${item.weights.join(';')}`).join('&')
  return new Promise<void>(resolve => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
    window.setTimeout(resolve, 4000)
  })
}

export type FontRequest = { family: string; weight?: string | null }

export type FontReport = {
  loaded: string[]
  /** Families that will render as the fallback because no face is available. */
  missing: string[]
}

export function hasFontFaceSet() {
  return typeof document !== 'undefined' && Boolean(document.fonts) && typeof document.fonts.load === 'function'
}

/**
 * Waits for every requested face before the first frame is drawn.
 *
 * `document.fonts.load` resolves with the matched faces, so an empty result plus
 * a failed `check` is the signal that the family does not exist at all - that is
 * the case that used to fail silently.
 */
export async function preloadFonts(requests: FontRequest[]): Promise<FontReport> {
  if (!hasFontFaceSet()) return { loaded: [], missing: [] }

  const unique = new Map<string, { family: string; weight: string }>()
  for (const request of requests) {
    const family = request.family?.trim()
    if (!family) continue
    const weight = (request.weight || '400').toString()
    const key = `${family}|${weight}`
    if (!unique.has(key)) unique.set(key, { family, weight })
  }

  await ensureStylesheet([...new Set([...unique.values()].map(item => item.family))])

  const loaded = new Set<string>()
  const missing = new Set<string>()

  await Promise.all([...unique.values()].map(async ({ family, weight }) => {
    const spec = `${weight} 16px "${family}"`
    try {
      await document.fonts.load(spec)
    } catch {
      // A rejected load is the same outcome as a missing face.
    }
    if (document.fonts.check(spec)) loaded.add(family)
    else missing.add(family)
  }))

  // The fallback has to be ready too, otherwise every substituted layer flickers.
  await document.fonts.load(`400 16px "${FALLBACK_FAMILY}"`).catch(() => undefined)
  loaded.delete(FALLBACK_FAMILY)

  return { loaded: [...loaded], missing: [...missing] }
}

/** The family to actually draw with, given what turned out to be available. */
export function resolveFamily(family: string | null | undefined, missing: ReadonlySet<string>) {
  const candidate = family?.trim()
  if (!candidate) return FALLBACK_FAMILY
  return missing.has(candidate) ? FALLBACK_FAMILY : candidate
}

export function collectFontRequests(objects: Array<{ style: { fontFamily: string | null; fontWeight: string | null } }>) {
  const requests: FontRequest[] = []
  for (const object of objects) {
    if (!object.style.fontFamily) continue
    requests.push({ family: object.style.fontFamily, weight: object.style.fontWeight })
  }
  return requests
}
