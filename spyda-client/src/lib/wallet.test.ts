import { describe, expect, it } from 'vitest'
import { parseWalletTransaction } from './wallet'

describe('parseWalletTransaction', () => {
  it('normalizes a real-time credit transaction payload', () => {
    expect(parseWalletTransaction({
      id: 'transaction-1',
      activity_type: 'earned',
      source: 'admin_transfer',
      description: 'Credits received from Spyda Admin',
      amount: 60,
      balance_after: 160,
      read_at: null,
      created_at: '2026-07-20T12:00:00.000Z',
    })).toEqual({
      id: 'transaction-1',
      activity_type: 'earned',
      source: 'admin_transfer',
      description: 'Credits received from Spyda Admin',
      amount: 60,
      balance_after: 160,
      read_at: null,
      created_at: '2026-07-20T12:00:00.000Z',
    })
  })

  it('keeps debit amounts and read receipts intact', () => {
    const transaction = parseWalletTransaction({
      id: 'transaction-2',
      activity_type: 'spent',
      amount: -20,
      balance_after: 140,
      read_at: '2026-07-20T12:05:00.000Z',
    })

    expect(transaction.amount).toBe(-20)
    expect(transaction.balance_after).toBe(140)
    expect(transaction.read_at).toBe('2026-07-20T12:05:00.000Z')
    expect(transaction.description).toBe('Spyda credit activity')
  })
})
