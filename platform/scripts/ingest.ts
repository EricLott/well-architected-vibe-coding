import path from "node:path";
import { chunkDocument, withDeterministicChunkIds } from "../src/ingestion/chunker/index.js";
import { writeArtifacts } from "../src/ingestion/artifact_writer/index.js";
import { buildChunkRecords } from "../src/ingestion/metadata/index.js";
import {
  buildSourceManifest,
  createRepoSnapshot,
  writeSourceManifest,
} from "../src/ingestion/repo_snapshot/index.js";
import { parseSourceFiles } from "../src/ingestion/parser/index.js";
import { scanSourceFiles } from "../src/ingestion/scanner/index.js";
import {
  loadIngestionConfig,
  loadMappingConfig,
} from "../src/shared/config.js";
import { ensureDir, fileExists } from "../src/shared/fs.js";
import { LexicalIndexer } from "../src/indexing/lexical/index.js";
import type { ChunkMetadata, ChunkRecord, IngestionSummary } from "../src/shared/types.js";

const REQUIRED_METADATA_FIELDS: Array<keyof ChunkMetadata> = [
  "chunk_id",
  "pillar",
  "subtopic",
  "title",
  "heading_path",
  "source_path",
  "repo_relative_path",
  "content_type",
  "file_name",
  "repository_name",
  "commit_hash",
  "last_modified",
  "section_order",
  "chunk_order_in_section",
  "ingestion_timestamp",
];

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[ingest] ${message}`);
}

function fail(message: string, error?: unknown): never {
  // eslint-disable-next-line no-console
  console.error(`[ingest] ERROR: ${message}`);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
  throw new Error(message);
}

function validateChunkMetadata(chunks: ChunkRecord[]): void {
  for (const chunk of chunks) {
    for (const field of REQUIRED_METADATA_FIELDS) {
      const value = chunk.metadata[field];
      if (typeof value === "undefined" || value === null) {
        fail(
          `Missing required metadata field "${field}" on chunk "${chunk.chunk_id}".`,
        );
      }
    }
  }
}

async function ensureArtifactDirectories(
  repositoryRoot: string,
  artifactsRoot: string,
): Promise<void> {
  const artifactsBase = path.resolve(repositoryRoot, artifactsRoot);
  const requiredDirs = [
    artifactsBase,
    path.join(artifactsBase, "inventory"),
    path.join(artifactsBase, "normalized"),
    path.join(artifactsBase, "chunks"),
    path.join(artifactsBase, "indexes"),
  ];

  for (const dir of requiredDirs) {
    await ensureDir(dir);
  }
}

async function run(): Promise<void> {
  const platformRoot = process.cwd();
  const repositoryRoot = path.resolve(platformRoot, "..");

  log("loading configuration...");
  const ingestionConfig = await loadIngestionConfig(repositoryRoot);
  const mappingConfig = await loadMappingConfig(repositoryRoot);

  log("ensuring artifact directories...");
  await ensureArtifactDirectories(repositoryRoot, ingestionConfig.artifactsRoot);

  log("capturing repository snapshot...");
  const snapshot = createRepoSnapshot({
    repositoryRoot,
    repositoryName: ingestionConfig.repositoryName,
    docsRoot: ingestionConfig.docsRoot,
  });

  log("scanning files...");
  const scanResult = await scanSourceFiles(repositoryRoot, ingestionConfig);
  log(
    `found ${scanResult.includedFileCount} markdown files (excluded: ${scanResult.excludedFileCount})`,
  );

  log("writing source manifest...");
  const sourceManifest = buildSourceManifest(snapshot, scanResult);
  await writeSourceManifest(
    sourceManifest,
    repositoryRoot,
    ingestionConfig.artifactsRoot,
  );

  log("parsing markdown and front matter...");
  const parsedDocuments = await parseSourceFiles(scanResult.includedFiles);
  log(`parsed ${parsedDocuments.length} documents`);

  log("chunking content and extracting metadata...");
  const chunkRecords: ChunkRecord[] = [];
  for (const parsedDocument of parsedDocuments) {
    const chunkDrafts = withDeterministicChunkIds(
      parsedDocument,
      chunkDocument(parsedDocument, ingestionConfig.chunking),
    );
    const records = buildChunkRecords({
      parsedDocument,
      chunkDrafts,
      snapshot,
      mapping: mappingConfig,
    });
    chunkRecords.push(...records);
  }
  log(`generated ${chunkRecords.length} chunks`);

  log("writing normalized and chunk artifacts...");
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

  log("building lexical index...");
  const lexicalIndexer = new LexicalIndexer();
  const lexicalIndex = lexicalIndexer.buildIndex(chunkRecords);
  const indexPath = await lexicalIndexer.writeToDisk(
    repositoryRoot,
    ingestionConfig.artifactsRoot,
    lexicalIndex,
  );

  log("running post-ingest validation...");
  if (chunkRecords.length <= 0) {
    fail("No chunks were generated. Check ingestion include/exclude config.");
  }

  validateChunkMetadata(chunkRecords);

  const indexExists = await fileExists(indexPath);
  if (!indexExists) {
    fail(`Lexical index file was not created at "${indexPath}".`);
  }
  if (Object.keys(lexicalIndex.invertedIndex).length <= 0) {
    fail("Lexical index was created but contains no searchable terms.");
  }

  log(
    `complete (files=${scanResult.includedFileCount}, chunks=${chunkRecords.length}, terms=${Object.keys(lexicalIndex.invertedIndex).length})`,
  );
}

run().catch((error) => {
  fail("ingestion failed. Review the error details above.", error);
});
