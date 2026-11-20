import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const imageEdit = vi.fn()
const generateDesign = vi.fn()
const analyzeDesign = vi.fn()

vi.mock('./_utils.js', () => ({
  imageModel: 'gpt-image-2',
  mapOutputSize: () => '1024x1536',
  mapQuality: () => 'high',
  normalizeGeneratedImageOutput: (value: string | undefined) => (value ? `data:image/png;base64,${value}` : null),
  requestOpenAiImageEdit: (...args: unknown[]) => imageEdit(...args),
  generateDesign: (...args: unknown[]) => generateDesign(...args),
  analyzeDesign: (...args: unknown[]) => analyzeDesign(...args),
}))
vi.mock('./_ocr_service.js', () => ({ runOcr: async () => ({ enabled: false, fullText: '', words: [] }) }))
vi.mock('./qa.js', () => ({ runGenerationQa: async () => ({ ok: true, passed: true, score: 1 }) }))

const { setBillingDb, requireUser, readModelMode, isByok, withGenerationCharge } = await import('./_billing.js')
const chat = (await import('./chat.js')).default
const generate = (await import('./generate.js')).default
const analyze = (await import('./analyze.js')).default

type Call = { fn: string; args: Record<string, unknown> }

/** A stand-in database: one wallet, the same pricing as the migration. */
function fakeDb({ balance = 100, users = { 'good-jwt': 'user-1' } as Record<string, string> } = {}) {
  const state = { balance, spent: 0, tokens: 0, calls: [] as Call[], charges: new Map<string, { amount: number; refunded: boolean }>() }
  const db = {
    auth: {
      getUser: async (jwt: string) => users[jwt]
        ? { data: { user: { id: users[jwt] } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      if (fn === 'reserve_generation_credits') {
        const amount = args.p_byok ? 5 : args.p_model_mode === 'groq' ? 20 : 30
        if (state.balance < amount) return { data: null, error: { code: 'P0001', message: 'Not enough Spyda credits for this generation.' } }
        const award = Math.floor((state.spent + amount) / 1000) - Math.floor(state.spent / 1000)
        state.balance -= amount
        state.spent += amount
        state.tokens += award
        const id = `charge-${state.charges.size + 1}`
        state.charges.set(id, { amount, refunded: false })
        return { data: [{ charge_id: id, credits_charged: amount, tokens_awarded: award, wallet_balance: state.balance }], error: null }
      }
      if (fn === 'refund_generation_credits') {
        const charge = state.charges.get(String(args.p_charge_id))
        if (!charge || charge.refunded) return { data: [{ refunded: false }], error: null }
        charge.refunded = true
        state.balance += charge.amount
        state.spent -= charge.amount
        return { data: [{ refunded: true, wallet_balance: state.balance }], error: null }
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } }
    },
  }
  return { db, state }
}

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (payload: unknown) => { res.body = payload; return res }
  return res
}

const flyer = 'data:image/jpeg;base64,AAAA'
const editRequest = (headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: { action: 'edit', instruction: 'Make the headline red', image: flyer },
})

describe('server-side auth', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-server'
    imageEdit.mockReset()
    generateDesign.mockReset()
    analyzeDesign.mockReset()
  })
  afterEach(() => setBillingDb(null))

  it('rejects a missing or bad token', async () => {
    setBillingDb(fakeDb().db)
    await expect(requireUser({ headers: {} })).rejects.toMatchObject({ status: 401 })
    await expect(requireUser({ headers: { authorization: 'Bearer nope' } })).rejects.toMatchObject({ status: 401 })
    await expect(requireUser({ headers: { authorization: 'Bearer good-jwt' } })).resolves.toEqual({ id: 'user-1' })
  })

  it('401s every endpoint without a session, own key or not', async () => {
    const { db, state } = fakeDb()
    setBillingDb(db)
    const ownKey = { 'x-spyda-openai-key': 'sk-mine' }

    const reply = fakeRes()
    await chat({ method: 'POST', headers: ownKey, body: { action: 'reply', messages: [{ role: 'user', text: 'hi' }] } }, reply)
    expect(reply.statusCode).toBe(401)

    const edit = fakeRes()
    await chat(editRequest(ownKey), edit)
    expect(edit.statusCode).toBe(401)

    const gen = fakeRes()
    await generate({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { recipe: {} } }, gen)
    expect(gen.statusCode).toBe(401)

    const analysis = fakeRes()
    await analyze({ method: 'POST', headers: ownKey, body: { base64Image: flyer } }, analysis)
    expect(analysis.statusCode).toBe(401)

    expect(imageEdit).not.toHaveBeenCalled()
    expect(generateDesign).not.toHaveBeenCalled()
    expect(analyzeDesign).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
  })

  it('lets a signed-in caller analyse without charging', async () => {
    const { db, state } = fakeDb()
    setBillingDb(db)
    analyzeDesign.mockResolvedValue({ ok: true, breakdown: {} })
    const res = fakeRes()
    await analyze({ method: 'POST', headers: { authorization: 'Bearer good-jwt' }, body: { base64Image: flyer } }, res)
    expect(res.statusCode).toBe(200)
    expect(state.calls).toHaveLength(0)
  })
})

describe('server-side generation charge', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-server'
    imageEdit.mockReset()
    generateDesign.mockReset()
  })
  afterEach(() => setBillingDb(null))

  it('reads the model mode and own key from the request', () => {
    expect(readModelMode({ headers: { 'x-spyda-model-mode': 'groq' } })).toBe('groq')
    expect(readModelMode({ headers: {} }, 'openai')).toBe('openai')
    expect(readModelMode({ headers: {} })).toBe('openai')
    expect(isByok({ headers: { 'x-spyda-openai-key': 'sk-mine' } })).toBe(true)
    expect(isByok({ headers: {} })).toBe(false)
  })

  it('charges a chat edit once, before the image model runs', async () => {
    const { db, state } = fakeDb({ balance: 100 })
    setBillingDb(db)
    imageEdit.mockImplementation(async () => {
      // The charge is already in the database when the model is called.
      expect(state.balance).toBe(80)
      return { data: [{ b64_json: 'IMAGE' }] }
    })

    const res = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt', 'x-spyda-model-mode': 'groq' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.image).toBe('data:image/png;base64,IMAGE')
    expect(res.body.billing).toMatchObject({ creditsCharged: 20, walletBalance: 80 })
    expect(state.calls.map(call => call.fn)).toEqual(['reserve_generation_credits'])
    expect(state.calls[0].args).toEqual({ p_user_id: 'user-1', p_model_mode: 'groq', p_byok: false })
  })

  it('charges the bring-your-own-key price when the caller sends a key', async () => {
    const { db, state } = fakeDb({ balance: 100 })
    setBillingDb(db)
    imageEdit.mockResolvedValue({ data: [{ b64_json: 'IMAGE' }] })
    const res = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt', 'x-spyda-openai-key': 'sk-mine' }), res)
    expect(res.statusCode).toBe(200)
    expect(state.balance).toBe(95)
    expect(imageEdit.mock.calls[0][0]).toMatchObject({ openaiKey: 'sk-mine' })
  })

  it('returns 402 and skips the model when the balance is too low', async () => {
    const { db } = fakeDb({ balance: 10 })
    setBillingDb(db)
    const res = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt' }), res)
    expect(res.statusCode).toBe(402)
    expect(res.body.error).toMatch(/Not enough Spyda credits/)
    expect(imageEdit).not.toHaveBeenCalled()
  })

  it('refunds when the image model fails or returns nothing', async () => {
    const { db, state } = fakeDb({ balance: 100 })
    setBillingDb(db)

    imageEdit.mockRejectedValueOnce(new Error('OpenAI is down'))
    const failed = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt' }), failed)
    expect(failed.statusCode).toBe(500)
    expect(failed.body.error).toBe('OpenAI is down')
    expect(state.balance).toBe(100)

    imageEdit.mockResolvedValueOnce({ data: [] })
    const empty = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt' }), empty)
    expect(empty.statusCode).toBe(502)
    expect(state.balance).toBe(100)
    expect(state.spent).toBe(0)
    expect(state.calls.map(call => call.fn)).toEqual([
      'reserve_generation_credits', 'refund_generation_credits',
      'reserve_generation_credits', 'refund_generation_credits',
    ])
  })

  it('reports the SPYDA award when a charge crosses 1,000 credits', async () => {
    const { db, state } = fakeDb({ balance: 2000 })
    state.spent = 980
    setBillingDb(db)
    imageEdit.mockResolvedValue({ data: [{ b64_json: 'IMAGE' }] })
    const res = fakeRes()
    await chat(editRequest({ authorization: 'Bearer good-jwt', 'x-spyda-model-mode': 'openai' }), res)
    expect(res.body.billing.tokensAwarded).toBe(1)
    expect(state.tokens).toBe(1)
  })

  it('charges /api/generate before generating and refunds a failure', async () => {
    const { db, state } = fakeDb({ balance: 100 })
    setBillingDb(db)
    const request = (recipe: Record<string, unknown>) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer good-jwt' },
      body: { recipe },
    })

    generateDesign.mockImplementationOnce(async () => {
      expect(state.balance).toBe(80)
      return { ok: true, image: 'data:image/png;base64,X' }
    })
    const ok = fakeRes()
    await generate(request({ aiProvider: 'groq', deferQa: true }), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.body.billing).toMatchObject({ creditsCharged: 20 })

    generateDesign.mockRejectedValueOnce(new Error('model exploded'))
    const failed = fakeRes()
    await generate(request({ aiProvider: 'openai' }), failed)
    expect(failed.statusCode).toBe(500)
    expect(state.balance).toBe(80)

    const poor = fakeDb({ balance: 0 })
    setBillingDb(poor.db)
    const broke = fakeRes()
    await generate(request({ aiProvider: 'openai' }), broke)
    expect(broke.statusCode).toBe(402)
  })

  it('never refunds a successful generation', async () => {
    const { db, state } = fakeDb({ balance: 100 })
    setBillingDb(db)
    const { charge } = await withGenerationCharge('user-1', 'openai', false, async () => 'ok')
    expect(charge.creditsCharged).toBe(30)
    expect(state.calls.filter(call => call.fn === 'refund_generation_credits')).toHaveLength(0)
  })
})
