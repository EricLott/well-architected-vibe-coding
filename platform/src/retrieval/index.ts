import { LexicalSearcher, type LexicalIndexData } from "../indexing/lexical/index.js";
import { buildCitation } from "./citations/index.js";
import { lexicalOnlyFusion } from "./fusion/index.js";
import { normalizeRetrievalRequest } from "./query_understanding/index.js";
import type { RetrievalRequest, RetrievalResponse } from "../shared/types.js";

export class RetrievalService {
  private readonly lexicalSearcher: LexicalSearcher;

  constructor(indexData: LexicalIndexData) {
    this.lexicalSearcher = new LexicalSearcher(indexData);
  }

  public retrieve(request: RetrievalRequest): RetrievalResponse {
    const normalized = normalizeRetrievalRequest(request);
    if (!normalized.query) {
      return { query: request.query ?? "", results: [] };
    }

    const ranked = this.lexicalSearcher.search({
      query: normalized.query,
      filters: request.filters,
      topK: normalized.topK,
    });
    const fused = lexicalOnlyFusion(ranked);

    return {
      query: request.query,
      results: fused.map(({ chunk, score }) => ({
        chunk_id: chunk.chunk_id,
        score,
        citation: buildCitation(chunk),
        metadata: chunk.metadata,
        content: chunk.content,
      })),
    };
  }
}
