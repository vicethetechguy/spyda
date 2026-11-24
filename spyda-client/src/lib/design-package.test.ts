import { beforeEach, describe, expect, it, vi } from 'vitest'

const assets = new Map<string, Blob>()
let next = 0
vi.mock('./asset-store', () => ({
  assetIdToRef: (id: string) => `asset:${id}`,
  getAssetBlob: async (id: string) => assets.get(id),
  putAsset: async (blob: Blob) => { const id = `new${++next}`; assets.set(id, blob); return id },
}))
const saved: unknown[] = []
vi.mock('./project-store', () => ({ saveProject: (project: unknown) => saved.push(project) }))

const { decodePackage, encodePackage, packFlyer, unpackFlyer } = await import('./design-package')

beforeEach(() => { assets.clear(); saved.length = 0; next = 0 })

describe('design packages', () => {
  it('round-trips the data and every file byte for byte', async () => {
    const files = [
      { key: 'a', name: 'one', type: 'image/png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
      { key: 'b', name: 'two', type: 'audio/wav', blob: new Blob([new Uint8Array([9, 8, 7, 6, 5])], { type: 'audio/wav' }) },
    ]
    const blob = await encodePackage({ kind: 'video', name: 'Edit', data: { hello: 'wörld' }, files })
    const pkg = await decodePackage(blob)
    expect(pkg).toMatchObject({ version: 1, kind: 'video', name: 'Edit', data: { hello: 'wörld' } })
    expect(pkg.files.map(file => file.key)).toEqual(['a', 'b'])
    expect([...new Uint8Array(await pkg.files[1].blob.arrayBuffer())]).toEqual([9, 8, 7, 6, 5])
    expect(pkg.files[1].blob.type).toBe('audio/wav')
  })

  it('refuses a file that is not a Spyda design', async () => {
    await expect(decodePackage(new Blob(['not a design at all']))).rejects.toThrow(/not a Spyda design/)
  })

  it('packs a flyer with its pictures and gives the buyer fresh copies of them', async () => {
    assets.set('pic1', new Blob(['PNG1'], { type: 'image/png' }))
    const project = { id: 'p', name: 'Sale flyer', createdAt: '', updatedAt: '', breakdown: { layers: [{ src: 'asset:pic1' }, { src: 'asset:pic1' }, { text: 'Hi' }] } }
    const pkg = await decodePackage(await packFlyer(project))
    expect(pkg.files).toHaveLength(1)

    const id = await unpackFlyer(pkg, 'My copy')
    const copy = saved[0] as { id: string; name: string; breakdown: { layers: Array<{ src?: string }> } }
    expect(copy.id).toBe(id)
    expect(copy.name).toBe('My copy')
    expect(copy.breakdown.layers[0].src).toBe('asset:new1')
    expect(copy.breakdown.layers[1].src).toBe('asset:new1')
    expect(await assets.get('new1')?.text()).toBe('PNG1')
  })
})
