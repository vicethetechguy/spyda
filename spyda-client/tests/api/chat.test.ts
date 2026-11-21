import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGES_PER_REQUEST, buildChatMessages, buildEditPrompt, readChatCompletion, readTurns, requestChatReply } from '../../api/_chat.js'

const image = (n: number) => `data:image/jpeg;base64,${'A'.repeat(4)}${n}`

describe('workspace chat', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a conversation that does not end with the person', () => {
    expect(() => readTurns([{ role: 'assistant', text: 'Hi' }])).toThrow()
    expect(() => readTurns('nope')).toThrow()
  })

  it('drops non-image attachments and empty turns', () => {
    const turns = readTurns([
      { role: 'user', text: '', images: ['https://example.com/a.png', image(1)] },
      { role: 'assistant', text: '' },
      { role: 'user', text: 'Make it blue' },
    ])
    expect(turns).toHaveLength(2)
    expect(turns[0].images).toEqual([image(1)])
  })

  it('only resends the newest images', () => {
    const turns = readTurns([
      { role: 'user', text: 'first', images: [image(1), image(2)] },
      { role: 'assistant', text: 'ok' },
      { role: 'user', text: 'second', images: [image(3), image(4)] },
      { role: 'assistant', text: 'ok' },
      { role: 'user', text: 'what changed?' },
    ])
    const messages = buildChatMessages(turns)
    const sent = messages.flatMap((message: any) => Array.isArray(message.content) ? message.content : [])
      .filter((part: any) => part.type === 'image_url')
    expect(sent).toHaveLength(MAX_IMAGES_PER_REQUEST)
    // the newest three: the last of the first turn, then both of the second
    expect(sent.map((part: any) => part.image_url.url)).toEqual([image(2), image(3), image(4)])
    expect(messages[0].role).toBe('system')
  })

  it('reads a proposed edit from a tool call', () => {
    const reply = readChatCompletion({
      choices: [{
        message: {
          content: 'I will swap the headline.',
          tool_calls: [{ function: { name: 'propose_flyer_edit', arguments: JSON.stringify({ instruction: 'Change the headline to "Grand Opening".', summary: 'New headline' }) } }],
        },
      }],
    })
    expect(reply.reply).toBe('I will swap the headline.')
    expect(reply.edit).toEqual({ instruction: 'Change the headline to "Grand Opening".', summary: 'New headline' })
  })

  it('survives broken tool arguments', () => {
    const reply = readChatCompletion({ choices: [{ message: { content: '', tool_calls: [{ function: { name: 'propose_flyer_edit', arguments: '{oops' } }] } }] })
    expect(reply.edit).toBeNull()
    expect(reply.reply).toBeTruthy()
  })

  it('uses the supplied key and offers the edit tool', async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Looks great.' } }] }),
    }))
    vi.stubGlobal('fetch', request)

    const result = await requestChatReply([{ role: 'user', text: 'Hello' }], 'sk-user-key')
    expect(result.reply).toBe('Looks great.')
    const init = request.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer sk-user-key')
    const body = JSON.parse(String(init?.body))
    expect(body.tools[0].function.name).toBe('propose_flyer_edit')
  })

  it('tells the image model to keep everything else', () => {
    expect(buildEditPrompt('Make the background navy')).toMatch(/Keep everything/)
  })
})
