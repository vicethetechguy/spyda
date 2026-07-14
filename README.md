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
- [Phase 0 baseline and protected behavior](docs/upgrade/phase-0-baseline.md)
- [Product requirements](PRD.md)

## Production

The live Vercel app should use `spyda-client` as the project root directory.

Current production app:

```text
https://spyda-client.vercel.app
```

## Required Environment Variables

Add these in the `spyda-client` Vercel project:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_ANALYSIS_MODEL=gpt-4o
GROQ_ANALYSIS_MODEL=llama-3.2-90b-vision-preview
```
