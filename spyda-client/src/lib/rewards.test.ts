import { describe, expect, it } from 'vitest'
import { completedWelcomeTaskCount, isValidXHandle, normalizeXHandle, type WelcomeRewardClaim } from './rewards'

const claim = (tasks: Partial<WelcomeRewardClaim>): WelcomeRewardClaim => ({
  user_id: 'user-id',
  follow_spyda: false,
  repost_pinned: false,
  follow_vice: false,
  x_handle: null,
  status: 'draft',
  admin_note: null,
  credits_awarded: 0,
  submitted_at: null,
  reviewed_at: null,
  created_at: '',
  updated_at: '',
  ...tasks,
})

describe('welcome reward helpers', () => {
  it('normalizes and validates an X handle', () => {
    expect(normalizeXHandle('  @@spydadesign ')).toBe('spydadesign')
    expect(isValidXHandle('@viceonchain')).toBe(true)
    expect(isValidXHandle('not a handle')).toBe(false)
  })

  it('counts completed tasks', () => {
    expect(completedWelcomeTaskCount(claim({ follow_spyda: true, follow_vice: true }))).toBe(2)
    expect(completedWelcomeTaskCount(claim({
      follow_spyda: true,
      repost_pinned: true,
      follow_vice: true,
    }))).toBe(3)
  })
})
