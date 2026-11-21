import { describe, expect, it } from 'vitest'
import { passwordStrength } from './password-strength'

describe('passwordStrength', () => {
  it('stays empty until something is typed', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' })
  })

  it('flags anything under 8 characters', () => {
    expect(passwordStrength('abc1234')).toEqual({ score: 1, label: 'Too short' })
  })

  it('rewards length and character variety', () => {
    expect(passwordStrength('abcdefgh').label).toBe('Fair')
    expect(passwordStrength('abcdefghijkl').label).toBe('Good')
    expect(passwordStrength('Abcdefg1').label).toBe('Good')
    expect(passwordStrength('Abcdefghijk1').label).toBe('Strong')
  })
})
