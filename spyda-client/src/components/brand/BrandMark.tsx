import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * The paper-design liquid-metal shader is ~30 kB of runtime plus a one-off mask
 * solve, so it stays in its own chunk and only loads once a mark is on screen.
 */
const LiquidMetal = lazy(async () => {
  const { LiquidMetal: Shader } = await import('@paper-design/shaders-react')
  return { default: Shader }
})

const LOGO_SRC = '/assets/spyda-logo.png'

/**
 * Below this edge the stripe pattern collapses into a flat dark mark: the
 * shader reads as chrome from ~72px up and as smudge under it. Small marks keep
 * the plain gradient logo, which also keeps their WebGL context count at zero.
 */
const MIN_SHADER_SIZE = 72

type BrandMarkProps = {
  /** Square edge in px. Omit to let the parent size the mark. */
  size?: number
  /** Chrome tint. Defaults to the Spyda primary green. */
  tint?: string
  /** Accessible name. Omit for decorative marks (splash, footer). */
  label?: string
  className?: string
}

let shaderEligible: boolean | undefined

/** WebGL2 and enough memory to justify a live shader on a marketing page. */
function canRenderShader() {
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

function usePrefersReducedMotion() {
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
 * Mounts the shader the first time the mark is seen. The shader pauses itself
 * when the tab is hidden or the mark leaves the viewport, so a mounted mark is
 * cheap; the cost worth deferring is the initial mask solve.
 */
function useSeen(ref: RefObject<HTMLElement | null>, enabled: boolean) {
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

export default function BrandMark({ size, tint = '#9dfab0', label, className = '' }: BrandMarkProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    setEligible(canRenderShader())
  }, [])

  const seen = useSeen(hostRef, eligible)
  const showShader = eligible && seen && (size === undefined || size >= MIN_SHADER_SIZE)

  return (
    <div
      ref={hostRef}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {/* Doubles as the fallback: no WebGL, shader chunk still loading, or mask
          still solving. The canvas paints over it, and where the mask is
          transparent the canvas is too, so the two never muddy each other. */}
      <img
        src={LOGO_SRC}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
        draggable={false}
        className="h-full w-full object-contain drop-shadow-[0_0_20px_rgba(157,250,176,0.25)]"
      />

      {showShader && (
        <Suspense fallback={null}>
          <LiquidMetal
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            image={LOGO_SRC}
            // A transparent background is what keeps the mark from turning into
            // a dark tile on top of the splash gradient.
            colorBack="#00000000"
            colorTint={tint}
            repetition={2.4}
            softness={0.16}
            distortion={0.08}
            contour={0.45}
            shiftRed={0.32}
            shiftBlue={0.36}
            angle={70}
            scale={0.94}
            // speed 0 stops the rAF loop entirely; frame pins the still pose.
            speed={reducedMotion ? 0 : 0.6}
            frame={1400}
            minPixelRatio={2}
            maxPixelCount={362000}
          />
        </Suspense>
      )}
    </div>
  )
}
