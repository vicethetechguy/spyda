import { describe, expect, it } from 'vitest'
import { motionDocument, playerConfig } from './motion-harness'

const config = {
  code: 'function draw({ ctx }) { const s = "</script><script>alert(1)</script>"; ctx.fillText(s, 0, 0) }',
  reference: 'data:image/jpeg;base64,AAAA',
  format: 'story' as const,
  duration: 8,
}

describe('motion player', () => {
  it('keeps generated code from closing its script element', () => {
    const html = motionDocument(config)
    const codeBlock = html.slice(html.indexOf('id="spyda-code">'), html.indexOf('</script>', html.indexOf('id="spyda-code">')))
    expect(codeBlock).toContain('<\\/script><script>alert(1)<\\/script>')
    // exactly the closing tags the player itself writes: code block + runtime
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })

  it('sizes the canvas from the format', () => {
    expect(playerConfig(config)).toMatchObject({ width: 1080, height: 1920, duration: 8 })
  })

  it('embeds its config only in the downloadable version', () => {
    expect(motionDocument(config)).not.toContain('__SPYDA_MOTION__ =')
    const standalone = motionDocument(config, { standalone: true })
    expect(standalone).toContain('window.__SPYDA_MOTION__ = {')
    expect(standalone).not.toMatch(/__SPYDA_MOTION__ = [^;]*<\/script/)
  })
})
