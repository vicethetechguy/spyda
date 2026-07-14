# Spyda V2 Phase 0 Baseline

## Protected Production Behaviors

The V2 migration must preserve these working flows until their replacements
pass their own validation gates:

- Landing page, authentication, routing, account settings, wallet, and PWA.
- Upload preview and automatic analysis.
- OpenAI, Groq, and Google Vision provider selection.
- Design atom cards, Brand Constants, and Essentials.
- The focused-change limit used by the current workspace.
- Source and Child Source progression.
- Deterministic image placement and instant paste.
- GPT Image generation, QA display, and download.
- Existing locally saved project snapshots.

## Current Contract Boundary

The analysis API returns the current `breakdown.design` shape. Phase 1 adds a
validated `designDocument` beside that shape. The workspace still reads
`editableComponents`, `sections`, and `styleTokens` through the compatibility
adapter, so no visible behavior changes.

## Phase 1 Validation Gate

Phase 1 is complete only when:

- Current breakdowns convert to a valid Design Document.
- Legacy breakdowns still load.
- Invalid canonical documents are rejected with useful errors.
- Canonical documents round-trip to the existing workspace shape.
- Analysis responses carry the canonical document additively.
- Automated tests, lint, and the production build pass.

## Deferred Risks

These known risks are recorded but intentionally deferred:

- Whole-image AI edits can still move unrelated pixels.
- Text and shape edits are not yet deterministic.
- QA remains primarily model-based.
- Generation and corrective retry still share one serverless request.
- Project images remain in browser storage.
- Credit enforcement and payment verification are not yet server-owned.
