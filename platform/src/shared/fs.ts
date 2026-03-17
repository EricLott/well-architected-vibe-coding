import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(
  filePath: string,
  data: unknown,
  pretty = true,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const payload = pretty
    ? `${JSON.stringify(data, null, 2)}\n`
    : JSON.stringify(data);
  await fs.writeFile(filePath, payload, "utf8");
}

export async function writeJsonlFile<T>(
  filePath: string,
  rows: T[],
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const lines = rows.map((row) => JSON.stringify(row));
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
