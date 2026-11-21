import { useId } from 'react'
import { AlertTriangle, ImageUp, Lock } from '../ui/icons'
import type { DesignObject } from '../../core/design-document'
import type { DesignEditIntent } from '../../core/constraint-engine'
import { BUNDLED_FAMILIES } from '../../lib/fonts'

/**
 * Content editing for the selected layer.
 *
 * Every control emits a `DesignEditIntent`; nothing here mutates the document.
 * That is what keeps the canvas, the typed-instruction door and the undo log on
 * the same path.
 */

export type ContentPanelProps = {
  object: DesignObject | null
  onIntent: (intent: DesignEditIntent) => void
  onReplaceImage: (objectId: string, file: File) => void
  busy?: boolean
}

const TEXT_KINDS = new Set<DesignObject['kind']>(['text', 'action'])
const IMAGE_KINDS = new Set<DesignObject['kind']>(['image', 'logo', 'icon', 'qr-code'])

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors focus:border-primary/50 focus:bg-white/[0.06]'

function isHex(value: string | null) {
  return Boolean(value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()))
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (next: string) => void
}) {
  const id = useId()
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={isHex(value) ? (value as string) : '#ffffff'}
          onChange={event => onChange(event.target.value)}
          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          value={value ?? ''}
          onChange={event => onChange(event.target.value)}
          placeholder="transparent"
          className={inputClass}
          aria-label={label}
        />
      </div>
    </Field>
  )
}

export default function ContentPanel({ object, onIntent, onReplaceImage, busy = false }: ContentPanelProps) {
  if (!object) {
    return (
      <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
        Select a layer to change its text, image, or colour.
      </p>
    )
  }

  const locked = object.protection.locked
  const disabled = locked || busy
  const isText = TEXT_KINDS.has(object.kind)
  const isImage = IMAGE_KINDS.has(object.kind)
  const fallbackCutout = object.source.evidence.includes('rectangle-fallback')
  const bounds = object.transform.bounds

  return (
    <div className="flex flex-col gap-4 px-1 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">{object.name}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{object.kind}</p>
        </div>
        {object.source.confidence !== null ? (
          <span
            className={[
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              object.source.confidence >= 0.6
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300',
            ].join(' ')}
            title="How sure the analyser is about this layer"
          >
            {Math.round(object.source.confidence * 100)}%
          </span>
        ) : null}
      </div>

      {locked ? (
        <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-surface-raised px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          This layer is protected, so it has no drag handles and cannot be edited.
        </p>
      ) : null}

      {fallbackCutout ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          The cut-out for this layer came back empty, so it kept its plain rectangle. Replace the
          picture or crop it by hand.
        </p>
      ) : null}

      {isText ? (
        <>
          <Field label="Text">
            <textarea
              value={object.content.text ?? ''}
              onChange={event => onIntent({ objectId: object.id, property: 'text', value: event.target.value })}
              rows={3}
              disabled={disabled}
              className={`${inputClass} resize-y leading-snug`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Font">
              <select
                value={object.style.fontFamily ?? ''}
                onChange={event => onIntent({ objectId: object.id, property: 'fontFamily', value: event.target.value })}
                disabled={disabled}
                className={inputClass}
              >
                <option value="">Default</option>
                {BUNDLED_FAMILIES.map(font => (
                  <option key={font.family} value={font.family}>{font.family}</option>
                ))}
                {object.style.fontFamily && !BUNDLED_FAMILIES.some(font => font.family === object.style.fontFamily) ? (
                  <option value={object.style.fontFamily}>{object.style.fontFamily} (not loaded)</option>
                ) : null}
              </select>
            </Field>

            <Field label="Size">
              <input
                type="number"
                min={4}
                step={1}
                value={object.style.fontSize ?? ''}
                onChange={event => onIntent({ objectId: object.id, property: 'fontSize', value: Number(event.target.value) })}
                disabled={disabled}
                placeholder="auto"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Weight">
              <select
                value={object.style.fontWeight ?? '400'}
                onChange={event => onIntent({ objectId: object.id, property: 'fontWeight', value: event.target.value })}
                disabled={disabled}
                className={inputClass}
              >
                {['400', '500', '600', '700'].map(weight => (
                  <option key={weight} value={weight}>{weight}</option>
                ))}
              </select>
            </Field>

            <Field label="Align">
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {(['left', 'center', 'right'] as const).map(align => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => onIntent({ objectId: object.id, property: 'textAlign', value: align })}
                    disabled={disabled}
                    aria-pressed={object.style.textAlign === align}
                    className={[
                      'flex-1 px-1 py-1.5 text-[11px] capitalize transition-colors',
                      object.style.textAlign === align
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-white/[0.06]',
                    ].join(' ')}
                  >
                    {align}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <ColourField
            label="Colour"
            value={object.style.fill}
            onChange={next => onIntent({ objectId: object.id, property: 'fill', value: next })}
          />
        </>
      ) : null}

      {isImage ? (
        <>
          <Field label="Picture">
            <span className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                disabled={disabled}
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) onReplaceImage(object.id, file)
                  event.target.value = ''
                }}
                className="sr-only"
                id={`replace-${object.id}`}
              />
              <label
                htmlFor={`replace-${object.id}`}
                className={[
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  disabled ? 'pointer-events-none opacity-40' : 'hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
                ].join(' ')}
              >
                <ImageUp className="h-3.5 w-3.5" aria-hidden />
                Replace image
              </label>
            </span>
          </Field>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The new picture is stored as its own asset and keeps this layer&apos;s box, so nothing
            else on the flyer moves.
          </p>
        </>
      ) : null}

      {!isText && !isImage ? (
        <>
          <ColourField
            label="Fill"
            value={object.style.fill}
            onChange={next => onIntent({ objectId: object.id, property: 'fill', value: next })}
          />
          <ColourField
            label="Stroke"
            value={object.style.stroke}
            onChange={next => onIntent({ objectId: object.id, property: 'stroke', value: next })}
          />
        </>
      ) : null}

      <Field label={`Opacity ${Math.round(object.transform.opacity * 100)}%`}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(object.transform.opacity * 100)}
          onChange={event => onIntent({ objectId: object.id, property: 'opacity', value: Number(event.target.value) / 100 })}
          disabled={disabled}
          className="w-full accent-[hsl(var(--primary))]"
        />
      </Field>

      {bounds ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-surface px-2.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between"><dt>X</dt><dd className="tabular-nums text-foreground">{bounds.x.toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt>Y</dt><dd className="tabular-nums text-foreground">{bounds.y.toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt>W</dt><dd className="tabular-nums text-foreground">{bounds.width.toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt>H</dt><dd className="tabular-nums text-foreground">{bounds.height.toFixed(1)}%</dd></div>
        </dl>
      ) : null}
    </div>
  )
}
