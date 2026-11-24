import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { sampleCurve, wheelVector, STRAIGHT, type CurvePoints, type Curves, type Wheel } from '../../lib/video/color'

/**
 * The Color page's controls: colour wheels (drag the dot towards a colour,
 * the slider below for brighter or darker), curves (drag the line), and
 * scopes that read the picture so you can trust what you see.
 */

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The wheel's face, painted with exactly the colours its dot pushes towards. */
function paintWheel(canvas: HTMLCanvasElement) {
  const size = canvas.width
  const context = canvas.getContext('2d')
  if (!context) return
  const image = context.createImageData(size, size)
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px / (size - 1)) * 2 - 1, y = (py / (size - 1)) * 2 - 1
    const d = Math.hypot(x, y)
    const i = (py * size + px) * 4
    if (d > 1) { image.data[i + 3] = 0; continue }
    const [r, g, b] = wheelVector({ x, y, level: 0 }, 1, 0)
    image.data[i] = clamp(Math.round((0.32 + r * 0.9) * 255), 0, 255)
    image.data[i + 1] = clamp(Math.round((0.32 + g * 0.9) * 255), 0, 255)
    image.data[i + 2] = clamp(Math.round((0.32 + b * 0.9) * 255), 0, 255)
    image.data[i + 3] = Math.round(255 * clamp((1 - d) * 40, 0, 1))
  }
  context.putImageData(image, 0, 0)
}

export function ColorWheel({ label, hint, value, onChange, onReset }: { label: string; hint: string; value: Wheel; onChange: (wheel: Wheel, key: string) => void; onReset: () => void }) {
  const face = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => { if (face.current) paintWheel(face.current) }, [])
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fine = event.shiftKey ? 0.25 : 1
    const start = { x: value.x, y: value.y, cx: event.clientX, cy: event.clientY }
    const place = (clientX: number, clientY: number, jump: boolean) => {
      let x: number, y: number
      if (jump) { x = ((clientX - rect.left) / rect.width) * 2 - 1; y = ((clientY - rect.top) / rect.height) * 2 - 1 }
      else { x = start.x + ((clientX - start.cx) / rect.width) * 2 * fine; y = start.y + ((clientY - start.cy) / rect.height) * 2 * fine }
      const d = Math.hypot(x, y)
      if (d > 1) { x /= d; y /= d }
      onChange({ ...value, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }, `wheel:${label}`)
    }
    // Clicking the face puts the dot there; dragging the dot moves it from where it was (Shift: finer).
    const onDot = (event.target as HTMLElement).dataset.dot === '1'
    if (!onDot) place(event.clientX, event.clientY, true)
    const move = (moveEvent: PointerEvent) => place(moveEvent.clientX, moveEvent.clientY, !onDot)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const strength = Math.round(Math.min(1, Math.hypot(value.x, value.y)) * 100)
  return (
    <div className="flex w-[150px] flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between">
        <p className="text-[11px] font-semibold" title={hint}>{label}</p>
        <button type="button" onClick={onReset} className="text-[9px] text-muted-foreground hover:text-foreground" title={`Reset ${label.toLowerCase()}`}>Reset</button>
      </div>
      <div
        role="slider"
        aria-label={`${label} colour`}
        aria-valuetext={strength ? `${strength}% push` : 'Neutral'}
        tabIndex={0}
        onPointerDown={drag}
        onDoubleClick={() => onChange({ ...value, x: 0, y: 0 }, `wheel:${label}:reset`)}
        onKeyDown={event => {
          const step = event.shiftKey ? 0.1 : 0.02
          const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          const delta = keys[event.key]
          if (!delta) return
          event.preventDefault(); event.stopPropagation()
          onChange({ ...value, x: clamp(value.x + delta[0], -1, 1), y: clamp(value.y + delta[1], -1, 1) }, `wheel:${label}`)
        }}
        className="relative h-[128px] w-[128px] cursor-crosshair touch-none rounded-full ring-1 ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={`${hint}. Drag the dot towards a colour; double-click to centre it.`}
      >
        <canvas ref={face} width={128} height={128} className="h-full w-full rounded-full" aria-hidden="true" />
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 bg-white/30" />
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-y-1/2 bg-white/30" />
        <span
          data-dot="1"
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-black/40 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.6)] active:cursor-grabbing"
          style={{ left: `${50 + value.x * 50}%`, top: `${50 + value.y * 50}%` }}
        />
      </div>
      <label className="flex w-full items-center gap-2 text-[10px] text-muted-foreground" title="Darker or brighter">
        <span className="w-3 text-center">−</span>
        <input type="range" min={-1} max={1} step={0.01} value={value.level} onChange={event => onChange({ ...value, level: Number(event.target.value) }, `wheel:${label}:level`)} onDoubleClick={() => onChange({ ...value, level: 0 }, `wheel:${label}:level`)} aria-label={`${label} brightness`} className="min-w-0 flex-1 accent-[#9dfab0]" />
        <span className="w-3 text-center">+</span>
      </label>
      <p className="font-mono text-[9px] text-muted-foreground">{strength ? `${strength}% colour` : 'No colour'} · {value.level > 0 ? '+' : ''}{Math.round(value.level * 100)}</p>
    </div>
  )
}

const CHANNELS: Array<{ id: keyof Curves; label: string; color: string }> = [
  { id: 'master', label: 'All', color: '#e8e8ea' },
  { id: 'r', label: 'Red', color: '#ff6b6b' },
  { id: 'g', label: 'Green', color: '#6bff8f' },
  { id: 'b', label: 'Blue', color: '#6bb5ff' },
]

export function CurvesEditor({ curves, onChange }: { curves: Curves; onChange: (curves: Curves, key: string) => void }) {
  const [channel, setChannel] = useState<keyof Curves>('master')
  const box = useRef<SVGSVGElement | null>(null)
  const size = 200
  const points = curves[channel]
  const tone = CHANNELS.find(item => item.id === channel)!.color
  const path = Array.from({ length: 65 }, (_, i) => { const x = i / 64; return `${i ? 'L' : 'M'}${(x * size).toFixed(1)},${((1 - sampleCurve(points, x)) * size).toFixed(1)}` }).join(' ')
  const set = (next: CurvePoints, key = `curve:${channel}`) => onChange({ ...curves, [channel]: [...next].sort((a, b) => a[0] - b[0]) }, key)
  const toPoint = (clientX: number, clientY: number): [number, number] => {
    const rect = box.current!.getBoundingClientRect()
    return [clamp((clientX - rect.left) / rect.width, 0, 1), clamp(1 - (clientY - rect.top) / rect.height, 0, 1)]
  }
  const startDrag = (index: number, list: CurvePoints) => {
    const isEnd = index === 0 || index === list.length - 1
    const move = (event: PointerEvent) => {
      const [x, y] = toPoint(event.clientX, event.clientY)
      const next = list.map(point => [...point] as [number, number])
      const left = index > 0 ? next[index - 1][0] + 0.01 : 0
      const right = index < next.length - 1 ? next[index + 1][0] - 0.01 : 1
      next[index] = [isEnd ? next[index][0] : clamp(x, left, right), y]
      list = next
      set(next)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div role="radiogroup" aria-label="Curve" className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {CHANNELS.map(item => (
            <button key={item.id} type="button" role="radio" aria-checked={channel === item.id} onClick={() => setChannel(item.id)} className={`h-6 rounded px-2 text-[10px] font-semibold ${channel === item.id ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />{item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => set(STRAIGHT, `curve:${channel}:reset`)} className="text-[9px] text-muted-foreground hover:text-foreground">Reset</button>
      </div>
      <svg
        ref={box}
        viewBox={`0 0 ${size} ${size}`}
        className="h-[200px] w-[200px] cursor-crosshair touch-none rounded-lg bg-black/40 ring-1 ring-white/10"
        onPointerDown={event => {
          if ((event.target as Element).getAttribute('data-point')) return
          const point = toPoint(event.clientX, event.clientY)
          if (points.length >= 12) return
          const next = [...points, point].sort((a, b) => a[0] - b[0])
          set(next)
          startDrag(next.indexOf(point), next)
        }}
        role="img"
        aria-label={`${CHANNELS.find(item => item.id === channel)!.label} curve: click to add a point, drag to bend, double-click a point to remove it`}
      >
        {[1, 2, 3].map(i => <g key={i}><line x1={(i * size) / 4} y1={0} x2={(i * size) / 4} y2={size} stroke="rgba(255,255,255,0.07)" /><line x1={0} y1={(i * size) / 4} x2={size} y2={(i * size) / 4} stroke="rgba(255,255,255,0.07)" /></g>)}
        <line x1={0} y1={size} x2={size} y2={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={tone} strokeWidth={2} />
        {points.map((point, index) => (
          <circle
            key={`${index}-${point[0]}`}
            data-point="1"
            cx={point[0] * size}
            cy={(1 - point[1]) * size}
            r={5}
            fill="#111214"
            stroke={tone}
            strokeWidth={2}
            className="cursor-grab"
            onPointerDown={event => { event.stopPropagation(); startDrag(index, points) }}
            onDoubleClick={() => { if (index > 0 && index < points.length - 1) set(points.filter((_, i) => i !== index)) }}
          />
        ))}
      </svg>
      <p className="w-[200px] text-[9px] leading-3 text-muted-foreground">Click to add a point, drag to bend. Up brightens, down darkens; an S-shape adds contrast.</p>
    </div>
  )
}

type ScopeKind = 'waveform' | 'histogram' | 'vectorscope'

/** Waveform, histogram or vectorscope of a small copy of the frame. */
export function Scopes({ sample }: { sample: ImageData | null }) {
  const [kind, setKind] = useState<ScopeKind>('waveform')
  const canvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const target = canvas.current
    const context = target?.getContext('2d')
    if (!target || !context) return
    const w = target.width, h = target.height
    context.fillStyle = '#08090b'
    context.fillRect(0, 0, w, h)
    context.strokeStyle = 'rgba(255,255,255,0.08)'
    context.lineWidth = 1
    if (!sample) return
    const data = sample.data
    if (kind === 'waveform') {
      for (const level of [0.25, 0.5, 0.75]) { context.beginPath(); context.moveTo(0, h * (1 - level)); context.lineTo(w, h * (1 - level)); context.stroke() }
      const image = context.getImageData(0, 0, w, h)
      const hits = new Float32Array(w * h)
      for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
        const i = (y * sample.width + x) * 4
        const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
        const px = Math.floor((x / sample.width) * w), py = Math.min(h - 1, Math.floor((1 - luma) * (h - 1)))
        hits[py * w + px] += 1
      }
      for (let i = 0; i < hits.length; i++) {
        if (!hits[i]) continue
        const v = Math.min(255, 50 + hits[i] * 40)
        image.data[i * 4] = Math.max(image.data[i * 4], v * 0.62); image.data[i * 4 + 1] = Math.max(image.data[i * 4 + 1], v); image.data[i * 4 + 2] = Math.max(image.data[i * 4 + 2], v * 0.7)
      }
      context.putImageData(image, 0, 0)
    } else if (kind === 'histogram') {
      const bins = [new Float32Array(64), new Float32Array(64), new Float32Array(64)]
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) bins[c][data[i + c] >> 2] += 1
      const peak = Math.max(1, ...bins.flatMap(bin => [...bin]))
      context.globalCompositeOperation = 'lighter'
      ;['rgba(255,90,90,0.75)', 'rgba(90,255,130,0.75)', 'rgba(90,160,255,0.75)'].forEach((color, c) => {
        context.fillStyle = color
        context.beginPath(); context.moveTo(0, h)
        for (let b = 0; b < 64; b++) context.lineTo((b / 63) * w, h - (bins[c][b] / peak) * (h - 4))
        context.lineTo(w, h); context.closePath(); context.fill()
      })
      context.globalCompositeOperation = 'source-over'
    } else {
      const cx = w / 2, cy = h / 2, radius = Math.min(w, h) / 2 - 4
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke()
      context.beginPath(); context.moveTo(cx - radius, cy); context.lineTo(cx + radius, cy); context.moveTo(cx, cy - radius); context.lineTo(cx, cy + radius); context.stroke()
      // Skin tones sit along this line.
      context.strokeStyle = 'rgba(255,190,140,0.35)'
      context.beginPath(); context.moveTo(cx, cy); context.lineTo(cx + Math.cos(-2.15) * radius, cy + Math.sin(-2.15) * radius); context.stroke()
      for (let i = 0; i < data.length; i += 8) {
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
        const cb = -0.1146 * r - 0.3854 * g + 0.5 * b, cr = 0.5 * r - 0.4542 * g - 0.0458 * b
        context.fillStyle = `rgba(${data[i]},${data[i + 1]},${data[i + 2]},0.5)`
        context.fillRect(cx + cb * radius * 1.8, cy - cr * radius * 1.8, 1.5, 1.5)
      }
    }
  }, [kind, sample])
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Scope" className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
        {([['waveform', 'Waveform'], ['histogram', 'Histogram'], ['vectorscope', 'Vectorscope']] as const).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`h-6 flex-1 rounded text-[10px] font-semibold ${kind === id ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>
      <canvas ref={canvas} width={268} height={kind === 'vectorscope' ? 220 : 150} className="w-full rounded-lg ring-1 ring-white/10" aria-label={`${kind} of the frame`} />
      <p className="text-[9px] leading-4 text-muted-foreground">
        {kind === 'waveform' ? 'Brightness across the picture, left to right. Keep it between the bottom and the top: touching them means lost detail.'
          : kind === 'histogram' ? 'How much of the picture is dark (left) or bright (right), per colour. Bunched to one side means too dark or too bright.'
            : 'How colourful the picture is and towards which colour. Far from the centre is vivid; the line marks skin tones.'}
      </p>
    </div>
  )
}
