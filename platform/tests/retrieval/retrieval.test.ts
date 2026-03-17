import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkDocument, withDeterministicChunkIds } from "../../src/ingestion/chunker/index.js";
import { buildChunkRecords } from "../../src/ingestion/metadata/index.js";
import { parseSourceFile } from "../../src/ingestion/parser/index.js";
import { createRepoSnapshot } from "../../src/ingestion/repo_snapshot/index.js";
import { LexicalIndexer } from "../../src/indexing/lexical/index.js";
import { RetrievalService } from "../../src/retrieval/index.js";
import { loadIngestionConfig, loadMappingConfig } from "../../src/shared/config.js";
import type { SourceFile } from "../../src/shared/types.js";

async function buildRetrievalServiceFromSelectedDocs() {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const ingestionConfig = await loadIngestionConfig(repositoryRoot);
  const mappingConfig = await loadMappingConfig(repositoryRoot);

  const selectedPaths = [
    "well-architected/reliability/principles.md",
    "well-architected/reliability/tradeoffs.md",
    "well-architected/service-guides/virtual-machines.md",
    "well-architected/ai/mlops-genaiops.md",
  ];

  const sourceFiles: SourceFile[] = selectedPaths.map((repoRelativePath) => ({
    absolutePath: path.resolve(repositoryRoot, repoRelativePath),
    repoRelativePath,
    docsRelativePath: repoRelativePath.replace(/^well-architected\//, ""),
  }));

  const snapshot = createRepoSnapshot({
    repositoryRoot,
    repositoryName: ingestionConfig.repositoryName,
    docsRoot: ingestionConfig.docsRoot,
    ingestionTimestamp: "2026-03-17T12:00:00.000Z",
  });

  const chunkRecords = [];
  for (const sourceFile of sourceFiles) {
    const parsed = await parseSourceFile(sourceFile);
    const drafts = withDeterministicChunkIds(
      parsed,
      chunkDocument(parsed, ingestionConfig.chunking),
    );
    const records = buildChunkRecords({
      parsedDocument: parsed,
      chunkDrafts: drafts,
      snapshot,
      mapping: mappingConfig,
    });
    chunkRecords.push(...records);
  }

  const lexicalIndexer = new LexicalIndexer();
  const lexicalIndex = lexicalIndexer.buildIndex(chunkRecords);
  return new RetrievalService(lexicalIndex);
}

describe("retrieval service", () => {
  it("returns expected chunks for pillar, service guide, workload, and tradeoff queries", async () => {
    const service = await buildRetrievalServiceFromSelectedDocs();

    const pillarResult = service.retrieve({
      query: "design for resilience business requirements",
      filters: { pillar: ["reliability"] },
      topK: 5,
    });
    expect(
      pillarResult.results.some((item) =>
        item.citation.source_path.endsWith("reliability/principles.md"),
      ),
    ).toBe(true);

    const serviceGuideResult = service.retrieve({
      query: "Virtual Machine Scale Sets flexible orchestration mode",
      filters: { doc_group: ["service-guide"] },
      topK: 5,
    });
    expect(
      serviceGuideResult.results.some((item) =>
        item.citation.source_path.endsWith("service-guides/virtual-machines.md"),
      ),
    ).toBe(true);

    const workloadResult = service.retrieve({
      query: "MLOps and GenAIOps model lifecycle",
      filters: { workload_name: ["ai"] },
      topK: 5,
    });
    expect(
      workloadResult.results.some((item) =>
        item.citation.source_path.endsWith("ai/mlops-genaiops.md"),
      ),
    ).toBe(true);

    const tradeoffResult = service.retrieve({
      query: "reliability tradeoffs with security increased surface area",
      filters: { content_type: ["tradeoff"] },
      topK: 5,
    });
    expect(
      tradeoffResult.results.some((item) =>
        item.citation.source_path.endsWith("reliability/tradeoffs.md"),
      ),
    ).toBe(true);
  });
});
