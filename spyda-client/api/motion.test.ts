import { describe, expect, it } from 'vitest'
import { MOTION_MODEL, buildMotionRequest, generateMotion, readMotionInput, readMotionReply } from './_motion.js'
import { MOTION_CODE_CONTRACT } from './_motion-template.js'

const image = 'data:image/jpeg;base64,AAAA'
const playable = 'TITLE: Grand opening\n```javascript\nfunction draw({ ctx, t }) { ctx.fillRect(0, 0, 10, 10) }\n```'

function fakeClient(final: unknown) {
  const calls: unknown[] = []
  return {
    calls,
    client: { beta: { messages: { stream: (params: unknown) => { calls.push(params); return { finalMessage: async () => final } } } } } as never,
  }
}

describe('motion design', () => {
  it('needs a reference image and clamps the rest', () => {
    expect(() => readMotionInput({ brief: 'x' })).toThrow(/reference/)
    const input = readMotionInput({ image, brief: '  Make it pop  ', format: 'nope', duration: 99 })
    expect(input).toMatchObject({ brief: 'Make it pop', format: 'portrait', duration: 15 })
  })

  it('asks Claude Opus 5.5 with the image, the cached contract and the brief', () => {
    const request = buildMotionRequest(readMotionInput({ image, brief: 'Launch teaser', format: 'story', duration: 6 }))
    expect(request.model).toBe('claude-opus-5-5')
    expect(request.fallbacks).toBe('default')
    expect(request.system.at(-1)).toMatchObject({ text: MOTION_CODE_CONTRACT, cache_control: { type: 'ephemeral' } })
    const [picture, text] = request.messages[0].content
    expect(picture).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(text).toMatchObject({ type: 'text' })
    expect((text as { text: string }).text).toMatch(/1080 x 1920/)
    expect((text as { text: string }).text).toMatch(/Launch teaser/)
  })

  it('sends the previous version and its error when fixing', () => {
    const request = buildMotionRequest(readMotionInput({ image, brief: '', previousCode: 'function draw(){}', runtimeError: 'x is not defined' }))
    const text = (request.messages[0].content[1] as { text: string }).text
    expect(text).toMatch(/x is not defined/)
    expect(text).toMatch(/function draw\(\)\{\}/)
  })

  it('reads the title and the code', () => {
    expect(readMotionReply(playable)).toEqual({
      title: 'Grand opening',
      code: 'function draw({ ctx, t }) { ctx.fillRect(0, 0, 10, 10) }',
    })
    expect(() => readMotionReply('Sorry, here is a description instead.')).toThrow(/playable/)
  })

  it('streams the reply and turns refusals into a clear error', async () => {
    const ok = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: playable }] })
    await expect(generateMotion(readMotionInput({ image }), ok.client)).resolves.toMatchObject({ title: 'Grand opening' })
    expect(ok.calls[0]).toMatchObject({ model: MOTION_MODEL })

    const refused = fakeClient({ stop_reason: 'refusal', content: [] })
    await expect(generateMotion(readMotionInput({ image }), refused.client)).rejects.toThrow(/declined/)
  })
})
