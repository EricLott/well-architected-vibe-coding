# Chunking specification (phase 1)

## Scope

- Input corpus: `well-architected/**/*.md`
- Front matter is parsed and excluded from chunk body text
- Output chunks are deterministic across re-runs on unchanged input

## Sectioning strategy

- Parse markdown heading hierarchy (`#` to `######`)
- Build sections from heading content windows
- Preserve `heading_path` for each section
- Keep intro/preface text as a synthetic introduction section when present

## Chunk size policy

- Target range: 350 to 650 tokens
- Soft minimum: 120 tokens
- Soft maximum: 800 tokens
- Overlap configured in config file for future semantic fusion; phase 1 lexical path does not yet use overlap slicing

## Split rules

- Primary split by heading section
- Oversized sections are split by paragraph/list/table/blockquote units
- Oversized paragraph units are further split on paragraph boundaries
- Table blocks are retained with context and split by row groups when large
- Callout blocks (`> [!...]`) are preserved and flagged in metadata

## Merge rules

- Undersized chunks within the same section are merged when combined size stays under soft maximum
- Cross-section merging is intentionally avoided in phase 1 to preserve clear citation boundaries

## Determinism rules

- Files are processed in sorted path order
- Sections and chunks maintain deterministic order counters
- Chunk ID format:
  - `<repo-relative-path>::<heading-path>::<section-order>-<chunk-order>::<content-hash-short>`
- `content-hash-short` is derived from normalized chunk text
