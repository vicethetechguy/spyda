import { describe, expect, it } from 'vitest'
import { formatSpydaCouponCode, formatSpydaWalletId } from './code-format'

describe('Spyda code input formatting', () => {
  it('adds Wallet ID separators while typing', () => {
    expect(formatSpydaWalletId('spy')).toBe('SPY-')
    expect(formatSpydaWalletId('spy1a2b')).toBe('SPY-1A2B-')
    expect(formatSpydaWalletId('spy-1a2b-c3d4')).toBe('SPY-1A2B-C3D4')
  })

  it('adds SPYDA coupon separators while typing', () => {
    expect(formatSpydaCouponCode('spyda')).toBe('SPYDA-')
    expect(formatSpydaCouponCode('spyda1a2b')).toBe('SPYDA-1A2B-')
    expect(formatSpydaCouponCode('spyda-1a2b-c3d4')).toBe('SPYDA-1A2B-C3D4')
  })

  it('preserves the format of legacy SPY coupon codes', () => {
    expect(formatSpydaCouponCode('SPY-1A2B-C3D4')).toBe('SPY-1A2B-C3D4')
  })

  it('removes unsupported characters and caps the code length', () => {
    expect(formatSpydaWalletId('spy-12!@ab-cd34-extra')).toBe('SPY-12AB-CD34')
    expect(formatSpydaCouponCode('spyda-12!@ab-cd34-extra')).toBe('SPYDA-12AB-CD34')
  })
})
