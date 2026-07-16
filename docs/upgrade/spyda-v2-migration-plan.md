# Spyda V2 Migration Plan

## Phase 0: Baseline

Status: complete.

Protected production behavior and the initial contract boundary are recorded
in `phase-0-baseline.md`.

## Phase 1: Canonical Design Document

Status: complete.

V1 breakdowns convert to a validated canonical document and round-trip to the
existing workspace shape.

## Phase 2: Vision Adapter

Status: complete.

The adapter and Supervision service are optional, replaceable, and tested. A
remote failure does not fail design analysis.

## Phase 3: Layout Intelligence

Status: complete.

Grid, spacing, margin, grouping, hierarchy, and object measurement models are
produced after canonical analysis.

## Phase 4: Constraints and Render Planning

Status: complete for the current V1 rendering surface.

Canvas and object locks are enforceable. Measured asset swaps avoid image
generation. Flat-raster text and complex removal remain AI-assisted until the
reconstruction pipeline produces isolated layers and background patches.

## Phase 5: Validation

Status: complete for structural and dimension validation.

Deterministic scores supplement model-based raster QA. Future work can add
perceptual metrics such as SSIM after a server-side image decoder is selected.

## Phase 6: Layer Reconstruction

Status: planned.

Add segmentation masks, background patches, editable text runs, vector shape
reconstruction, and an exportable layered scene. Move each supported object
type to deterministic rendering only after its fixture tests meet the fidelity
threshold.

## Rollout and Rollback

- New analysis fields are additive; the workspace can ignore them safely.
- Removing `SPYDA_VISION_SERVICE_URL` immediately returns analysis to the local
  Document and OCR adapter.
- Existing projects without V2 fields continue through the V1 compatibility
  adapter.
- Each engine has unit tests and can be replaced behind its public contract.
