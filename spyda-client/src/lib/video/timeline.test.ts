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
