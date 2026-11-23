/**
 * Text alignment, as icons: across the box (left, centre, right, justify) and
 * within it (top, middle, bottom). Shared by the Properties panel and the
 * floating text toolbar on the canvas.
 */

export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

const H_PATHS: Record<HorizontalAlign, string> = {
  left: 'M3 4h14M3 8h9M3 12h14M3 16h9',
  center: 'M3 4h14M5.5 8h9M3 12h14M5.5 16h9',
  right: 'M3 4h14M8 8h9M3 12h14M8 16h9',
  justify: 'M3 4h14M3 8h14M3 12h14M3 16h14',
}

function VerticalGlyph({ where }: { where: VerticalAlign }) {
  // A box with its text lines at the top, middle or bottom.
  const y = where === 'top' ? 6 : where === 'middle' ? 9 : 12
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" opacity="0.45" />
      <path d={`M6 ${y}h8M7.5 ${y + 2.5}h5`} />
    </svg>
  )
}

const H_LABELS: Record<HorizontalAlign, string> = { left: 'Align text left', center: 'Centre text', right: 'Align text right', justify: 'Justify text' }
const V_LABELS: Record<VerticalAlign, string> = { top: 'Text at the top of the box', middle: 'Text in the middle of the box', bottom: 'Text at the bottom of the box' }

export function TextAlignControls({ textAlign, verticalAlign, onChange, disabled, variant = 'panel' }: {
  textAlign: HorizontalAlign
  verticalAlign: VerticalAlign
  onChange: (patch: { textAlign?: HorizontalAlign; verticalAlign?: VerticalAlign }) => void
  disabled?: boolean
  /** `panel`: two labelled rows of boxed buttons; `toolbar`: one compact row for the canvas. */
  variant?: 'panel' | 'toolbar'
}) {
  const button = (active: boolean) => variant === 'toolbar'
    ? `flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${active ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(157,250,176,0.35)]' : 'text-foreground/75 hover:bg-white/[0.1] hover:text-foreground'}`
    : `flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${active ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground'}`

  const horizontal = (Object.keys(H_PATHS) as HorizontalAlign[]).map(align => (
    <button key={align} type="button" title={H_LABELS[align]} aria-label={H_LABELS[align]} aria-pressed={textAlign === align} disabled={disabled} onClick={() => onChange({ textAlign: align })} className={button(textAlign === align)}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d={H_PATHS[align]} /></svg>
    </button>
  ))
  const vertical = (['top', 'middle', 'bottom'] as VerticalAlign[]).map(where => (
    <button key={where} type="button" title={V_LABELS[where]} aria-label={V_LABELS[where]} aria-pressed={verticalAlign === where} disabled={disabled} onClick={() => onChange({ verticalAlign: where })} className={button(verticalAlign === where)}>
      <VerticalGlyph where={where} />
    </button>
  ))

  if (variant === 'toolbar') {
    return (
      <div role="toolbar" aria-label="Text alignment" className="flex items-center gap-0.5">
        {horizontal}
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />
        {vertical}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Align across</p>
        <div className="flex gap-1.5">{horizontal}</div>
      </div>
      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Position in box</p>
        <div className="flex gap-1.5">{vertical}</div>
      </div>
    </div>
  )
}
