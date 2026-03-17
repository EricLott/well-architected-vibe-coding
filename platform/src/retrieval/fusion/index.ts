import type { RankedChunkResult } from "../../indexing/lexical/index.js";

export function lexicalOnlyFusion(results: RankedChunkResult[]): RankedChunkResult[] {
  return results;
}
