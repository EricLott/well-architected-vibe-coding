# Well-Architected Vibe Coding platform (phase 1 MVP)

This folder contains the deterministic ingestion and lexical retrieval foundation for phase 1.

## Prerequisites

- Node.js 20+
- npm

## Install

```bash
cd platform
npm install
```

## Run ingestion

```bash
npm run ingest
```

This scans `../well-architected/**/*.md`, parses and chunks content, extracts metadata, writes artifacts, and builds a lexical index.

## Run API

```bash
npm run api
```

Endpoints:

- `GET /health`
- `POST /ingest`
- `POST /retrieve`

## Artifact output locations

- `platform/artifacts/inventory/source_manifest.json`
- `platform/artifacts/inventory/ingestion_summary.json`
- `platform/artifacts/normalized/*.json`
- `platform/artifacts/chunks/chunks.jsonl`
- `platform/artifacts/chunks/chunk_manifest.json`
- `platform/artifacts/indexes/lexical_index.json`

## Implemented in phase 1

- deterministic source scanning and snapshot manifest
- markdown parse with front matter, headings, sections, and local links
- heading-aware chunking with table/callout handling
- normalized metadata extraction
- artifact writing and ingestion summaries
- lexical retrieval index and metadata filters
- minimal API for ingest/retrieve/health
- baseline ingestion and retrieval tests

## Deferred to phase 2

- SQLite FTS5 backing store (current lexical index is file-backed abstraction)
- vector embeddings and hybrid retrieval fusion
- reranking and query expansion
- orchestration and full agentic workflow layers
