import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadIngestionConfig } from "../../src/shared/config.js";
import { scanSourceFiles } from "../../src/ingestion/scanner/index.js";

describe("scanner", () => {
  it("returns deterministic sorted source file ordering", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const ingestionConfig = await loadIngestionConfig(repositoryRoot);

    const first = await scanSourceFiles(repositoryRoot, ingestionConfig);
    const second = await scanSourceFiles(repositoryRoot, ingestionConfig);

    const firstPaths = first.includedFiles.map((file) => file.repoRelativePath);
    const secondPaths = second.includedFiles.map((file) => file.repoRelativePath);

    expect(firstPaths).toEqual(secondPaths);
    expect([...firstPaths]).toEqual([...firstPaths].sort((a, b) => a.localeCompare(b)));
    expect(first.includedFileCount).toBeGreaterThan(0);
  });
});
