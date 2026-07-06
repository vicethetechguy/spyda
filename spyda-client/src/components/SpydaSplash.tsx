type SpydaSplashProps = {
  message?: string
}

export default function SpydaSplash({ message = 'Preparing your design web' }: SpydaSplashProps) {
  return (
    <div className="spyda-splash" role="status" aria-live="polite">
      <div className="spyda-splash__grid" />
      <div className="spyda-splash__beam spyda-splash__beam--one" />
      <div className="spyda-splash__beam spyda-splash__beam--two" />

      <div className="spyda-splash__core">
        <div className="spyda-splash__web" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="spyda-splash__logo-wrap">
          <img src="/assets/spyda-logo-drive.webp" alt="Spyda" className="spyda-splash__logo" />
        </div>

        <div className="spyda-splash__copy">
          <p>Spyda</p>
          <span>{message}</span>
        </div>

        <div className="spyda-splash__progress" aria-hidden="true">
          <i />
        </div>
      </div>
    </div>
  )
}
