import { execSync } from "node:child_process";
import path from "node:path";
import { writeJsonFile } from "../../shared/fs.js";
import type { RepoSnapshot, ScanResult, SourceManifest } from "../../shared/types.js";

function getGitCommitHash(repositoryRoot: string): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

export function createRepoSnapshot(input: {
  repositoryRoot: string;
  repositoryName: string;
  docsRoot: string;
  ingestionTimestamp?: string;
}): RepoSnapshot {
  return {
    repositoryName: input.repositoryName,
    repositoryRoot: path.resolve(input.repositoryRoot),
    docsRoot: input.docsRoot,
    commitHash: getGitCommitHash(input.repositoryRoot),
    ingestionTimestamp: input.ingestionTimestamp ?? new Date().toISOString(),
  };
}

export function buildSourceManifest(
  snapshot: RepoSnapshot,
  scanResult: ScanResult,
): SourceManifest {
  return {
    repository_name: snapshot.repositoryName,
    repository_root: snapshot.repositoryRoot,
    docs_root: snapshot.docsRoot,
    commit_hash: snapshot.commitHash,
    ingestion_timestamp: snapshot.ingestionTimestamp,
    included_file_count: scanResult.includedFileCount,
    excluded_file_count: scanResult.excludedFileCount,
    included_files: scanResult.includedFiles
      .map((file) => file.repoRelativePath)
      .sort((a, b) => a.localeCompare(b)),
  };
}

export async function writeSourceManifest(
  sourceManifest: SourceManifest,
  repositoryRoot: string,
  artifactsRoot: string,
): Promise<string> {
  const outputPath = path.resolve(
    repositoryRoot,
    artifactsRoot,
    "inventory/source_manifest.json",
  );
  await writeJsonFile(outputPath, sourceManifest);
  return outputPath;
}
