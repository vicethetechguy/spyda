import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { canRenderShader, usePrefersReducedMotion, useSeen } from '../lib/shader-support'

/**
 * Mesh gradient is the same paper-design runtime the brand mark already pulled
 * in, so this adds a second shader to an existing chunk instead of a renderer.
 * The hero is the only place it belongs: one field, above the fold, behind text
 * that sits on a scrim.
 */
const MeshGradient = lazy(async () => {
  const { MeshGradient: Shader } = await import('@paper-design/shaders-react')
  return { default: Shader }
})

/**
 * Deliberately low-luminance. A mesh gradient fills its whole box, and this one
 * sits behind a white headline, so the palette carries hue and depth rather
 * than bright spots the text would have to fight.
 */
const HERO_COLORS = ['#061d13', '#0a4536', '#06293f', '#101033', '#0d5a40']

type HeroFieldProps = { className?: string }

export default function HeroField({ className = '' }: HeroFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    setEligible(canRenderShader())
  }, [])

  const seen = useSeen(hostRef, eligible)

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute overflow-hidden ${className}`}
    >
      {/* Painted from the first frame: with reduced motion, no WebGL2, or a
          chunk still in flight, this is the hero background outright. The
          canvas fades in over it, so there is never an empty gap. */}
      <div className="hero-field-fallback absolute inset-0" />

      {seen && (
        <Suspense fallback={null}>
          <MeshGradient
            className="hero-field-canvas absolute inset-0 h-full w-full"
            colors={HERO_COLORS}
            distortion={0.62}
            swirl={0.28}
            grainMixer={0.14}
            grainOverlay={0.05}
            // speed 0 stops the loop and leaves a still pose for reduced motion.
            speed={reducedMotion ? 0 : 0.16}
            frame={8200}
            minPixelRatio={1}
            maxPixelCount={900000}
          />
        </Suspense>
      )}

      {/* Legibility is not negotiable: the scrim sinks the field to page
          background at every edge and again under the headline. */}
      <div className="hero-field-scrim absolute inset-0" />
    </div>
  )
}
