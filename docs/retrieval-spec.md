# Retrieval specification (phase 1)

## Retrieval model

- Primary retrieval method: lexical BM25-style scoring over chunk corpus
- Index implementation: deterministic on-disk JSON lexical index with abstraction suitable for SQLite FTS5 migration
- Query interface supports optional metadata filters

## Query contract

Input:

```json
{
  "query": "authentication strategy for small SaaS",
  "filters": {
    "pillar": ["security"],
    "doc_group": ["pillar", "service-guide"],
    "service_name": [],
    "workload_name": []
  },
  "topK": 8
}
```

Output:

```json
{
  "query": "authentication strategy for small SaaS",
  "results": [
    {
      "chunk_id": "...",
      "score": 1.23,
      "citation": {
        "source_path": "...",
        "heading_path": ["..."],
        "title": "..."
      },
      "metadata": {},
      "content": "..."
    }
  ]
}
```

## Ranking

- Tokenization over chunk content + title + heading path
- BM25-style rank scoring with deterministic tie-breakers by `chunk_id`
- Filter application occurs before scoring contribution aggregation

## Phase 1 limitations

- No vector retrieval yet
- No semantic reranker yet
- No learned query expansion yet
- Fusion module is lexical-only pass-through in phase 1
