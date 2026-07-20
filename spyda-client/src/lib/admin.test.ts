import { describe, expect, it } from 'vitest'
import { parseAdminCreditTransfer } from './admin'

describe('admin credit transfer receipts', () => {
  it('parses a durable transfer receipt', () => {
    expect(parseAdminCreditTransfer([{
      transfer_id: 'receipt-id',
      target_user_id: 'user-id',
      recipient_email: 'user@example.com',
      spyda_id: 'SPY-1234-ABCD',
      previous_balance: 40,
      new_balance: 100,
      sender_balance: 940,
    }], 60)).toEqual({
      transfer_id: 'receipt-id',
      target_user_id: 'user-id',
      recipient_email: 'user@example.com',
      spyda_id: 'SPY-1234-ABCD',
      previous_balance: 40,
      new_balance: 100,
      sender_balance: 940,
    })
  })

  it('handles a legacy receipt without inventing an admin balance', () => {
    const result = parseAdminCreditTransfer({
      target_user_id: 'user-id',
      spyda_id: 'SPY-1234-ABCD',
      new_balance: 100,
    }, 60)

    expect(result.previous_balance).toBe(40)
    expect(result.sender_balance).toBeNull()
    expect(result.transfer_id).toBeNull()
  })

  it('rejects a receipt without a verified recipient balance', () => {
    expect(() => parseAdminCreditTransfer({
      target_user_id: 'user-id',
      spyda_id: 'SPY-1234-ABCD',
    }, 60)).toThrow('verified recipient balance')
  })
})
