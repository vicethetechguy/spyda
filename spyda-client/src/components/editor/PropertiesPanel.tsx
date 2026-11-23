import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { DesignEditIntent } from '../../core/constraint-engine'
import type { DesignObject, PercentBox } from '../../core/design-document'
import { BUNDLED_FAMILIES } from '../../lib/fonts'
import { ArrowDown, ArrowUp, Copy, ImagePlus, Layers, Loader2, Lock, Sparkles, Trash2, Wand2 } from '../ui/icons'
import EffectsPanel from './EffectsPanel'

/**
 * The inspector, laid out like Figma's Design panel: align, position and size
 * in real pixels, rotation and flips, roundness and opacity, fill and stroke
 * with typed hex codes, typography, and picture tools. Every change is one
 * edit intent, so it undoes like any other.
 */

type PropertiesPanelProps = {
  object: DesignObject
  canvas: { width: number; height: number }
  onIntent: (intent: DesignEditIntent) => void
  onReplaceImage: (file: File) => void
  onRemoveBackground: () => void
  onMagicLayers: () => void
  onDuplicate: () => void
  onDelete: () => void
  onReorder: (direction: 'up' | 'down') => void
  pictureBusy: 'background' | 'magic' | null
  /** Plays the design, to see this layer's animation. */
  onPreview?: () => void
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function normaliseHex(value: string) {
  const match = HEX.exec(value.trim())
  if (!match) return null
  const body = match[1].length === 3 ? match[1].split('').map(char => char + char).join('') : match[1]
  return `#${body.toUpperCase()}`
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-0.5 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-foreground/90">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A compact number field: commits on Enter or blur, arrows step (Shift for 10). */
function NumberField({ label, value, onCommit, step = 1, min, max, suffix, disabled, title }: {
  label: string
  value: number
  onCommit: (value: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  disabled?: boolean
  title?: string
}) {
  const [draft, setDraft] = useState(String(round(value)))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(round(value)))
  }, [value])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      setDraft(String(round(value)))
      return
    }
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed))
    setDraft(String(round(bounded)))
    if (round(bounded, 3) !== round(value, 3)) onCommit(bounded)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const delta = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
      commit(String((Number(draft) || 0) + delta))
    }
  }

  return (
    <label title={title} className={`flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 focus-within:ring-1 focus-within:ring-primary/60 ${disabled ? 'opacity-40' : ''}`}>
      <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <input
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onFocus={() => { focused.current = true }}
        onBlur={event => { focused.current = false; commit(event.target.value) }}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-[11px] tabular-nums outline-none"
      />
      {suffix ? <span className="text-[10px] text-muted-foreground">{suffix}</span> : null}
    </label>
  )
}

/** A colour: the picker and a hex field you can type a code into. */
function ColourField({ value, onCommit, disabled, allowNone = true }: { value: string | null; onCommit: (value: string | null) => void; disabled?: boolean; allowNone?: boolean }) {
  const hex = normaliseHex(value || '')
  const [draft, setDraft] = useState(hex ?? '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setDraft(normaliseHex(value || '') ?? '') }, [value])

  const commit = (raw: string) => {
    if (!raw.trim() && allowNone) {
      setInvalid(false)
      if (value) onCommit(null)
      return
    }
    const next = normaliseHex(raw)
    if (!next) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(next)
    if (next !== hex) onCommit(next)
  }

  return (
    <div className={`flex items-center gap-1.5 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-white/15" style={{ background: hex ?? 'repeating-conic-gradient(#2a2b2f 0 25%, #1a1b1e 0 50%) 50% / 8px 8px' }}>
        <input
          type="color"
          aria-label="Pick a colour"
          value={hex && hex.length === 7 ? hex.toLowerCase() : '#ffffff'}
          onChange={event => onCommit(event.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <label className={`flex h-7 min-w-0 flex-1 items-center rounded-md bg-white/[0.04] px-2 focus-within:ring-1 ${invalid ? 'ring-1 ring-red-400/70' : 'focus-within:ring-primary/60'}`}>
        <span className="sr-only">Hex colour</span>
        <input
          value={draft}
          placeholder={allowNone ? 'None' : '#FFFFFF'}
          spellCheck={false}
          onChange={event => { setDraft(event.target.value); setInvalid(false) }}
          onBlur={event => commit(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground/60"
        />
      </label>
    </div>
  )
}

function IconButton({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 flex-1 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/[0.07] hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

/** Small drawn glyphs for alignment, flips and the proportion lock. */
function Glyph({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    'align-left': <><path d="M4 3v18" /><rect x="7" y="6" width="11" height="4" rx="1" /><rect x="7" y="14" width="7" height="4" rx="1" /></>,
    'align-center': <><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>,
    'align-right': <><path d="M20 3v18" /><rect x="6" y="6" width="11" height="4" rx="1" /><rect x="10" y="14" width="7" height="4" rx="1" /></>,
    'align-top': <><path d="M3 4h18" /><rect x="6" y="7" width="4" height="11" rx="1" /><rect x="14" y="7" width="4" height="7" rx="1" /></>,
    'align-middle': <><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>,
    'align-bottom': <><path d="M3 20h18" /><rect x="6" y="6" width="4" height="11" rx="1" /><rect x="14" y="10" width="4" height="7" rx="1" /></>,
    'flip-x': <><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7 4 17h5V7Z" /><path d="M15 7l5 10h-5V7Z" /></>,
    'flip-y': <><path d="M3 12h18" strokeDasharray="2 2" /><path d="M7 9 17 4v5H7Z" /><path d="M7 15l10 5v-5H7Z" /></>,
    link: <><path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1" /><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1" /></>,
    corner: <><path d="M5 19V11a6 6 0 0 1 6-6h8" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export default function PropertiesPanel({
  object, canvas, onIntent, onReplaceImage, onRemoveBackground, onMagicLayers, onDuplicate, onDelete, onReorder, pictureBusy, onPreview,
}: PropertiesPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const locked = object.protection.locked
  const can = (property: string) => !locked && object.protection.editableProperties.includes(property)
  const bounds = object.transform.bounds ?? { x: 0, y: 0, width: 100, height: 100 }
  const isText = object.kind === 'text' || object.kind === 'action'
  const isPicture = object.kind === 'image' || object.kind === 'logo' || object.kind === 'icon' || object.kind === 'qr-code'
  const isBackground = object.kind === 'background'
  const rounded = !isText && object.geometry?.type !== 'ellipse' && object.geometry?.type !== 'line' && object.geometry?.type !== 'path'
  const movable = !locked && !object.constraints.lockPosition && !isBackground

  const setBounds = (next: Partial<PercentBox>) => {
    if (!movable) return
    onIntent({ objectId: object.id, property: 'bounds', value: { ...bounds, ...next }, explicitGeometryChange: true })
  }
  const toPx = (percent: number, axis: 'x' | 'y') => (percent / 100) * (axis === 'x' ? canvas.width : canvas.height)
  const toPercent = (px: number, axis: 'x' | 'y') => (px / (axis === 'x' ? canvas.width : canvas.height)) * 100
  const setSize = (axis: 'width' | 'height', px: number) => {
    const percent = toPercent(Math.max(1, px), axis === 'width' ? 'x' : 'y')
    if (!object.constraints.lockAspectRatio) {
      setBounds({ [axis]: percent })
      return
    }
    // Proportions locked: the other side follows, in pixels, not percent.
    const widthPx = axis === 'width' ? Math.max(1, px) : Math.max(1, px) * (toPx(bounds.width, 'x') / Math.max(1, toPx(bounds.height, 'y')))
    const heightPx = axis === 'height' ? Math.max(1, px) : Math.max(1, px) / (toPx(bounds.width, 'x') / Math.max(1, toPx(bounds.height, 'y')))
    setBounds({ width: toPercent(widthPx, 'x'), height: toPercent(heightPx, 'y') })
  }
  const align = (where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const next: Partial<PercentBox> = {
      left: { x: 0 }, center: { x: (100 - bounds.width) / 2 }, right: { x: 100 - bounds.width },
      top: { y: 0 }, middle: { y: (100 - bounds.height) / 2 }, bottom: { y: 100 - bounds.height },
    }[where]
    setBounds(next)
  }

  return (
    <div className="text-[11px]">
      <div className="flex items-center gap-2 px-0.5 pb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06] text-muted-foreground">
          {isPicture ? <ImagePlus className="h-3.5 w-3.5" /> : isText ? <span className="font-heading text-[11px] font-bold">T</span> : <Layers className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold">{object.name}</p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{object.geometry?.type === 'path' ? 'vector' : object.geometry?.type ?? object.kind}</p>
        </div>
      </div>
      {locked ? (
        <p className="mb-2 flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1.5 text-[10px] text-muted-foreground">
          <Lock className="h-3 w-3" /> This layer is protected and cannot be edited.
        </p>
      ) : null}

      {!isBackground ? (
        <Section title="Align to frame">
          <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(where => (
              <IconButton key={where} label={`Align ${where}`} onClick={() => align(where)} disabled={!movable}>
                <Glyph name={`align-${where}`} />
              </IconButton>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Position">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField label="X" value={toPx(bounds.x, 'x')} onCommit={px => setBounds({ x: toPercent(px, 'x') })} disabled={!movable} />
          <NumberField label="Y" value={toPx(bounds.y, 'y')} onCommit={px => setBounds({ y: toPercent(px, 'y') })} disabled={!movable} />
          <NumberField label="W" value={toPx(bounds.width, 'x')} min={1} onCommit={px => setSize('width', px)} disabled={!movable} />
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1">
              <NumberField label="H" value={toPx(bounds.height, 'y')} min={1} onCommit={px => setSize('height', px)} disabled={!movable} />
            </div>
            <button
              type="button"
              title={object.constraints.lockAspectRatio ? 'Proportions locked' : 'Lock proportions'}
              aria-label="Lock proportions"
              aria-pressed={object.constraints.lockAspectRatio}
              disabled={!movable}
              onClick={() => onIntent({ objectId: object.id, property: 'lockAspectRatio', value: !object.constraints.lockAspectRatio })}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${object.constraints.lockAspectRatio ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}
            >
              <Glyph name="link" />
            </button>
          </div>
          <NumberField
            label="°"
            title="Rotation"
            value={object.transform.rotation}
            min={-360}
            max={360}
            onCommit={degrees => movable && onIntent({ objectId: object.id, property: 'rotation', value: degrees, explicitGeometryChange: true })}
            disabled={!movable || object.constraints.lockRotation}
          />
          <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
            <IconButton label="Flip horizontal" active={object.transform.flipX} disabled={!movable} onClick={() => onIntent({ objectId: object.id, property: 'flipX', value: !object.transform.flipX })}>
              <Glyph name="flip-x" />
            </IconButton>
            <IconButton label="Flip vertical" active={object.transform.flipY} disabled={!movable} onClick={() => onIntent({ objectId: object.id, property: 'flipY', value: !object.transform.flipY })}>
              <Glyph name="flip-y" />
            </IconButton>
          </div>
        </div>
      </Section>

      <Section title="Layer">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField
            label="%"
            title="Opacity"
            value={object.transform.opacity * 100}
            min={0}
            max={100}
            onCommit={percent => onIntent({ objectId: object.id, property: 'opacity', value: percent / 100 })}
            disabled={!can('opacity')}
          />
          {rounded ? (
            <NumberField
              label="◜"
              title="Corner radius"
              value={object.style.borderRadius ?? 0}
              min={0}
              onCommit={radius => onIntent({ objectId: object.id, property: 'borderRadius', value: radius })}
              disabled={!can('borderRadius')}
            />
          ) : null}
        </div>
        {rounded && can('borderRadius') ? (
          <input
            type="range"
            aria-label="Corner radius"
            min={0}
            max={Math.round(Math.min(toPx(bounds.width, 'x'), toPx(bounds.height, 'y')) / 2)}
            value={Math.min(object.style.borderRadius ?? 0, Math.round(Math.min(toPx(bounds.width, 'x'), toPx(bounds.height, 'y')) / 2))}
            onChange={event => onIntent({ objectId: object.id, property: 'borderRadius', value: Number(event.target.value) })}
            className="mt-2 w-full accent-[#9dfab0]"
          />
        ) : null}
      </Section>

      {can('fill') || (isBackground && object.protection.editableProperties.includes('fill')) ? (
        <Section title="Fill">
          <ColourField value={object.style.fill} onCommit={value => onIntent({ objectId: object.id, property: 'fill', value: value ?? '' })} />
        </Section>
      ) : null}

      {can('stroke') ? (
        <Section title="Stroke">
          <div className="space-y-1.5">
            <ColourField value={object.style.stroke} onCommit={value => onIntent({ objectId: object.id, property: 'stroke', value: value ?? '' })} />
            {object.style.stroke && can('strokeWidth') ? (
              <NumberField label="W" title="Stroke width" value={object.style.strokeWidth ?? 1} min={0} max={200} onCommit={width => onIntent({ objectId: object.id, property: 'strokeWidth', value: width })} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {isText ? (
        <Section title="Text">
          <div className="space-y-1.5">
            <textarea
              id="spyda-layer-text"
              value={object.content.text ?? ''}
              onChange={event => onIntent({ objectId: object.id, property: 'text', value: event.target.value })}
              rows={2}
              disabled={!can('text')}
              className="w-full resize-y rounded-md bg-white/[0.04] px-2 py-1.5 text-[12px] leading-5 outline-none focus:ring-1 focus:ring-primary/60"
            />
            <select
              value={object.style.fontFamily ?? ''}
              onChange={event => onIntent({ objectId: object.id, property: 'fontFamily', value: event.target.value })}
              disabled={!can('fontFamily')}
              className="h-7 w-full rounded-md bg-white/[0.04] px-2 text-[11px] outline-none"
            >
              <option value="">Default</option>
              {BUNDLED_FAMILIES.map(font => <option key={font.family} value={font.family}>{font.family}</option>)}
              {object.style.fontFamily && !BUNDLED_FAMILIES.some(font => font.family === object.style.fontFamily)
                ? <option value={object.style.fontFamily}>{object.style.fontFamily}</option>
                : null}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={object.style.fontWeight ?? '400'}
                onChange={event => onIntent({ objectId: object.id, property: 'fontWeight', value: event.target.value })}
                disabled={!can('fontWeight')}
                className="h-7 rounded-md bg-white/[0.04] px-2 text-[11px] outline-none"
              >
                {['300', '400', '500', '600', '700', '800'].map(weight => <option key={weight} value={weight}>{{ '300': 'Light', '400': 'Regular', '500': 'Medium', '600': 'Semibold', '700': 'Bold', '800': 'Extra bold' }[weight]}</option>)}
              </select>
              <NumberField label="S" title="Font size" value={object.style.fontSize ?? 48} min={6} max={600} onCommit={size => onIntent({ objectId: object.id, property: 'fontSize', value: size })} disabled={!can('fontSize')} />
              <NumberField label="↕" title="Line height" value={object.style.lineHeight ?? 1.2} step={0.05} min={0.6} max={4} onCommit={value => onIntent({ objectId: object.id, property: 'lineHeight', value })} disabled={!can('lineHeight')} />
              <NumberField label="↔" title="Letter spacing" value={object.style.letterSpacing ?? 0} step={0.5} min={-20} max={100} onCommit={value => onIntent({ objectId: object.id, property: 'letterSpacing', value })} disabled={!can('letterSpacing')} />
            </div>
            <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
              {(['left', 'center', 'right', 'justify'] as const).map(align => (
                <IconButton key={align} label={`Align text ${align}`} active={(object.style.textAlign ?? 'left') === align} disabled={!can('textAlign')} onClick={() => onIntent({ objectId: object.id, property: 'textAlign', value: align })}>
                  <span className="text-[10px] capitalize">{align === 'justify' ? 'Just' : align}</span>
                </IconButton>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {isPicture ? (
        <Section title="Picture">
          <div className="space-y-1.5">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onReplaceImage(file); event.target.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!can('assetRef')} className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] font-medium transition-colors hover:bg-white/[0.09] disabled:opacity-40">
              <ImagePlus className="h-3.5 w-3.5" /> Replace image
            </button>
            <button type="button" onClick={onRemoveBackground} disabled={!can('assetRef') || Boolean(pictureBusy)} className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[11px] font-medium transition-colors hover:bg-white/[0.09] disabled:opacity-40">
              {pictureBusy === 'background' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {pictureBusy === 'background' ? 'Removing background…' : 'Remove background'}
            </button>
            <button type="button" onClick={onMagicLayers} disabled={Boolean(pictureBusy)} className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-semibold text-primary-foreground disabled:opacity-40">
              {pictureBusy === 'magic' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {pictureBusy === 'magic' ? 'Finding the layers…' : 'Magic layers'}
            </button>
            <p className="text-[10px] leading-4 text-muted-foreground">Magic layers splits this picture, right here, into live text, its subject, its logos and a filled-in background. Undo puts it back.</p>
          </div>
        </Section>
      ) : null}

      {!isBackground ? (
        <EffectsPanel object={object} disabled={locked} onPreview={onPreview} onFx={patch => onIntent({ objectId: object.id, property: 'fx', value: patch })} />
      ) : null}

      {!isBackground ? (
        <Section title="Arrange">
          <div className="flex gap-0.5 rounded-md bg-white/[0.03] p-0.5">
            <IconButton label="Bring forward" onClick={() => onReorder('up')} disabled={locked}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Send backward" onClick={() => onReorder('down')} disabled={locked}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Duplicate" onClick={onDuplicate} disabled={locked}><Copy className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Delete" onClick={onDelete} disabled={locked}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          </div>
        </Section>
      ) : null}
    </div>
  )
}
