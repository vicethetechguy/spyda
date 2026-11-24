import { useEffect, useRef, useState } from 'react'
import { formatTime, type AudioTrackItem, type MediaItem, type SoundLane, type SoundMix } from '../../lib/video/timeline'
import { Mic, MusicNote, Pause, Play, Trash2, Upload, Zap, Clapperboard } from '../ui/icons'
import VolumeSlider from './VolumeSlider'

/**
 * The Sound page: every sound in the project in one place. The audio library
 * (music, voice-overs and sound effects) on the left, what is on each audio
 * track in the middle, and a mixing console on the right: a fader, meter,
 * pan, mute and solo per track, voice clean-up, and the master with a limiter.
 */

type Lane = 'voice' | 'music' | 'sfx'
type Levels = Record<SoundLane | 'master', number>

const LANES: Array<{ id: SoundLane; label: string; icon: typeof Mic; tint: string }> = [
  { id: 'video', label: 'Video sound', icon: Clapperboard, tint: '#9dfab0' },
  { id: 'voice', label: 'Voice', icon: Mic, tint: '#ff8fa3' },
  { id: 'music', label: 'Music', icon: MusicNote, tint: '#ffb36b' },
  { id: 'sfx', label: 'Sound effects', icon: Zap, tint: '#7cc7ff' },
]

/** Channel faders: 0..100% over the first 60% of the travel, then up to 400%. */
const faderToGain = (p: number) => (p <= 0.6 ? p / 0.6 : 1 + ((p - 0.6) / 0.4) * 3)
const gainToFader = (g: number) => (g <= 1 ? g * 0.6 : 0.6 + ((Math.min(4, g) - 1) / 3) * 0.4)
const decibels = (gain: number) => (gain <= 0.0001 ? '−∞' : `${(20 * Math.log10(gain)) >= 0 ? '+' : ''}${(20 * Math.log10(gain)).toFixed(1)} dB`)

/** A level meter that reads the sound as it plays. */
function Meter({ read }: { read: () => number }) {
  const bar = useRef<HTMLDivElement | null>(null)
  const peak = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let frame = 0
    let held = 0, heldAt = 0
    const tick = () => {
      const level = Math.min(1, read())
      const now = performance.now()
      if (level >= held || now - heldAt > 900) { held = level; heldAt = now }
      if (bar.current) bar.current.style.height = `${Math.round(level * 100)}%`
      if (peak.current) { peak.current.style.bottom = `${Math.round(held * 100)}%`; peak.current.style.background = held > 0.97 ? '#ff5f57' : '#ffffff' }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [read])
  return (
    <div className="relative h-full w-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10" aria-hidden="true">
      <div ref={bar} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#9dfab0] via-[#ffe066] to-[#ff5f57]" style={{ height: 0 }} />
      <div ref={peak} className="absolute inset-x-0 h-0.5" style={{ bottom: 0 }} />
    </div>
  )
}

export default function SoundPage(props: {
  media: MediaItem[]
  audio: AudioTrackItem[]
  videoClipsWithSound: number
  sound: SoundMix
  onSound: (next: SoundMix, key: string) => void
  duck: { on: boolean; amount: number }
  onDuck: (next: { on: boolean; amount: number }) => void
  time: number
  end: number
  playing: boolean
  onPlay: () => void
  onStop: () => void
  onSeek: (t: number) => void
  levels: () => Levels
  onAdd: (item: MediaItem, lane: Lane) => void
  onUpdate: (id: string, patch: Partial<AudioTrackItem>, key?: string) => void
  onRemove: (id: string) => void
  onImport: () => void
}) {
  const { media, audio, videoClipsWithSound, sound, onSound, duck, onDuck, time, end, playing, onPlay, onStop, onSeek, levels, onAdd, onUpdate, onRemove, onImport } = props
  const [filter, setFilter] = useState<'all' | 'music' | 'sfx'>('all')
  const [listening, setListening] = useState<string | null>(null)
  const preview = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => preview.current?.pause(), [])
  // Your own music and voice-overs first, then Spyda's sound effects.
  const library = media.filter(item => item.kind === 'audio' && (filter === 'all' || (filter === 'sfx' ? item.sfx : !item.sfx))).sort((a, b) => Number(Boolean(a.sfx)) - Number(Boolean(b.sfx)))
  const listen = (item: MediaItem) => {
    preview.current?.pause()
    if (listening === item.id) { setListening(null); return }
    const element = new Audio(item.url)
    preview.current = element
    element.onended = () => setListening(null)
    setListening(item.id)
    void element.play().catch(() => setListening(null))
  }
  const setChannel = (lane: SoundLane, patch: Partial<SoundMix['lanes'][SoundLane]>, key: string) => onSound({ ...sound, lanes: { ...sound.lanes, [lane]: { ...sound.lanes[lane], ...patch } } }, key)
  const nameOf = (id: string) => media.find(item => item.id === id)?.name ?? 'Audio'

  return (
    <div className="mac-workspace flex min-h-0 flex-1">
      {/* Library */}
      <aside className="mac-sidebar flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111214] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold">Audio library</p>
          <button type="button" onClick={onImport} className="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.06] px-2 text-[10px] font-semibold hover:bg-white/[0.1]"><Upload className="h-3 w-3" /> Import</button>
        </div>
        <div role="radiogroup" aria-label="Show" className="mb-2 grid grid-cols-3 gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {([['all', 'All'], ['music', 'Music & voice'], ['sfx', 'Effects']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)} className={`h-6 rounded text-[10px] font-semibold ${filter === id ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
          ))}
        </div>
        <ul className="space-y-1.5">
          {library.map(item => (
            <li key={item.id} className="rounded-lg border border-white/[0.07] bg-black/20 p-1.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => listen(item)} aria-label={listening === item.id ? `Stop ${item.name}` : `Listen to ${item.name}`} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${listening === item.id ? 'bg-primary text-primary-foreground' : 'bg-white/[0.08] hover:bg-white/[0.14]'}`}>
                  {listening === item.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[1px]" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium">{item.name}</span>
                  <span className="block font-mono text-[9px] text-muted-foreground">{item.sfx ? 'Sound effect' : 'Audio'} · {formatTime(item.duration)}</span>
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {(item.sfx ? (['sfx'] as const) : (['music', 'voice', 'sfx'] as const)).map(lane => (
                  <button key={lane} type="button" onClick={() => onAdd(item, lane)} className={`h-6 rounded text-[9px] font-semibold hover:bg-white/[0.1] ${item.sfx ? 'col-span-3' : ''} bg-white/[0.05]`} title={`Add to the ${lane === 'sfx' ? 'SFX' : lane} track at the playhead`}>
                    + {lane === 'sfx' ? 'SFX' : lane === 'voice' ? 'Voice' : 'Music'}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {!library.length ? <li><button type="button" onClick={onImport} className="w-full rounded-lg border border-dashed border-white/[0.14] px-3 py-6 text-[10px] text-muted-foreground hover:border-primary/50">Import music or a voice-over (MP3, WAV, M4A)</button></li> : null}
        </ul>
      </aside>

      {/* Tracks */}
      <section className="mac-window flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
          <button type="button" onClick={() => onSeek(0)} aria-label="Go to start" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground">⏮</button>
          <button type="button" onClick={playing ? onStop : onPlay} aria-label={playing ? 'Pause' : 'Play'} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}</button>
          <span className="rounded-md bg-black/30 px-2 py-1 font-mono text-[11px] tabular-nums">{formatTime(time)} <span className="text-muted-foreground">/ {formatTime(end)}</span></span>
          <input type="range" min={0} max={Math.max(0.1, end)} step={0.01} value={Math.min(time, end)} onChange={event => onSeek(Number(event.target.value))} aria-label="Playhead" className="min-w-0 flex-1 accent-[#9dfab0]" />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-[10px] text-muted-foreground">{videoClipsWithSound ? `Video sound: ${videoClipsWithSound} ${videoClipsWithSound === 1 ? 'clip' : 'clips'} with their own sound (set each clip's volume on the Edit page).` : 'No video clips with sound yet.'}</p>
          {(['voice', 'music', 'sfx'] as const).map(lane => {
            const items = audio.filter(item => (item.lane ?? 'music') === lane).sort((a, b) => a.start - b.start)
            const info = LANES.find(entry => entry.id === lane)!
            return (
              <div key={lane}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><info.icon className="h-3.5 w-3.5" style={{ color: info.tint }} /> {info.label} <span className="rounded bg-white/[0.06] px-1 font-mono text-[9px] normal-case tracking-normal">{items.length}</span></p>
                {items.length ? (
                  <ul className="space-y-1.5">
                    {items.map(item => (
                      <li key={item.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2" style={{ borderLeft: `3px solid ${info.tint}` }}>
                        <div className="mb-1 flex items-center gap-2">
                          <button type="button" onClick={() => onSeek(item.start)} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:text-primary" title="Jump to it">{nameOf(item.mediaId)}</button>
                          <span className="font-mono text-[9px] text-muted-foreground">{formatTime(item.start)} – {formatTime(item.start + item.out - item.in)}</span>
                          <button type="button" onClick={() => onRemove(item.id)} aria-label="Remove" className="rounded p-1 text-muted-foreground hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
                        </div>
                        <VolumeSlider label="Volume" value={item.volume} reset={lane === 'music' ? 0.8 : 1} onChange={volume => onUpdate(item.id, { volume }, `audio:${item.id}:volume`)} />
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground">Fade in<input type="range" min={0} max={Math.min(10, (item.out - item.in) / 2)} step={0.1} value={item.fadeIn} onChange={event => onUpdate(item.id, { fadeIn: Number(event.target.value) }, `audio:${item.id}:fadein`)} className="min-w-0 flex-1 accent-[#9dfab0]" /><span className="w-7 font-mono">{item.fadeIn.toFixed(1)}s</span></label>
                          <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground">Fade out<input type="range" min={0} max={Math.min(10, (item.out - item.in) / 2)} step={0.1} value={item.fadeOut} onChange={event => onUpdate(item.id, { fadeOut: Number(event.target.value) }, `audio:${item.id}:fadeout`)} className="min-w-0 flex-1 accent-[#9dfab0]" /><span className="w-7 font-mono">{item.fadeOut.toFixed(1)}s</span></label>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="rounded-md bg-white/[0.02] px-2 py-2 text-[10px] text-muted-foreground">Nothing on this track. Add from the library on the left.</p>}
              </div>
            )
          })}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <label className="flex items-center justify-between gap-2 text-[11px] font-semibold">
              Lower music while someone speaks
              <input type="checkbox" checked={duck.on} onChange={event => onDuck({ on: event.target.checked, amount: duck.amount })} className="accent-[#9dfab0]" />
            </label>
            {duck.on ? (
              <label className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[72px] shrink-0">Lower by</span><input type="range" min={0.1} max={0.95} step={0.05} value={duck.amount} onChange={event => onDuck({ on: true, amount: Number(event.target.value) })} className="min-w-0 flex-1 accent-[#9dfab0]" /><span className="w-10 text-right font-mono">{Math.round(duck.amount * 100)}%</span></label>
            ) : null}
          </div>
        </div>
      </section>

      {/* Console */}
      <aside className="mac-sidebar flex shrink-0 flex-col border-l border-white/[0.06] bg-[#111214] p-3">
        <p className="mb-2 text-[12px] font-semibold">Mixer</p>
        <div className="flex min-h-0 flex-1 gap-2">
          {LANES.map(lane => {
            const channel = sound.lanes[lane.id]
            return (
              <div key={lane.id} className="flex w-[74px] flex-col items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-1.5 py-2">
                <lane.icon className="h-4 w-4" style={{ color: lane.tint }} />
                <p className="h-6 text-center text-[9px] font-semibold leading-3">{lane.label}</p>
                <div className="flex h-[190px] items-stretch gap-1.5">
                  <input type="range" min={0} max={1} step={0.001} value={gainToFader(channel.volume)} onChange={event => setChannel(lane.id, { volume: Math.round(faderToGain(Number(event.target.value)) * 100) / 100 }, `sound:${lane.id}:volume`)} onDoubleClick={() => setChannel(lane.id, { volume: 1 }, `sound:${lane.id}:volume`)} aria-label={`${lane.label} level`} className="h-full w-5 accent-[#9dfab0]" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
                  <Meter read={() => levels()[lane.id]} />
                </div>
                <p className={`font-mono text-[9px] ${channel.volume > 1 ? 'text-[#ffb36b]' : 'text-muted-foreground'}`}>{decibels(channel.volume)}</p>
                <label className="w-full text-center text-[8px] text-muted-foreground" title="Left or right">Pan
                  <input type="range" min={-1} max={1} step={0.01} value={channel.pan} onChange={event => setChannel(lane.id, { pan: Number(event.target.value) }, `sound:${lane.id}:pan`)} onDoubleClick={() => setChannel(lane.id, { pan: 0 }, `sound:${lane.id}:pan`)} aria-label={`${lane.label} pan`} className="w-full accent-[#9dfab0]" />
                </label>
                <div className="grid w-full grid-cols-2 gap-1">
                  <button type="button" onClick={() => setChannel(lane.id, { mute: !channel.mute }, `sound:${lane.id}:mute`)} aria-pressed={channel.mute} title="Mute" className={`h-6 rounded text-[10px] font-bold ${channel.mute ? 'bg-[#ff5f57] text-black' : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'}`}>M</button>
                  <button type="button" onClick={() => setChannel(lane.id, { solo: !channel.solo }, `sound:${lane.id}:solo`)} aria-pressed={channel.solo} title="Solo: hear only this" className={`h-6 rounded text-[10px] font-bold ${channel.solo ? 'bg-[#ffe066] text-black' : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'}`}>S</button>
                </div>
                <button type="button" onClick={() => setChannel(lane.id, { enhance: !channel.enhance }, `sound:${lane.id}:enhance`)} aria-pressed={channel.enhance} title="Cuts rumble, adds clarity and evens out loud and quiet words" className={`h-6 w-full rounded text-[8px] font-semibold leading-[9px] ${channel.enhance ? 'bg-primary text-primary-foreground' : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'}`}>Clean up</button>
              </div>
            )
          })}
          <div className="flex w-[80px] flex-col items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/[0.05] px-1.5 py-2">
            <span className="text-[12px] font-bold text-primary">M</span>
            <p className="h-6 text-center text-[9px] font-semibold leading-3">Master</p>
            <div className="flex h-[190px] items-stretch gap-1.5">
              <input type="range" min={0} max={1} step={0.001} value={gainToFader(sound.master)} onChange={event => onSound({ ...sound, master: Math.round(faderToGain(Number(event.target.value)) * 100) / 100 }, 'sound:master')} onDoubleClick={() => onSound({ ...sound, master: 1 }, 'sound:master')} aria-label="Master level" className="h-full w-5 accent-[#9dfab0]" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
              <Meter read={() => levels().master} />
            </div>
            <p className={`font-mono text-[9px] ${sound.master > 1 ? 'text-[#ffb36b]' : 'text-muted-foreground'}`}>{decibels(sound.master)}</p>
            <button type="button" onClick={() => onSound({ ...sound, limiter: !sound.limiter }, 'sound:limiter')} aria-pressed={sound.limiter} title="Keeps loud boosts from crackling (recommended)" className={`mt-auto h-8 w-full rounded text-[9px] font-semibold leading-[10px] ${sound.limiter ? 'bg-primary text-primary-foreground' : 'bg-white/[0.06] text-muted-foreground'}`}>Limiter {sound.limiter ? 'on' : 'off'}</button>
          </div>
        </div>
        <p className="mt-2 max-w-[400px] text-[9px] leading-4 text-muted-foreground">Faders go to +12 dB (400%); each clip and song can go to 1000%. Red at the top of a meter means it is as loud as it can be: the limiter holds it there cleanly.</p>
      </aside>
    </div>
  )
}
