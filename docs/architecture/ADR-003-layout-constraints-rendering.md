# ADR-003: Separate Layout, Constraints, Rendering, and Validation

## Status

Accepted for Spyda V2.

## Context

Spyda V1 expressed many layout rules inside image-model prompts. Prompts are
useful guidance, but they are not enforceable geometry. Whole-image generation
can move unrelated pixels even when instructed not to.

## Decision

Four deterministic subsystems now sit between analysis and image synthesis:

1. `layout-intelligence.ts` infers hidden grid lines, alignment peers, spacing,
   safe margins, groups, hierarchy, and authoritative object measurements.
2. `constraint-engine.ts` restores locked canvas and object properties before
   rendering and rejects implicit geometry changes.
3. `render-strategy.ts` selects passthrough, deterministic composition,
   deterministic reconstruction, or AI-assisted rendering.
4. `validation-engine.ts` scores position, scale, typography, alignment,
   color, layout, and rendered aspect ratio.

The internal grid is analytical data only and is never drawn in the product.

## Rendering Rule

Measured asset replacement is deterministic. GPT Image is reserved for flat
raster edits that still require synthesis, such as removing a complex subject,
replacing embedded text without a reconstructed layer, extending a background,
or creating missing visual content.

This is an incremental boundary. A text change becomes deterministic as soon
as Spyda has an isolated text layer and background patch for that object. Until
then, claiming pixel-perfect deterministic text replacement would be false.

## Consequences

- Unaffected geometry can be tested without calling an AI model.
- A deterministic request no longer requires an OpenAI key.
- Model QA remains useful for raster appearance, but it is supplemented by
  structural and dimension reports.
- Existing V1 atom cards and projects remain compatible through the canonical
  Design Document adapter.
