import type { ChunkRecord } from "../../shared/types.js";

export function buildCitation(chunk: ChunkRecord): {
  source_path: string;
  heading_path: string[];
  title: string;
} {
  return {
    source_path: chunk.metadata.source_path,
    heading_path: chunk.metadata.heading_path,
    title: chunk.metadata.title,
  };
}
