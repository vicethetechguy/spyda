# ADR-002: Isolate Roboflow Supervision Behind a Vision Adapter

## Status

Accepted for Spyda V2.

## Context

Roboflow Supervision is a Python computer-vision toolkit. Spyda's production
API is TypeScript on Vercel. Importing Supervision directly into the current
serverless functions is not possible, and coupling the analysis pipeline to a
Python deployment would make every upload depend on another service.

Supervision also measures and manipulates detections; it does not understand
flyer semantics by itself. OCR and multimodal analysis are still needed to
identify a headline, logo, QR code, product, CTA, or decorative element.

## Decision

Spyda owns a `VisionAdapter` interface. The analysis pipeline asks only this
interface for detections and measurements.

- `DocumentVisionAdapter` is the always-available fallback. It combines the
  canonical Design Document with Google Vision OCR geometry.
- `SupervisionVisionAdapter` calls the optional Python service and merges its
  refined boxes with fallback detections.
- `vision-service/` uses OpenCV contours and Roboflow Supervision detections
  to refine candidate geometry.
- A service timeout or failure becomes an analysis warning, not a failed user
  upload.

## Consequences

- Vercel remains deployable without Python.
- Alternative vision libraries can replace Supervision without changing the
  Layout Intelligence Engine.
- Supervision adds a small sequential geometry step only when configured. Its
  request is capped at five seconds so it cannot dominate analysis latency.
- Semantic accuracy is still limited by OCR and model detection quality.

## Configuration

```text
SPYDA_VISION_SERVICE_URL=https://your-vision-service.example
SPYDA_VISION_SERVICE_TOKEN=shared-secret
```
