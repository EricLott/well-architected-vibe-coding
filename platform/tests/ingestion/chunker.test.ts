import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { chunkDocument, withDeterministicChunkIds } from "../../src/ingestion/chunker/index.js";
import { parseMarkdownContent, parseSourceFile } from "../../src/ingestion/parser/index.js";
import { loadIngestionConfig } from "../../src/shared/config.js";
import type { SourceFile } from "../../src/shared/types.js";

describe("chunker", () => {
  it("produces stable chunk IDs on repeated runs", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const config = await loadIngestionConfig(repositoryRoot);
    const source: SourceFile = {
      absolutePath: "/tmp/sample.md",
      repoRelativePath: "well-architected/reliability/stability-sample.md",
      docsRelativePath: "reliability/stability-sample.md",
    };
    const markdown = `---
title: Stability sample
---

# Reliability sample

## Reliability

Paragraph one.

Paragraph two.

| Recommendation | Benefit |
|---|---|
| A | B |
| C | D |

## Security

> [!IMPORTANT]
> Keep this secure.

Another paragraph.`;

    const parsed = parseMarkdownContent(markdown, source, "2026-03-17T12:00:00.000Z");

    const runOne = withDeterministicChunkIds(
      parsed,
      chunkDocument(parsed, config.chunking),
    );
    const runTwo = withDeterministicChunkIds(
      parsed,
      chunkDocument(parsed, config.chunking),
    );

    expect(runOne.map((chunk) => chunk.chunkId)).toEqual(
      runTwo.map((chunk) => chunk.chunkId),
    );
  });

  it("keeps service guide pillar sections separated by heading path", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const config = await loadIngestionConfig(repositoryRoot);
    const serviceGuidePath = "well-architected/service-guides/virtual-machines.md";
    const absolutePath = path.resolve(repositoryRoot, serviceGuidePath);
    await fs.access(absolutePath);

    const source: SourceFile = {
      absolutePath,
      repoRelativePath: serviceGuidePath,
      docsRelativePath: "service-guides/virtual-machines.md",
    };
    const parsed = await parseSourceFile(source);
    const chunks = withDeterministicChunkIds(
      parsed,
      chunkDocument(parsed, config.chunking),
    );

    const hasReliability = chunks.some((chunk) =>
      chunk.headingPath.some((heading) => heading === "Reliability"),
    );
    const hasSecurity = chunks.some((chunk) =>
      chunk.headingPath.some((heading) => heading === "Security"),
    );
    expect(hasReliability).toBe(true);
    expect(hasSecurity).toBe(true);

    const pillarNames = [
      "Reliability",
      "Security",
      "Cost Optimization",
      "Operational Excellence",
      "Performance Efficiency",
    ];
    chunks.forEach((chunk) => {
      const hitCount = pillarNames.filter((pillar) =>
        chunk.headingPath.includes(pillar),
      ).length;
      expect(hitCount).toBeLessThanOrEqual(1);
    });
  });
});
