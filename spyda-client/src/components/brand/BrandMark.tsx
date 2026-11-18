import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { canRenderShader, usePrefersReducedMotion, useSeen } from '../../lib/shader-support'

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

/**
 * Mounts the shader the first time the mark is seen. The shader pauses itself
 * when the tab is hidden or the mark leaves the viewport, so a mounted mark is
 * cheap; the cost worth deferring is the initial mask solve.
 */
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
