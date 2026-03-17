import fs from "node:fs/promises";
import path from "node:path";

function isRetryableWriteError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "UNKNOWN" || code === "EPERM" || code === "EBUSY";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeFileWithRetry(
  filePath: string,
  payload: string,
  maxAttempts = 4,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.writeFile(filePath, payload, "utf8");
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWriteError(error) || attempt === maxAttempts) {
        throw error;
      }
      // On some Windows setups, antivirus/indexing can briefly lock existing files.
      await fs.rm(filePath, { force: true });
      await sleep(75 * attempt);
    }
  }
  throw lastError;
}

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
  await writeFileWithRetry(filePath, payload);
}

export async function writeJsonlFile<T>(
  filePath: string,
  rows: T[],
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const lines = rows.map((row) => JSON.stringify(row));
  await writeFileWithRetry(filePath, `${lines.join("\n")}\n`);
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
