type AmbientFieldProps = {
  /** 0-1 multiplier for the glow strength. */
  intensity?: number
  className?: string
}

/**
 * Static depth layer for the app shell.
 *
 * Glass needs something behind it to tint; the workspace used to sit on a flat
 * near-black fill, which is why every panel read as a flat tile and the `.glass`
 * utilities went unused. This replaces that fill with a cheap field of soft
 * radials.
 *
 * Deliberately CSS-only: a live shader behind every route would put a WebGL
 * frame loop under the whole workspace. Soft radial-gradient falloff does the
 * same job as a blur pass for free.
 */
export default function AmbientField({ intensity = 1, className = '' }: AmbientFieldProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute -left-[22%] -top-[34%] h-[78vh] w-[64vw] rounded-full"
        style={{ background: `radial-gradient(closest-side, rgba(34, 197, 94, ${0.16 * intensity}), rgba(34, 197, 94, 0) 72%)` }}
      />
      <div
        className="absolute -right-[18%] top-[4%] h-[64vh] w-[56vw] rounded-full"
        style={{ background: `radial-gradient(closest-side, rgba(139, 211, 255, ${0.11 * intensity}), rgba(139, 211, 255, 0) 70%)` }}
      />
      <div
        className="absolute -bottom-[28%] left-[24%] h-[58vh] w-[58vw] rounded-full"
        style={{ background: `radial-gradient(closest-side, rgba(255, 143, 92, ${0.055 * intensity}), rgba(255, 143, 92, 0) 72%)` }}
      />
    </div>
  )
}
