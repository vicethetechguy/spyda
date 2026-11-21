import BrandMark from './brand/BrandMark'

type SpydaSplashProps = {
  message?: string
  /** Fades the splash out; App sets it just before unmounting. */
  leaving?: boolean
}

/**
 * The opening screen: the Spyda mark in liquid chrome inside a glass orb.
 *
 * The CSS chrome (`.spyda-chrome`) animates from the first frame, so the
 * splash never shows a flat logo. The WebGL liquid-metal shader then paints
 * over the same silhouette when its mask is solved, with no fallback image of
 * its own, so the two blend instead of swapping.
 */
export default function SpydaSplash({ message = 'Preparing your design web', leaving = false }: SpydaSplashProps) {
  return (
    <div className={`spyda-splash ${leaving ? 'spyda-splash--leaving' : ''}`} role="status" aria-live="polite">
      <div className="spyda-splash__aurora spyda-splash__aurora--green" aria-hidden="true" />
      <div className="spyda-splash__aurora spyda-splash__aurora--blue" aria-hidden="true" />
      <div className="spyda-splash__grain" aria-hidden="true" />

      <div className="spyda-splash__stage">
        <div className="spyda-splash__orb" aria-hidden="true">
          <div className="spyda-splash__halo" />
          <div className="spyda-splash__ring" />
          <div className="spyda-splash__glass" />
          <div className="spyda-splash__mark">
            <span className="spyda-chrome" />
            <BrandMark animated fallback="none" tint="#c4ffd3" className="absolute inset-0 h-full w-full" />
          </div>
        </div>

        <p className="spyda-splash__word">Spyda</p>
        <span className="spyda-splash__message">{message}</span>
        <div className="spyda-splash__track" aria-hidden="true"><i /></div>
      </div>
    </div>
  )
}
