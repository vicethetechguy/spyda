import { sliderFromVolume, volumeFromSlider } from '../../lib/video/timeline'

/** A volume slider: the first half goes to 100%, the second half up to 1000% (loud boosts are kept clean by the limiter). */
export default function VolumeSlider({ label, value, onChange, reset = 1 }: { label: string; value: number; onChange: (value: number) => void; reset?: number }) {
  const loud = value > 1.001
  return (
    <label className="flex items-center gap-2 text-[10px] text-muted-foreground" title="Up to 1000%. Above 100% is a boost: the limiter on the Sound page keeps it from crackling.">
      <span className="w-[72px] shrink-0">{label}</span>
      <input type="range" min={0} max={1} step={0.001} value={sliderFromVolume(value)} onChange={event => onChange(Math.round(volumeFromSlider(Number(event.target.value)) * 100) / 100)} onDoubleClick={() => onChange(reset)} className={`min-w-0 flex-1 ${loud ? 'accent-[#ffb36b]' : 'accent-[#9dfab0]'}`} aria-label={label} />
      <span className={`w-11 text-right font-mono ${loud ? 'text-[#ffb36b]' : 'text-foreground/80'}`}>{Math.round(value * 100)}%</span>
    </label>
  )
}
