import type { ReactNode } from 'react'
import { BLEND_MODES, ENTER_ANIMATIONS, LOOP_ANIMATIONS, type DesignObject, type ObjectEffects } from '../../core/design-document'
import { SHADOW_PRESETS, type ShadowPreset } from '../../lib/canvas-fx'
import { Play } from '../ui/icons'
import SpydaSelect from '../ui/SpydaSelect'

/**
 * Effects and motion for one layer: shadows and glows, gradients, blend modes,
 * blur and picture adjustments, then how the layer enters and moves. Every
 * control writes one `fx` patch, so it undoes like any other edit.
 */

type Patch = Partial<Record<keyof ObjectEffects, unknown>>

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="w-16 shrink-0">{label}</span>
      {children}
    </label>
  )
}

function Slider({ value, min, max, step = 1, onChange, disabled, label }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void; disabled?: boolean; label: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-[#9dfab0]"
      />
      <span className="w-8 text-right font-mono text-[10px] text-foreground/80">{Math.round(value * 100) / 100}</span>
    </span>
  )
}

function Chip({ active, onClick, children, title, disabled }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`h-7 rounded-md px-2 text-[10px] font-medium capitalize transition-colors disabled:opacity-40 ${active ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] text-foreground/85 hover:bg-white/[0.1]'}`}
    >
      {children}
    </button>
  )
}

function Swatch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-white/15" style={{ background: value }}>
      <input type="color" aria-label={label} value={/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000'} onChange={event => onChange(event.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
  )
}

const GRADIENTS = [
  { name: 'Spyda', from: '#9DFAB0', to: '#12866F', angle: 135 },
  { name: 'Sunset', from: '#FF7A59', to: '#FF2E93', angle: 120 },
  { name: 'Ocean', from: '#45C3FF', to: '#3A2BD6', angle: 135 },
  { name: 'Gold', from: '#FFE27A', to: '#E08A1E', angle: 90 },
  { name: 'Aurora', from: '#B6FF6A', to: '#7B3BFF', angle: 45 },
  { name: 'Mono', from: '#FFFFFF', to: '#8A8F98', angle: 90 },
] as const

const ENTER_LABELS: Record<(typeof ENTER_ANIMATIONS)[number], string> = {
  fade: 'Fade', rise: 'Rise', drop: 'Drop', 'slide-left': 'Slide ←', 'slide-right': 'Slide →', zoom: 'Zoom',
  pop: 'Pop', spin: 'Spin', blur: 'Focus', typewriter: 'Type', bounce: 'Bounce', flip: 'Flip',
}

export default function EffectsPanel({ object, onFx, onPreview, disabled }: {
  object: DesignObject
  onFx: (patch: Patch) => void
  onPreview?: () => void
  disabled?: boolean
}) {
  const fx = object.style.fx ?? {}
  const isText = object.kind === 'text' || object.kind === 'action'
  const isPicture = ['image', 'logo', 'icon', 'qr-code'].includes(object.kind)
  const gradientable = !isPicture && !(isText && object.content.assetRef)
  const shadow = fx.shadow
  const activePreset = shadow
    ? (Object.entries(SHADOW_PRESETS).find(([, preset]) => preset.blur === shadow.blur && preset.x === shadow.x && preset.y === shadow.y && preset.color.toUpperCase() === shadow.color.toUpperCase())?.[0] as ShadowPreset | undefined)
    : undefined
  const distance = shadow ? Math.round(Math.hypot(shadow.x, shadow.y)) : 0
  const angle = shadow ? Math.round((Math.atan2(shadow.y, shadow.x) * 180) / Math.PI) : 90
  const setShadow = (next: Partial<NonNullable<ObjectEffects['shadow']>>) => onFx({ shadow: { ...(shadow ?? SHADOW_PRESETS.soft), ...next } })
  const setOffset = (d: number, a: number) => setShadow({ x: Math.round(Math.cos((a * Math.PI) / 180) * d * 10) / 10, y: Math.round(Math.sin((a * Math.PI) / 180) * d * 10) / 10 })

  return (
    <div className={`space-y-0 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-foreground/90">Shadow &amp; glow</h3>
          {shadow ? <button type="button" onClick={() => onFx({ shadow: null })} className="text-[10px] text-muted-foreground hover:text-foreground">Remove</button> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={!shadow} onClick={() => onFx({ shadow: null })}>None</Chip>
          {(Object.keys(SHADOW_PRESETS) as ShadowPreset[]).map(name => (
            <Chip key={name} active={activePreset === name} onClick={() => onFx({ shadow: { ...SHADOW_PRESETS[name] } })}>{name}</Chip>
          ))}
        </div>
        {shadow ? (
          <div className="mt-2 space-y-1.5">
            <Row label="Colour"><Swatch value={shadow.color} onChange={color => setShadow({ color })} label="Shadow colour" /><span className="font-mono text-[10px] text-foreground/80">{shadow.color}</span></Row>
            <Row label="Blur"><Slider label="Shadow blur" value={shadow.blur} min={0} max={160} onChange={blur => setShadow({ blur })} /></Row>
            <Row label="Distance"><Slider label="Shadow distance" value={distance} min={0} max={120} onChange={d => setOffset(d, angle)} /></Row>
            <Row label="Angle"><Slider label="Shadow angle" value={angle} min={-180} max={180} onChange={a => setOffset(distance || 1, a)} /></Row>
            <Row label="Opacity"><Slider label="Shadow opacity" value={shadow.opacity} min={0} max={1} step={0.01} onChange={opacity => setShadow({ opacity })} /></Row>
          </div>
        ) : null}
      </section>

      {gradientable ? (
        <section className="border-b border-white/[0.06] px-0.5 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold text-foreground/90">Gradient fill</h3>
            {fx.gradient ? <button type="button" onClick={() => onFx({ gradient: null })} className="text-[10px] text-muted-foreground hover:text-foreground">Solid</button> : null}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {GRADIENTS.map(preset => (
              <button
                key={preset.name}
                type="button"
                title={preset.name}
                aria-label={`${preset.name} gradient`}
                onClick={() => onFx({ gradient: { from: preset.from, to: preset.to, angle: preset.angle } })}
                className={`h-7 rounded-md border transition-transform hover:scale-105 ${fx.gradient?.from === preset.from && fx.gradient?.to === preset.to ? 'border-white' : 'border-white/10'}`}
                style={{ background: `linear-gradient(${preset.angle + 90}deg, ${preset.from}, ${preset.to})` }}
              />
            ))}
          </div>
          {fx.gradient ? (
            <div className="mt-2 space-y-1.5">
              <Row label="Colours">
                <Swatch value={fx.gradient.from} onChange={from => onFx({ gradient: { ...fx.gradient!, from } })} label="Gradient start" />
                <span className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${fx.gradient.from}, ${fx.gradient.to})` }} />
                <Swatch value={fx.gradient.to} onChange={to => onFx({ gradient: { ...fx.gradient!, to } })} label="Gradient end" />
              </Row>
              <Row label="Angle"><Slider label="Gradient angle" value={fx.gradient.angle} min={0} max={360} onChange={value => onFx({ gradient: { ...fx.gradient!, angle: value } })} /></Row>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <h3 className="mb-2 text-[10px] font-semibold text-foreground/90">{isPicture ? 'Adjust' : 'Blend & blur'}</h3>
        <div className="space-y-1.5">
          <Row label="Blend">
            <SpydaSelect
              ariaLabel="Blend mode"
              value={fx.blend ?? 'normal'}
              onChange={value => onFx({ blend: value === 'normal' ? undefined : value })}
              options={BLEND_MODES.map(mode => ({ value: mode as string, label: mode.replace('-', ' ').replace(/^./, c => c.toUpperCase()) }))}
              className="h-7 min-w-0 flex-1 rounded-md bg-white/[0.04] px-2 text-[11px] hover:bg-white/[0.08]"
            />
          </Row>
          <Row label="Blur"><Slider label="Layer blur" value={fx.blur ?? 0} min={0} max={40} step={0.5} onChange={value => onFx({ blur: value || undefined })} /></Row>
          {isPicture ? (
            <>
              <Row label="Brightness"><Slider label="Brightness" value={fx.brightness ?? 0} min={-0.6} max={0.6} step={0.01} onChange={value => onFx({ brightness: value || undefined })} /></Row>
              <Row label="Contrast"><Slider label="Contrast" value={fx.contrast ?? 0} min={-60} max={60} onChange={value => onFx({ contrast: value || undefined })} /></Row>
              <Row label="Saturation"><Slider label="Saturation" value={fx.saturation ?? 0} min={-2} max={2} step={0.05} onChange={value => onFx({ saturation: value || undefined })} /></Row>
              <div className="flex gap-1">
                <Chip active={Boolean(fx.grayscale)} onClick={() => onFx({ grayscale: fx.grayscale ? undefined : true })}>Black &amp; white</Chip>
                <Chip onClick={() => onFx({ brightness: undefined, contrast: undefined, saturation: undefined, grayscale: undefined, blur: undefined })}>Reset</Chip>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="border-b border-white/[0.06] px-0.5 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-foreground/90">Animation</h3>
          {onPreview ? (
            <button type="button" onClick={onPreview} className="inline-flex h-6 items-center gap-1 rounded-md bg-white/[0.06] px-2 text-[10px] font-semibold hover:bg-white/[0.12]">
              <Play className="h-3 w-3" /> Preview
            </button>
          ) : null}
        </div>
        <p className="mb-1 text-[10px] text-muted-foreground">Entrance</p>
        <div className="grid grid-cols-4 gap-1">
          <Chip active={!fx.enter} onClick={() => onFx({ enter: null })}>None</Chip>
          {ENTER_ANIMATIONS.filter(type => type !== 'typewriter' || isText).map(type => (
            <Chip key={type} active={fx.enter?.type === type} onClick={() => onFx({ enter: { type, duration: fx.enter?.duration ?? 0.7, delay: fx.enter?.delay ?? 0 } })}>{ENTER_LABELS[type]}</Chip>
          ))}
        </div>
        {fx.enter ? (
          <div className="mt-2 space-y-1.5">
            <Row label="Duration"><Slider label="Animation duration" value={fx.enter.duration} min={0.1} max={4} step={0.05} onChange={duration => onFx({ enter: { ...fx.enter!, duration } })} /></Row>
            <Row label="Delay"><Slider label="Animation delay" value={fx.enter.delay} min={0} max={8} step={0.05} onChange={delay => onFx({ enter: { ...fx.enter!, delay } })} /></Row>
          </div>
        ) : null}
        <p className="mb-1 mt-2.5 text-[10px] text-muted-foreground">Then keeps moving</p>
        <div className="grid grid-cols-4 gap-1">
          <Chip active={!fx.loop} onClick={() => onFx({ loop: null })}>Still</Chip>
          {LOOP_ANIMATIONS.map(loop => <Chip key={loop} active={fx.loop === loop} onClick={() => onFx({ loop })}>{loop}</Chip>)}
        </div>
      </section>
    </div>
  )
}
