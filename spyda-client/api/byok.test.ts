import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeDesignWithGroq, analyzeDesignWithOpenAI } from './_utils.js'

describe('bring your API key routing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the supplied OpenAI key instead of requiring the server key', async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"design":{"editableComponents":[]}}' } }] }),
      receivedAuthorization: (init?.headers as Record<string, string>)?.Authorization,
    }))
    vi.stubGlobal('fetch', request)

    await analyzeDesignWithOpenAI('data:image/png;base64,test', 'Analyze this design.', 'sk-user-key')

    expect(request).toHaveBeenCalledOnce()
    const headers = request.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBe('Bearer sk-user-key')
  })

  it('uses the supplied Groq key for Groq analysis', async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"design":{"editableComponents":[]}}' } }] }),
      receivedAuthorization: (init?.headers as Record<string, string>)?.Authorization,
    }))
    vi.stubGlobal('fetch', request)

    await analyzeDesignWithGroq('data:image/png;base64,test', 'Analyze this design.', 'gsk-user-key')

    expect(request).toHaveBeenCalledOnce()
    const headers = request.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBe('Bearer gsk-user-key')
  })

  it('retries with another supported Groq vision model when the preferred model is unavailable', async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { model?: string }
      if (request.mock.calls.length === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({
            error: { code: 'model_not_found', message: `The model ${body.model} does not exist.` },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"design":{"editableComponents":[]}}' } }] }),
      }
    })
    vi.stubGlobal('fetch', request)

    const result = await analyzeDesignWithGroq('data:image/png;base64,test', 'Analyze this design.', 'gsk-user-key')

    expect(request).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(String(request.mock.calls[0]?.[1]?.body || '{}')) as { model: string }
    const secondBody = JSON.parse(String(request.mock.calls[1]?.[1]?.body || '{}')) as { model: string }
    expect(secondBody.model).not.toBe(firstBody.model)
    expect(result.ok).toBe(true)
  })
})
