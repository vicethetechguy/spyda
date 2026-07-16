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
})
