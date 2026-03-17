import path from "node:path";
import { chunkDocument, withDeterministicChunkIds } from "./chunker/index.js";
import { writeArtifacts } from "./artifact_writer/index.js";
import { buildChunkRecords } from "./metadata/index.js";
import {
  buildSourceManifest,
  createRepoSnapshot,
  writeSourceManifest,
} from "./repo_snapshot/index.js";
import { parseSourceFiles } from "./parser/index.js";
import { scanSourceFiles } from "./scanner/index.js";
import {
  loadIngestionConfig,
  loadMappingConfig,
} from "../shared/config.js";
import type { ChunkRecord, IngestionSummary } from "../shared/types.js";
import { LexicalIndexer, type LexicalIndexData } from "../indexing/lexical/index.js";

export interface IngestionRunResult {
  summary: IngestionSummary;
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexData;
}

export async function runIngestionPipeline(input: {
  repositoryRoot: string;
  ingestionConfigPath?: string;
  mappingConfigPath?: string;
}): Promise<IngestionRunResult> {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const ingestionConfig = await loadIngestionConfig(
    repositoryRoot,
    input.ingestionConfigPath,
  );
  const mappingConfig = await loadMappingConfig(
    repositoryRoot,
    input.mappingConfigPath,
  );

  const snapshot = createRepoSnapshot({
    repositoryRoot,
    repositoryName: ingestionConfig.repositoryName,
    docsRoot: ingestionConfig.docsRoot,
  });

  const scanResult = await scanSourceFiles(repositoryRoot, ingestionConfig);
  const sourceManifest = buildSourceManifest(snapshot, scanResult);
  await writeSourceManifest(sourceManifest, repositoryRoot, ingestionConfig.artifactsRoot);

  const parsedDocuments = await parseSourceFiles(scanResult.includedFiles);
  const chunkRecords: ChunkRecord[] = [];

  parsedDocuments.forEach((parsedDocument) => {
    const drafts = chunkDocument(parsedDocument, ingestionConfig.chunking);
    const deterministicDrafts = withDeterministicChunkIds(parsedDocument, drafts);
    const records = buildChunkRecords({
      parsedDocument,
      chunkDrafts: deterministicDrafts,
      snapshot,
      mapping: mappingConfig,
    });
    chunkRecords.push(...records);
  });

  const summary: IngestionSummary = {
    repositoryName: snapshot.repositoryName,
    commitHash: snapshot.commitHash,
    ingestionTimestamp: snapshot.ingestionTimestamp,
    includedFileCount: scanResult.includedFileCount,
    excludedFileCount: scanResult.excludedFileCount,
    parsedDocumentCount: parsedDocuments.length,
    chunkCount: chunkRecords.length,
    artifactsRoot: ingestionConfig.artifactsRoot,
  };

  await writeArtifacts({
    repositoryRoot,
    artifactsRoot: ingestionConfig.artifactsRoot,
    parsedDocuments,
    chunks: chunkRecords,
    sourceManifest,
    summary,
  });

  const lexicalIndexer = new LexicalIndexer();
  const lexicalIndex = lexicalIndexer.buildIndex(chunkRecords);
  await lexicalIndexer.writeToDisk(
    repositoryRoot,
    ingestionConfig.artifactsRoot,
    lexicalIndex,
  );

  return {
    summary,
    chunks: chunkRecords,
    lexicalIndex,
  };
}
