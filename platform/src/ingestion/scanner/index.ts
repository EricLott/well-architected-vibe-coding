import fg from "fast-glob";
import path from "node:path";
import { toPosixPath } from "../../shared/path.js";
import type { IngestionConfig, ScanResult, SourceFile } from "../../shared/types.js";

function toSourceFile(
  repositoryRoot: string,
  docsRoot: string,
  repoRelativePath: string,
): SourceFile {
  const repoRelativePosix = toPosixPath(repoRelativePath);
  const docsPrefix = `${toPosixPath(docsRoot)}/`;
  const docsRelativePath = repoRelativePosix.startsWith(docsPrefix)
    ? repoRelativePosix.slice(docsPrefix.length)
    : repoRelativePosix;
  return {
    absolutePath: path.resolve(repositoryRoot, repoRelativePosix),
    repoRelativePath: repoRelativePosix,
    docsRelativePath,
  };
}

export async function scanSourceFiles(
  repositoryRoot: string,
  config: IngestionConfig,
): Promise<ScanResult> {
  const allMatches = await fg(config.include, {
    cwd: repositoryRoot,
    onlyFiles: true,
    dot: false,
    unique: true,
    ignore: [],
  });

  const includedMatches = await fg(config.include, {
    cwd: repositoryRoot,
    onlyFiles: true,
    dot: false,
    unique: true,
    ignore: config.exclude,
  });

  const sortedIncluded = includedMatches
    .map((file) => toPosixPath(file))
    .sort((a, b) => a.localeCompare(b));

  const includedFiles = sortedIncluded.map((repoRelativePath) =>
    toSourceFile(repositoryRoot, config.docsRoot, repoRelativePath),
  );

  return {
    includedFiles,
    includedFileCount: includedFiles.length,
    excludedFileCount: Math.max(0, allMatches.length - includedFiles.length),
  };
}
