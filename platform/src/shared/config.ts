import fs from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import type { IngestionConfig, MappingConfig } from "./types.js";

async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = load(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid YAML config: ${filePath}`);
  }
  return parsed as T;
}

export async function loadIngestionConfig(
  repositoryRoot: string,
  configPath = "platform/config/ingestion.yml",
): Promise<IngestionConfig> {
  const absolutePath = path.resolve(repositoryRoot, configPath);
  return readYamlFile<IngestionConfig>(absolutePath);
}

export async function loadMappingConfig(
  repositoryRoot: string,
  configPath = "platform/config/mapping.yml",
): Promise<MappingConfig> {
  const absolutePath = path.resolve(repositoryRoot, configPath);
  return readYamlFile<MappingConfig>(absolutePath);
}
