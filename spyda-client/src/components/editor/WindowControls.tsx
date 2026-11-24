/**
 * The three window buttons at the top left, macOS style. Each says what it
 * does on hover: red saves and closes, yellow fits the work to the window,
 * green toggles full screen.
 */
export default function WindowControls({ onClose, onFit, fitLabel = 'Fit to window' }: {
  onClose: () => void
  onFit: () => void
  fitLabel?: string
}) {
  const toggleFullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void document.documentElement.requestFullscreen?.()
  }
  const dot = 'mac-light group/light flex h-3 w-3 items-center justify-center rounded-full border border-black/25 text-[8px] font-bold leading-none text-black/0 transition-colors hover:text-black/60'
  return (
    <div className="mac-lights flex shrink-0 items-center gap-2 px-1.5" role="group" aria-label="Window">
      <button type="button" onClick={onClose} title="Save and close" aria-label="Save and close" className={`${dot} bg-[#ff5f57]`}>×</button>
      <button type="button" onClick={onFit} title={fitLabel} aria-label={fitLabel} className={`${dot} bg-[#febc2e]`}>−</button>
      <button type="button" onClick={toggleFullScreen} title="Full screen" aria-label="Full screen" className={`${dot} bg-[#28c840]`}>+</button>
    </div>
  )
}
