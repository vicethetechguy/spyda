# ADR-001: Introduce a Canonical Design Document

## Status

Accepted for Spyda V2 Phase 1.

## Context

Spyda currently accepts several AI breakdown shapes and normalizes them into
the fields used by the workspace. That compatibility behavior is valuable,
but it does not provide one strict representation for analysis, editing,
rendering, constraints, persistence, and fidelity validation.

The V2 architecture needs one shared contract before those subsystems can be
separated safely.

## Decision

Introduce a versioned `DesignDocument` as Spyda's canonical internal model.
The contract is defined with TypeScript types and a Zod runtime schema.

During migration:

1. Existing AI and legacy breakdowns are adapted into a `DesignDocument`.
2. The document is validated at runtime.
3. A compatibility adapter converts it back to the current workspace shape.
4. The existing UI continues to work while later phases migrate one feature
   at a time to the canonical model.

The canonical model stores:

- Canvas metadata and dimensions.
- Sections and normalized bounds.
- Design objects with transforms and layer order.
- Editable and protected properties.
- Layout constraints.
- Relationships between objects.
- Structured content and style data.
- Analysis confidence and provenance.
- Versioned style tokens.

## Consequences

- AI output can no longer silently become application state without
  validation.
- Existing projects remain readable through the legacy adapter.
- New engines can share one model without importing workspace UI code.
- The first phase is intentionally additive and does not change rendering.
- Unknown or non-numeric legacy positions are represented honestly as null
  bounds until a later analyzer measures them.

## Not Included In This Phase

- A new canvas renderer.
- New analysis agents.
- Background job infrastructure.
- Database migration.
- Changes to the visible editing workflow.
