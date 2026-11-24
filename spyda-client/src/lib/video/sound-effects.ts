/**
 * Spyda's built-in sound effects. Each one is synthesized in the browser
 * (no downloads, no licences) and turned into a short WAV file, so it imports
 * and exports exactly like a song the user dropped in.
 */

export type SoundEffect = { id: string; name: string; duration: number; render: (ctx: OfflineAudioContext) => void }

const RATE = 44100

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // A fixed seed keeps every effect identical each time it is made.
  let seed = 1234567
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    data[i] = (seed / 0x3fffffff) - 1
  }
  return buffer
}

function noise(ctx: OfflineAudioContext, seconds: number) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx, seconds)
  return source
}

function envelope(ctx: OfflineAudioContext, points: Array<[number, number]>) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(points[0][1], points[0][0])
  for (const [time, value] of points.slice(1)) gain.gain.linearRampToValueAtTime(value, time)
  return gain
}

function tone(ctx: OfflineAudioContext, type: OscillatorType, from: number, to: number, start: number, length: number, peak = 0.6) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + length)
  const gain = envelope(ctx, [[start, 0], [start + 0.005, peak], [start + length, 0]])
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.02)
}

function filteredNoise(ctx: OfflineAudioContext, length: number, type: BiquadFilterType, from: number, to: number, points: Array<[number, number]>, q = 1) {
  const source = noise(ctx, length)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, 0)
  filter.frequency.exponentialRampToValueAtTime(to, length)
  source.connect(filter).connect(envelope(ctx, points)).connect(ctx.destination)
  source.start(0)
}

export const SOUND_EFFECTS: SoundEffect[] = [
  { id: 'whoosh', name: 'Whoosh', duration: 0.9, render: ctx => filteredNoise(ctx, 0.9, 'bandpass', 300, 4000, [[0, 0], [0.45, 0.9], [0.9, 0]], 0.8) },
  { id: 'swipe', name: 'Swipe', duration: 0.35, render: ctx => filteredNoise(ctx, 0.35, 'highpass', 1500, 7000, [[0, 0], [0.08, 0.7], [0.35, 0]]) },
  { id: 'riser', name: 'Riser', duration: 2.5, render: ctx => {
    filteredNoise(ctx, 2.5, 'bandpass', 200, 8000, [[0, 0], [2.3, 0.6], [2.5, 0]], 2)
    tone(ctx, 'sawtooth', 110, 880, 0, 2.5, 0.12)
  } },
  { id: 'impact', name: 'Impact', duration: 1.6, render: ctx => {
    tone(ctx, 'sine', 120, 35, 0, 1.5, 0.95)
    filteredNoise(ctx, 0.5, 'lowpass', 3000, 200, [[0, 0.8], [0.5, 0]])
  } },
  { id: 'bass-drop', name: 'Bass drop', duration: 2, render: ctx => tone(ctx, 'sine', 180, 30, 0, 1.9, 0.95) },
  { id: 'pop', name: 'Pop', duration: 0.2, render: ctx => tone(ctx, 'sine', 900, 200, 0, 0.12, 0.8) },
  { id: 'click', name: 'Click', duration: 0.08, render: ctx => filteredNoise(ctx, 0.05, 'highpass', 2000, 4000, [[0, 0.9], [0.04, 0]]) },
  { id: 'ding', name: 'Ding', duration: 1.6, render: ctx => {
    tone(ctx, 'sine', 1318, 1318, 0, 1.5, 0.5)
    tone(ctx, 'sine', 2636, 2636, 0, 0.8, 0.15)
  } },
  { id: 'chime', name: 'Notification', duration: 0.9, render: ctx => {
    tone(ctx, 'triangle', 880, 880, 0, 0.35, 0.45)
    tone(ctx, 'triangle', 1320, 1320, 0.14, 0.7, 0.45)
  } },
  { id: 'shutter', name: 'Camera shutter', duration: 0.3, render: ctx => {
    filteredNoise(ctx, 0.06, 'bandpass', 3000, 2000, [[0, 0.9], [0.06, 0]], 1.5)
    const second = noise(ctx, 0.08)
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 2400
    second.connect(filter).connect(envelope(ctx, [[0.12, 0], [0.125, 0.8], [0.2, 0]])).connect(ctx.destination)
    second.start(0.12)
  } },
  { id: 'glitch', name: 'Glitch', duration: 0.7, render: ctx => {
    for (let i = 0; i < 7; i++) tone(ctx, 'square', 200 + ((i * 397) % 1400), 100 + ((i * 211) % 900), i * 0.09, 0.06, 0.25)
  } },
  { id: 'typing', name: 'Typing', duration: 1.4, render: ctx => {
    for (let i = 0; i < 10; i++) {
      const at = i * 0.13 + ((i * 37) % 5) * 0.008
      const key = noise(ctx, 0.04)
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1800 + (i % 3) * 600; filter.Q.value = 2
      key.connect(filter).connect(envelope(ctx, [[at, 0], [at + 0.003, 0.8], [at + 0.035, 0]])).connect(ctx.destination)
      key.start(at)
    }
  } },
]

/** A 16-bit mono WAV of the samples. */
function toWav(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0)
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  write(36, 'data'); view.setUint32(40, samples.length * 2, true)
  // Normalise so every effect sits at a similar loudness, without clipping.
  let peak = 0
  for (const value of samples) peak = Math.max(peak, Math.abs(value))
  const gain = peak > 0 ? 0.9 / peak : 1
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * gain)) * 0x7fff, true)
  return new Blob([view], { type: 'audio/wav' })
}

/** Renders every sound effect to a WAV file. */
export async function renderSoundEffects(): Promise<Array<{ effect: SoundEffect; file: File }>> {
  if (typeof OfflineAudioContext === 'undefined') return []
  const out: Array<{ effect: SoundEffect; file: File }> = []
  for (const effect of SOUND_EFFECTS) {
    const ctx = new OfflineAudioContext(1, Math.ceil(effect.duration * RATE), RATE)
    effect.render(ctx)
    const buffer = await ctx.startRendering()
    out.push({ effect, file: new File([toWav(buffer)], `${effect.name}.wav`, { type: 'audio/wav' }) })
  }
  return out
}
