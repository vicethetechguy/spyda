import { useEffect, useMemo, useState } from 'react'
import { FORMATS, formatTime } from '../../lib/video/timeline'
import { Check, Download, Loader2, Smartphone, Monitor, Square, Clapperboard } from '../ui/icons'

/**
 * The Export page: pick where the video is going and Spyda sets the size and
 * frame rate for it, choose the quality and how much of the edit to export,
 * name the file, then export. Recent exports from this visit are listed.
 */

type FormatId = (typeof FORMATS)[number]['id']
type Preset = { id: string; name: string; detail: string; format: FormatId; fps: number; icon: typeof Smartphone }

const PRESETS: Preset[] = [
  { id: 'tiktok', name: 'TikTok, Reels, Shorts', detail: '9:16 · 1080 × 1920 · 30 fps', format: 'portrait', fps: 30, icon: Smartphone },
  { id: 'youtube', name: 'YouTube', detail: '16:9 · 1920 × 1080 · 30 fps', format: 'landscape', fps: 30, icon: Monitor },
  { id: 'youtube-60', name: 'YouTube, smooth', detail: '16:9 · 1920 × 1080 · 60 fps', format: 'landscape', fps: 60, icon: Monitor },
  { id: 'feed', name: 'Instagram & Facebook feed', detail: '4:5 · 1080 × 1350 · 30 fps', format: 'post', fps: 30, icon: Square },
  { id: 'square', name: 'Square post', detail: '1:1 · 1080 × 1080 · 30 fps', format: 'square', fps: 30, icon: Square },
  { id: 'film', name: 'Film look', detail: '16:9 · 1920 × 1080 · 24 fps', format: 'landscape', fps: 24, icon: Clapperboard },
]

export type ExportRequest = { from: number; to: number; name: string }
export type ExportRecord = { name: string; length: number; size: string; at: string }

export default function ExportPage({ projectName, format, onFormat, fps, onFps, quality, qualities, onQuality, end, clipCount, cover, exporting, onExport, history }: {
  projectName: string
  format: FormatId
  onFormat: (id: FormatId) => void
  fps: number
  onFps: (fps: 24 | 30 | 60) => void
  quality: string
  qualities: ReadonlyArray<{ value: string; label: string }>
  onQuality: (value: string) => void
  end: number
  clipCount: number
  cover: string | null
  exporting: number | null
  onExport: (request: ExportRequest) => void
  history: ExportRecord[]
}) {
  const [range, setRange] = useState<'all' | 'part'>('all')
  const [from, setFrom] = useState('0')
  const [to, setTo] = useState(end.toFixed(1))
  const [name, setName] = useState(projectName)
  useEffect(() => { setTo(current => (Number(current) > end || range === 'all' ? end.toFixed(1) : current)) }, [end, range])

  const fromValue = range === 'all' ? 0 : Math.max(0, Math.min(end, Number(from) || 0))
  const toValue = range === 'all' ? end : Math.max(fromValue, Math.min(end, Number(to) || end))
  const length = toValue - fromValue
  const active = PRESETS.find(preset => preset.format === format && preset.fps === fps)
  const size = FORMATS.find(item => item.id === format) ?? FORMATS[0]
  const ready = clipCount > 0 && length >= 0.2 && exporting == null
  const estimate = useMemo(() => {
    const bits = quality === 'max' ? 2 : quality === 'standard' ? 0.5 : 1
    const megabytes = (size.width * size.height * fps * 0.27 * bits * length) / 8 / 1024 / 1024
    return megabytes < 1 ? `${Math.max(1, Math.round(megabytes * 1024))} KB` : `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`
  }, [fps, length, quality, size.height, size.width])

  return (
    <div className="mac-workspace flex min-h-0 flex-1">
      {/* Where it's going */}
      <aside className="mac-sidebar flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111214] p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Where is it going?</p>
        <div className="space-y-1.5">
          {PRESETS.map(preset => {
            const selected = active?.id === preset.id
            return (
              <button key={preset.id} type="button" onClick={() => { onFormat(preset.format); onFps(preset.fps as 24 | 30 | 60) }} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? 'border-primary/50 bg-primary/10' : 'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-white/[0.06] text-muted-foreground'}`}><preset.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">{preset.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{preset.detail}</span>
                </span>
                {selected ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Changing the size reframes your clips for it: check the Edit page if something important sits near an edge.</p>
      </aside>

      {/* The export */}
      <section className="mac-window flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[620px] flex-col gap-5 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-[120px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black ring-1 ring-white/[0.08]">
              {cover ? <img src={cover} alt="" className="h-full w-full object-contain" /> : <Clapperboard className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Exporting</p>
              <p className="truncate text-[18px] font-semibold">{projectName}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{size.width} × {size.height} · {fps} fps · {formatTime(length)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">File name</span>
              <input value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.stopPropagation()} className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-[13px] outline-none focus:border-primary/50" />
            </label>
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground">Quality</span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {qualities.map(item => (
                  <button key={item.value} type="button" onClick={() => onQuality(item.value)} aria-pressed={quality === item.value} className={`h-9 rounded-lg border text-[11px] font-semibold ${quality === item.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/[0.08] text-muted-foreground hover:text-foreground'}`}>{item.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-muted-foreground">How much</span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {([['all', `The whole edit (${formatTime(end)})`], ['part', 'Just a part']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setRange(id)} aria-pressed={range === id} className={`h-9 rounded-lg border text-[11px] font-semibold ${range === id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/[0.08] text-muted-foreground hover:text-foreground'}`}>{label}</button>
              ))}
            </div>
            {range === 'part' ? (
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <label className="flex items-center gap-1.5">From <input inputMode="decimal" value={from} onChange={event => setFrom(event.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={event => event.stopPropagation()} className="h-8 w-20 rounded-lg border border-white/[0.08] bg-black/30 px-2 font-mono outline-none focus:border-primary/50" /> s</label>
                <label className="flex items-center gap-1.5">to <input inputMode="decimal" value={to} onChange={event => setTo(event.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={event => event.stopPropagation()} className="h-8 w-20 rounded-lg border border-white/[0.08] bg-black/30 px-2 font-mono outline-none focus:border-primary/50" /> s</label>
                <span className="text-muted-foreground">= {formatTime(length)}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">About {estimate} · plays back in real time while it exports</span>
              <span className="font-mono text-muted-foreground">{formatTime(length)}</span>
            </div>
            {exporting != null ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(exporting * 100)}%` }} /></div>
            ) : null}
            <button type="button" disabled={!ready} onClick={() => onExport({ from: fromValue, to: toValue, name: name.trim() || projectName })} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
              {exporting != null ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting {Math.round(exporting * 100)}%</> : <><Download className="h-4 w-4" /> Export video</>}
            </button>
            {!clipCount ? <p className="mt-2 text-center text-[11px] text-muted-foreground">Add a clip on the Edit page first.</p> : null}
          </div>

          {history.length ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Exported this visit</p>
              <ul className="space-y-1">
                {history.map(record => (
                  <li key={record.at} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px]">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{record.name}</span>
                    <span className="font-mono text-muted-foreground">{formatTime(record.length)} · {record.size}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
