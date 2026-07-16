import { describe, expect, it } from 'vitest'
import { buildApprovedDifferenceContract, buildGenerationQaPrompt, findMissingRequiredText } from './qa-contract.js'
import { normalizeQaReport } from './qa.js'
import { buildGenerationPrompt, mapOutputSize, normalizeGptImage2Dimensions } from './_utils.js'

const recipe = {
  compositeMode: true,
  textEdits: [{ objectId: 'headline', atomName: 'Headline', from: 'Old offer', to: 'New offer' }],
  pastedAssets: [{
    objectId: 'logo',
    atomName: 'Brand logo',
    originalContent: 'Original logo',
    name: 'Replacement logo',
    box: { x: 10, y: 8, width: 12, height: 8 },
  }],
  brandOverrides: { primaryColor: '#0055FF', headingFont: 'Space Grotesk' },
  essentials: ['Keep the phone mockup unchanged.'],
  layoutGridGuide: {
    columns: 8,
    rows: 12,
    safeArea: { left: 4, right: 4, top: 3, bottom: 3 },
    atoms: [{
      id: 'headline',
      name: 'Headline',
      type: 'text',
      bounds: { x: 12, y: 20, width: 76, height: 18 },
      gridCell: { columnStart: 1, columnEnd: 8, rowStart: 3, rowEnd: 5 },
    }],
  },
  editableComponents: [
    { id: 'headline', name: 'Headline', type: 'text', content: 'Old offer', boundingBox: 'top center' },
    { id: 'tagline', name: 'Tagline', type: 'text', content: 'Fast and reliable', boundingBox: 'below headline' },
    { id: 'logo', name: 'Brand logo', type: 'image', content: 'Original logo', boundingBox: 'top left' },
    { id: 'qr', name: 'QR code', type: 'image', content: 'Original QR code', boundingBox: 'bottom right' },
  ],
}

describe('approved difference QA contract', () => {
  it('keeps GPT-Image 2 output close to the parent aspect ratio', () => {
    const size = normalizeGptImage2Dimensions({ width: 736, height: 920 })
    const [width, height] = size.split('x').map(Number)

    expect(width % 16).toBe(0)
    expect(height % 16).toBe(0)
    expect(Math.abs((width / height) - (736 / 920))).toBeLessThan(0.015)
    expect(width * height).toBeGreaterThanOrEqual(655_360)
  })

  it('uses the actual reference dimensions for GPT-Image 2 match-reference edits', () => {
    const size = mapOutputSize('', 'Portrait 1024 x 1536', 'gpt-image-2', { width: 1080, height: 1350 }, true)
    const [width, height] = size.split('x').map(Number)

    expect(Math.abs((width / height) - 0.8)).toBeLessThan(0.015)
  })

  it('separates approved brand and text edits from protected content', () => {
    const contract = buildApprovedDifferenceContract(recipe)

    expect(contract.globalBrandRestyleApproved).toBe(true)
    expect(contract.textChanges[0].to).toBe('New offer')
    expect(contract.unchangedText).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectId: 'tagline', requiredText: 'Fast and reliable' }),
    ]))
    expect(contract.protectedAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectId: 'qr' }),
    ]))
  })

  it('records the original identity for a true asset replacement', () => {
    const contract = buildApprovedDifferenceContract(recipe)

    expect(contract.assetChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectId: 'logo',
        replaces: 'Original logo',
        replacement: 'Replacement logo',
      }),
    ]))
    expect(contract.protectedAssets).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ objectId: 'logo' }),
    ]))
  })

  it('tells QA not to penalize approved brand restyling', () => {
    const prompt = buildGenerationQaPrompt(recipe)

    expect(prompt).toContain('global brand restyle IS APPROVED')
    expect(prompt).toContain('#0055FF')
    expect(prompt).toContain('irrelevant or hallucinated copy')
    expect(prompt).toContain('8 columns x 12 rows')
    expect(prompt).toContain('same cells and exact normalized bounds')
  })

  it('locks unchanged copy without contradicting an approved brand restyle', () => {
    const prompt = buildGenerationPrompt(recipe)

    expect(prompt).toContain('COPY LOCK')
    expect(prompt).toContain('Fast and reliable')
    expect(prompt).toContain('approved Brand Style Overrides')
    expect(prompt).not.toContain('same colors, same background')
    expect(prompt).toContain('REPLACES "Original logo"')
    expect(prompt).toContain('old and new assets must never coexist')
    expect(prompt).toContain('LAYOUT GRID LOCK')
    expect(prompt).toContain('columns 1-8, rows 3-5')
  })

  it('fails QA when an original and replacement asset both remain', () => {
    const prompt = buildGenerationQaPrompt(recipe)

    expect(prompt).toContain('TRUE ASSET SWAP')
    expect(prompt).toContain('previous asset identity must be completely absent')
    expect(prompt).toContain('Replacement logo')
  })

  it('treats a requested deletion as an approved successful difference', () => {
    const deletionRecipe = {
      ...recipe,
      removedAtoms: [{ objectId: 'qr', atomName: 'QR code', type: 'image', content: 'Original QR code', boundingBox: 'bottom right' }],
    }
    const contract = buildApprovedDifferenceContract(deletionRecipe)
    const prompt = buildGenerationPrompt(deletionRecipe)

    expect(contract.removedAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectId: 'qr', atom: 'QR code' }),
    ]))
    expect(contract.protectedAssets).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ objectId: 'qr' }),
    ]))
    expect(prompt).toContain('REMOVE THESE ELEMENTS COMPLETELY')
    expect(prompt).toContain('Do not leave a ghost')
  })

  it('weights successful user intent above approved visual differences', () => {
    const report = normalizeQaReport({
      passed: true,
      score: 72,
      categoryScores: {
        intentFulfillment: 100,
        unchangedFidelity: 90,
        layoutSafety: 90,
        assetCompliance: 100,
        brandCompliance: 100,
        edgeSafety: 100,
      },
      approvedChangesApplied: ['Headline replaced', 'Logo replaced'],
      hardGateFailures: [],
      unapprovedChanges: [],
    })

    expect(report.passed).toBe(true)
    expect(report.score).toBe(98)
  })

  it('cannot pass or score above 89 when a hard gate fails', () => {
    const report = normalizeQaReport({
      passed: true,
      score: 100,
      categoryScores: { layout: 100, content: 100, assets: 100, brand: 100, edgeSafety: 100 },
      hardGateFailures: [{ code: 'invented-copy', message: 'An unrelated CTA was invented.' }],
    })

    expect(report.passed).toBe(false)
    expect(report.score).toBe(89)
  })

  it('detects a missing requested replacement even when other copy is present', () => {
    const contract = buildApprovedDifferenceContract(recipe)
    const missing = findMissingRequiredText(contract, 'Fast and reliable. Come taste our delicious meal.')

    expect(missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ atom: 'Headline', value: 'New offer' }),
    ]))
  })
})
