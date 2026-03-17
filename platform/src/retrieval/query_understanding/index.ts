import type { RetrievalRequest } from "../../shared/types.js";

export interface NormalizedQuery {
  query: string;
  topK: number;
}

export function normalizeRetrievalRequest(
  request: RetrievalRequest,
): NormalizedQuery {
  const query = request.query?.trim() ?? "";
  const topK = Math.min(Math.max(request.topK ?? 8, 1), 50);
  return { query, topK };
}
