import path from "node:path";

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function toAbsolutePath(root: string, relativePath: string): string {
  return path.resolve(root, relativePath);
}

export function safeFileNameFromPath(relativePath: string): string {
  return relativePath.replace(/[\\/]/g, "__").replace(/[:*?"<>|]/g, "_");
}

export function getPathParts(repoRelativePath: string): string[] {
  return toPosixPath(repoRelativePath).split("/").filter(Boolean);
}
