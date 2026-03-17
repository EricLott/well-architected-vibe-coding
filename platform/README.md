# Well-Architected Vibe Coding platform

## Quick Start

```bash
git clone <repo>
cd <repo>/platform
npm install
npm run ingest
npm run dev
```

## What this does

- parses the `well-architected/` markdown corpus
- chunks content and extracts normalized metadata
- builds a lexical retrieval index under `platform/artifacts/`
- starts a local retrieval API

## Test it

```bash
curl -X POST http://localhost:3000/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"authentication strategy","topK":5}'
```

Optional smoke test (with API running):

```bash
npm run test:retrieve
```

## Bring Your Own Key (future)

Ingestion and retrieval in phase 1 do **not** require user API keys.
API keys will be introduced later for AI generation workflows.

## Troubleshooting

- If API startup says index is missing: run `npm run ingest`
- To rebuild from scratch: run `npm run reset`
- To rebuild only lexical index from existing chunks: run `npm run build:index`
