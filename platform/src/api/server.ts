import express from "express";
import { LexicalIndexer } from "../indexing/lexical/index.js";
import { runIngestionPipeline } from "../ingestion/pipeline.js";
import { loadIngestionConfig } from "../shared/config.js";
import { RetrievalService } from "../retrieval/index.js";
import { fileExists } from "../shared/fs.js";
import type { RetrievalRequest } from "../shared/types.js";
import path from "node:path";

export interface ApiServerOptions {
  repositoryRoot: string;
  port?: number;
}

export async function createApiServer(options: ApiServerOptions) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  let retrievalService: RetrievalService | null = null;
  let lastIngestionSummary: unknown = null;

  async function ensureRetrievalService(): Promise<RetrievalService | null> {
    if (retrievalService) {
      return retrievalService;
    }
    const ingestionConfig = await loadIngestionConfig(repositoryRoot);
    const indexFilePath = path.resolve(
      repositoryRoot,
      ingestionConfig.artifactsRoot,
      "indexes/lexical_index.json",
    );
    const exists = await fileExists(indexFilePath);
    if (!exists) {
      return null;
    }
    const lexicalIndexer = new LexicalIndexer();
    const lexicalIndex = await lexicalIndexer.loadFromDisk(
      repositoryRoot,
      ingestionConfig.artifactsRoot,
    );
    retrievalService = new RetrievalService(lexicalIndex);
    return retrievalService;
  }

  app.get("/health", async (_req, res) => {
    const service = await ensureRetrievalService();
    res.json({
      status: "ok",
      retrievalReady: Boolean(service),
      lastIngestionSummary,
    });
  });

  app.post("/ingest", async (_req, res) => {
    try {
      const result = await runIngestionPipeline({ repositoryRoot });
      retrievalService = new RetrievalService(result.lexicalIndex);
      lastIngestionSummary = result.summary;
      res.json({
        status: "ok",
        summary: result.summary,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingestion error";
      res.status(500).json({ status: "error", message });
    }
  });

  app.post("/retrieve", async (req, res) => {
    try {
      const service = await ensureRetrievalService();
      if (!service) {
        res.status(400).json({
          status: "error",
          message:
            "No lexical index found. Run POST /ingest before calling /retrieve.",
        });
        return;
      }
      const request = req.body as RetrievalRequest;
      const response = service.retrieve(request);
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown retrieval error";
      res.status(500).json({ status: "error", message });
    }
  });

  return {
    app,
    listen(port = options.port ?? 4000) {
      return app.listen(port, () => {
        // Keep runtime output short and deterministic in scripts.
        // eslint-disable-next-line no-console
        console.log(`API listening on http://localhost:${port}`);
      });
    },
  };
}
