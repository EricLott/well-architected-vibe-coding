import fs from "node:fs/promises";
import path from "node:path";
import { loadIngestionConfig } from "../src/shared/config.js";
import { fileExists } from "../src/shared/fs.js";
import { LexicalIndexer } from "../src/indexing/lexical/index.js";
import type { ChunkRecord } from "../src/shared/types.js";

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[build:index] ${message}`);
}

function fail(message: string, error?: unknown): never {
  // eslint-disable-next-line no-console
  console.error(`[build:index] ERROR: ${message}`);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
  throw new Error(message);
}

async function readChunkRecords(chunksPath: string): Promise<ChunkRecord[]> {
  const exists = await fileExists(chunksPath);
  if (!exists) {
    fail(`Chunk artifact not found at "${chunksPath}". Run npm run ingest first.`);
  }
  const raw = await fs.readFile(chunksPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChunkRecord);
}

async function run(): Promise<void> {
  const platformRoot = process.cwd();
  const repositoryRoot = path.resolve(platformRoot, "..");
  const ingestionConfig = await loadIngestionConfig(repositoryRoot);
  const chunksPath = path.resolve(
    repositoryRoot,
    ingestionConfig.artifactsRoot,
    "chunks/chunks.jsonl",
  );

  log("loading chunk artifacts...");
  const chunks = await readChunkRecords(chunksPath);
  log(`loaded ${chunks.length} chunks`);

  if (chunks.length === 0) {
    fail("Chunk artifact is empty. Run npm run ingest first.");
  }

  log("building lexical index...");
  const lexicalIndexer = new LexicalIndexer();
  const lexicalIndex = lexicalIndexer.buildIndex(chunks);
  const indexPath = await lexicalIndexer.writeToDisk(
    repositoryRoot,
    ingestionConfig.artifactsRoot,
    lexicalIndex,
  );

  if (Object.keys(lexicalIndex.invertedIndex).length === 0) {
    fail("Index build completed but contains no searchable terms.");
  }

  log(
    `complete (terms=${Object.keys(lexicalIndex.invertedIndex).length}, output=${indexPath})`,
  );
}

run().catch((error) => fail("index build failed.", error));
