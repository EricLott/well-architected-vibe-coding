import path from "node:path";
import {
  ensureDir,
  writeJsonFile,
  writeJsonlFile,
} from "../../shared/fs.js";
import { safeFileNameFromPath } from "../../shared/path.js";
import type {
  ChunkRecord,
  IngestionSummary,
  ParsedDocument,
  SourceManifest,
} from "../../shared/types.js";

function sortChunks(chunks: ChunkRecord[]): ChunkRecord[] {
  return [...chunks].sort((a, b) => {
    const pathComparison = a.metadata.repo_relative_path.localeCompare(
      b.metadata.repo_relative_path,
    );
    if (pathComparison !== 0) {
      return pathComparison;
    }
    if (a.metadata.section_order !== b.metadata.section_order) {
      return a.metadata.section_order - b.metadata.section_order;
    }
    if (
      a.metadata.chunk_order_in_section !== b.metadata.chunk_order_in_section
    ) {
      return (
        a.metadata.chunk_order_in_section - b.metadata.chunk_order_in_section
      );
    }
    return a.chunk_id.localeCompare(b.chunk_id);
  });
}

export async function writeArtifacts(input: {
  repositoryRoot: string;
  artifactsRoot: string;
  parsedDocuments: ParsedDocument[];
  chunks: ChunkRecord[];
  sourceManifest: SourceManifest;
  summary: IngestionSummary;
}): Promise<void> {
  const {
    repositoryRoot,
    artifactsRoot,
    parsedDocuments,
    chunks,
    sourceManifest,
    summary,
  } = input;
  const artifactsAbsoluteRoot = path.resolve(repositoryRoot, artifactsRoot);
  const normalizedDir = path.join(artifactsAbsoluteRoot, "normalized");
  const chunksDir = path.join(artifactsAbsoluteRoot, "chunks");
  const inventoryDir = path.join(artifactsAbsoluteRoot, "inventory");
  const indexesDir = path.join(artifactsAbsoluteRoot, "indexes");

  await Promise.all([
    ensureDir(normalizedDir),
    ensureDir(chunksDir),
    ensureDir(inventoryDir),
    ensureDir(indexesDir),
  ]);

  const sortedParsedDocuments = [...parsedDocuments].sort((a, b) =>
    a.source.repoRelativePath.localeCompare(b.source.repoRelativePath),
  );
  for (const parsed of sortedParsedDocuments) {
    const normalizedFilePath = path.join(
      normalizedDir,
      `${safeFileNameFromPath(parsed.source.repoRelativePath)}.json`,
    );
    await writeJsonFile(normalizedFilePath, parsed);
  }

  const sortedChunks = sortChunks(chunks);
  await writeJsonlFile(path.join(chunksDir, "chunks.jsonl"), sortedChunks);

  await writeJsonFile(path.join(chunksDir, "chunk_manifest.json"), {
    chunk_count: sortedChunks.length,
    source_file_count: sortedParsedDocuments.length,
    generated_at: summary.ingestionTimestamp,
    repository_name: summary.repositoryName,
    commit_hash: summary.commitHash,
  });

  await writeJsonFile(path.join(inventoryDir, "source_manifest.json"), sourceManifest);
  await writeJsonFile(path.join(inventoryDir, "ingestion_summary.json"), summary);
}
