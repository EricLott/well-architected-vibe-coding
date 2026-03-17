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

## Frontend (phase 1 intake workspace)

The frontend is located in `platform/frontend` and provides the first guided
intake experience for architecture-first planning.

Run it in a second terminal while the API is running:

```bash
cd <repo>/platform/frontend
npm install
npm run dev
```

Notes:

- Frontend dev server runs at `http://localhost:5173`
- Landing page is idea-first at `/`
- Guided pillar workspace is at `/workspace`
- Retrieval preview calls `/retrieve` through a Vite proxy to `http://localhost:3000`
- Frontend calls `/projects` orchestration endpoints through the same proxy

## Orchestration API (local)

The API now includes local project orchestration and persistence endpoints:

- `POST /projects/intake` initialize a project from idea text
- `GET /projects` list persisted projects
- `GET /projects/:projectId` fetch a project
- `PUT /projects/:projectId/decisions` replace a project's decision list
- `GET /projects/:projectId/decision-graph` read graph nodes/links
- `PUT /projects/:projectId/decision-graph` update graph nodes/links
- `POST /projects/:projectId/pillars/:pillar/questions` generate pillar-specific
  guided questions (`reliability`, `security`, `cost-optimization`,
  `operational-excellence`, `performance-efficiency`)
- `GET /projects/:projectId/conflicts` run cross-pillar conflict analysis
- `GET /projects/:projectId/outputs` generate architecture output package
- `POST /assistant/guide` generate live guided next steps (heuristic fallback or
  provider-backed using BYO OpenAI/Anthropic key passed per request)

Project and decision state is persisted locally at:

- `platform/artifacts/workspace/projects.json`
