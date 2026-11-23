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

describe('SPYDA early-adopter tiers', () => {
  it('maps signup numbers to their rate', async () => {
    const { spydaRate } = await import('./rewards')
    expect([1, 1000, 1001, 10000, 10001, 100000, 100001, 1000000, 1000001, 0, null].map(spydaRate)).toEqual([10000, 10000, 1000, 1000, 100, 100, 10, 10, 1, 1, 1])
  })
  it('accrues in proportion to credits spent', async () => {
    const { spydaFor } = await import('./rewards')
    expect(spydaFor(100, 1)).toBe(1000)
    expect(spydaFor(1000, 2_000_000)).toBe(1)
    expect(spydaFor(150, 50_000)).toBe(15)
  })
})
