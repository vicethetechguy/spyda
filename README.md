# Spyda

Spyda is now maintained as a Vite/React application inside `spyda-client/`.

## App Location

```text
spyda-client/
```

## Local Development

```bash
cd spyda-client
npm install
npm run dev
```

Run the architecture regression tests with:

```bash
cd spyda-client
npm test
```

## Spyda V2 Architecture

Spyda is being evolved incrementally into a design reconstruction platform.
The current workspace remains compatible while new engines adopt the shared,
validated Design Document.

- [Design Document decision](docs/architecture/ADR-001-design-document.md)
- [Vision Adapter decision](docs/architecture/ADR-002-vision-adapter.md)
- [Layout, constraints, and rendering decision](docs/architecture/ADR-003-layout-constraints-rendering.md)
- [V2 reconstruction architecture](docs/architecture/spyda-v2-reconstruction.md)
- [V2 migration plan](docs/upgrade/spyda-v2-migration-plan.md)
- [Phase 0 baseline and protected behavior](docs/upgrade/phase-0-baseline.md)
- [Product requirements](PRD.md)

## Production

The live Vercel app should use `spyda-client` as the project root directory.

Current production app:

```text
https://spydadesigns.vercel.app
```

## Required Environment Variables

Add these in the `spyda-client` Vercel project:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Server only: verifies sessions and charges generation credits in api/_billing.ts.
# Also put it in spyda-client/.env.local for local `vite` dev.
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
# Motion design runs on Claude Opus 5.5 (api/motion.ts).
ANTHROPIC_API_KEY=
# Optional: Spyda's general motion prompt; replaces the default in api/_motion-template.ts.
MOTION_PROMPT_TEMPLATE=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_ANALYSIS_MODEL=gpt-4o
GROQ_ANALYSIS_MODEL=qwen/qwen3.8-27b
# Optional Roboflow Supervision geometry service
SPYDA_VISION_SERVICE_URL=
SPYDA_VISION_SERVICE_TOKEN=
```
