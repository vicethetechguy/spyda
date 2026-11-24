import { describe, expect, it } from 'vitest'
import { splitAudioAt, type AudioTrackItem } from './timeline'

const song: AudioTrackItem = { id: 'a', mediaId: 'm', start: 2, volume: 0.8, in: 1, out: 11, fadeIn: 1, fadeOut: 2, lane: 'music' }

describe('splitAudioAt', () => {
  it('splits music into two back-to-back parts at the playhead', () => {
    const parts = splitAudioAt(song, 6, () => 'b')
    expect(parts).not.toBeNull()
    const [left, right] = parts!
    expect(left).toMatchObject({ id: 'a', start: 2, in: 1, out: 5, fadeIn: 1, fadeOut: 0, lane: 'music' })
    expect(right).toMatchObject({ id: 'b', start: 6, in: 5, out: 11, fadeIn: 0, fadeOut: 2, lane: 'music' })
    // Together they play exactly the original.
    expect((left.out - left.in) + (right.out - right.in)).toBe(song.out - song.in)
  })

  it('refuses a time outside or at the very edge of the music', () => {
    expect(splitAudioAt(song, 1, () => 'b')).toBeNull()
    expect(splitAudioAt(song, 2.01, () => 'b')).toBeNull()
    expect(splitAudioAt(song, 12.5, () => 'b')).toBeNull()
  })
})

import { clipOpacity, clipTransformAt, duckingAt, keyframeValues, placeOverlays, type Clip, type VideoProject } from './timeline'

const base = { id: 'c', mediaId: 'm', in: 0, out: 4, speed: 1, volume: 1, muted: false, fit: 'contain', transform: { scale: 1, x: 0, y: 0, rotate: 0, flipX: false, flipY: false }, motion: 'none', fadeIn: 0, fadeOut: 0, grade: {}, effect: 'none', amount: 0, transition: { type: 'cut', duration: 0 } } as unknown as Clip

describe('keyframes', () => {
  const clip: Clip = { ...base, keyframes: [
    { id: 'k1', at: 0, scale: 1, x: 0, y: 0, rotate: 0, opacity: 1 },
    { id: 'k2', at: 2, scale: 2, x: 0.5, y: -0.5, rotate: 90, opacity: 0 },
  ] }

  it('holds the first and last pose outside the keyframes', () => {
    expect(keyframeValues(clip, -1)).toMatchObject({ scale: 1, x: 0 })
    expect(keyframeValues(clip, 3)).toMatchObject({ scale: 2, x: 0.5, rotate: 90 })
  })

  it('moves smoothly between keyframes (halfway is halfway)', () => {
    const mid = keyframeValues(clip, 1)!
    expect(mid.scale).toBeCloseTo(1.5)
    expect(mid.x).toBeCloseTo(0.25)
    expect(mid.opacity).toBeCloseTo(0.5)
    // eased: a quarter of the way in time is less than a quarter of the move
    expect(keyframeValues(clip, 0.5)!.x).toBeLessThan(0.125)
  })

  it('drives the clip transform and opacity, keeping its flips', () => {
    const [item] = placeOverlays([{ ...clip, start: 10, transform: { ...base.transform, flipX: true } }])
    expect(item.start).toBe(10)
    const move = clipTransformAt(item, 12)
    expect(move).toMatchObject({ scale: 2, x: 0.5, y: -0.5, rotate: 90, flipX: true })
    expect(clipOpacity(item, 11)).toBeCloseTo(0.5)
  })

  it('has no keyframe values without keyframes, and uses the clip opacity', () => {
    expect(keyframeValues(base, 1)).toBeNull()
    const [item] = placeOverlays([{ ...base, opacity: 0.4 }])
    expect(clipOpacity(item, 1)).toBeCloseTo(0.4)
  })
})

describe('music under the voice track', () => {
  const project: VideoProject = {
    width: 1920, height: 1080, clips: [], titles: [],
    audio: [
      { id: 'm', mediaId: 'song', start: 0, volume: 1, in: 0, out: 20, fadeIn: 0, fadeOut: 0, lane: 'music' },
      { id: 'v', mediaId: 'talk', start: 5, volume: 1, in: 0, out: 3, fadeIn: 0, fadeOut: 0, lane: 'voice' },
    ],
    duck: { on: true, amount: 0.6 },
  }

  it('lowers music by the amount while the voice plays, and not far from it', () => {
    expect(duckingAt(project, 6)).toBeCloseTo(0.4)
    expect(duckingAt(project, 1)).toBe(1)
    expect(duckingAt(project, 12)).toBe(1)
  })

  it('eases in and out around the voice', () => {
    const near = duckingAt(project, 4.85)
    expect(near).toBeGreaterThan(0.4)
    expect(near).toBeLessThan(1)
  })

  it('does nothing when switched off', () => {
    expect(duckingAt({ ...project, duck: { on: false, amount: 0.6 } }, 6)).toBe(1)
  })
})

import { DEFAULT_KEY, hexToRgb, withMix } from './timeline'

describe('mixing', () => {
  it('reads colours from hex', () => {
    expect(hexToRgb('#00b140').map(v => Math.round(v * 255))).toEqual([0, 177, 64])
    expect(hexToRgb('fff')).toEqual([1, 1, 1])
  })
  it('fills in missing mix settings with safe defaults', () => {
    const mix = withMix({ key: { on: true } as never })
    expect(mix.blend).toBe('normal')
    expect(mix.key).toMatchObject({ on: true, color: DEFAULT_KEY.color, tolerance: DEFAULT_KEY.tolerance })
    expect(mix.mask.shape).toBe('none')
  })
})

import { MAX_VOLUME, channelGain, clipMoveAt, sliderFromVolume, volumeFromSlider, withSound } from './timeline'

describe('very loud volume', () => {
  it('the first half of the slider is 0..100%, the second half goes to 1000%', () => {
    expect(volumeFromSlider(0)).toBe(0)
    expect(volumeFromSlider(0.5)).toBe(1)
    expect(volumeFromSlider(1)).toBe(MAX_VOLUME)
    for (const volume of [0, 0.3, 1, 2.5, 7, 10]) expect(volumeFromSlider(sliderFromVolume(volume))).toBeCloseTo(volume)
  })
  it('mute and solo decide which tracks are heard', () => {
    const sound = withSound({ lanes: { video: { volume: 2, pan: 0, mute: false, solo: false, enhance: false } } as never })
    expect(channelGain(sound, 'video')).toBe(2)
    const solo = withSound({ lanes: { ...sound.lanes, voice: { ...sound.lanes.voice, solo: true } } })
    expect(channelGain(solo, 'voice')).toBe(1)
    expect(channelGain(solo, 'music')).toBe(0)
    const muted = withSound({ lanes: { ...sound.lanes, music: { ...sound.lanes.music, mute: true } } })
    expect(channelGain(muted, 'music')).toBe(0)
  })
})

describe('overlay entrances and exits', () => {
  const clip = { ...base, enter: { type: 'slide-left', duration: 1 }, exit: { type: 'fade', duration: 1 } } as Clip
  it('starts off to the left and arrives in place', () => {
    expect(clipMoveAt(clip, 0, 6).dx).toBeLessThan(-1)
    expect(clipMoveAt(clip, 1.5, 6)).toMatchObject({ dx: 0, opacity: 1 })
  })
  it('fades out over its last second', () => {
    expect(clipMoveAt(clip, 5.5, 6).opacity).toBeGreaterThan(0)
    expect(clipMoveAt(clip, 5.5, 6).opacity).toBeLessThan(1)
    expect(clipMoveAt(clip, 6, 6).opacity).toBeCloseTo(0)
  })
})
