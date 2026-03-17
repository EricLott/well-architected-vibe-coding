import type { RetrievalRequest, RetrievalResponse } from "../types/app";

export interface RetrievalService {
  retrieve(request: RetrievalRequest): Promise<RetrievalResponse>;
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export const retrievalService: RetrievalService = {
  async retrieve(request) {
    const response = await fetch("/retrieve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return (await response.json()) as RetrievalResponse;
  },
};
