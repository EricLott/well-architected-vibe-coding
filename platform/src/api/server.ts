import express from "express";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LexicalIndexer } from "../indexing/lexical/index.js";
import { runIngestionPipeline } from "../ingestion/pipeline.js";
import { normalizePillarInput } from "../orchestration/pillars.js";
import { OrchestrationService } from "../orchestration/service.js";
import { loadIngestionConfig } from "../shared/config.js";
import { RetrievalService } from "../retrieval/index.js";
import { fileExists } from "../shared/fs.js";
import { ProjectStore } from "../storage/project_store.js";
import type {
  AssistantGuideRequest,
  InitializeProjectRequest,
  RetrievalRequest,
  UpdateDecisionGraphRequest,
  UpdateDecisionsRequest,
} from "../shared/types.js";

export interface ApiServerOptions {
  repositoryRoot: string;
  port?: number;
}

async function getIndexFilePath(repositoryRoot: string): Promise<string> {
  const ingestionConfig = await loadIngestionConfig(repositoryRoot);
  return path.resolve(
    repositoryRoot,
    ingestionConfig.artifactsRoot,
    "indexes/lexical_index.json",
  );
}

export async function hasLexicalIndex(repositoryRoot: string): Promise<boolean> {
  const indexPath = await getIndexFilePath(repositoryRoot);
  return fileExists(indexPath);
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
    const exists = await hasLexicalIndex(repositoryRoot);
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

  const orchestrationService = new OrchestrationService({
    projectStore: new ProjectStore(repositoryRoot),
    resolveRetrievalService: ensureRetrievalService,
  });

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
          message: "No index found. Run npm run ingest first.",
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

  app.get("/projects", async (_req, res) => {
    try {
      const projects = await orchestrationService.listProjects();
      res.json({ projects });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown project list error";
      res.status(500).json({ status: "error", message });
    }
  });

  app.get("/projects/:projectId", async (req, res) => {
    try {
      const project = await orchestrationService.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ status: "error", message: "Project not found." });
        return;
      }
      res.json({ project });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown project fetch error";
      res.status(500).json({ status: "error", message });
    }
  });

  app.post("/projects/intake", async (req, res) => {
    try {
      const request = (req.body ?? {}) as InitializeProjectRequest;
      const project = await orchestrationService.initializeProject(request);
      res.status(201).json({ project });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown project intake error";
      res.status(400).json({ status: "error", message });
    }
  });

  app.put("/projects/:projectId/decisions", async (req, res) => {
    try {
      const request = req.body as UpdateDecisionsRequest;
      const updated = await orchestrationService.replaceProjectDecisions(
        req.params.projectId,
        request.decisions ?? [],
      );
      if (!updated) {
        res.status(404).json({ status: "error", message: "Project not found." });
        return;
      }
      res.json({ project: updated });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown decision update error";
      res.status(400).json({ status: "error", message });
    }
  });

  app.get("/projects/:projectId/decision-graph", async (req, res) => {
    try {
      const graph = await orchestrationService.getDecisionGraph(req.params.projectId);
      if (!graph) {
        res.status(404).json({ status: "error", message: "Project not found." });
        return;
      }
      res.json({
        projectId: req.params.projectId,
        graph,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown decision graph retrieval error";
      res.status(500).json({ status: "error", message });
    }
  });

  app.put("/projects/:projectId/decision-graph", async (req, res) => {
    try {
      const request = (req.body ?? {}) as UpdateDecisionGraphRequest;
      const updated = await orchestrationService.replaceDecisionGraph(
        req.params.projectId,
        {
          decisions: request.decisions ?? [],
          links: request.links ?? [],
        },
      );
      if (!updated) {
        res.status(404).json({ status: "error", message: "Project not found." });
        return;
      }
      res.json(updated);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown decision graph update error";
      res.status(400).json({ status: "error", message });
    }
  });

  app.post("/projects/:projectId/pillars/:pillar/questions", async (req, res) => {
    try {
      const pillar = normalizePillarInput(req.params.pillar);
      if (!pillar) {
        res
          .status(400)
          .json({ status: "error", message: "Unsupported pillar value." });
        return;
      }

      const guidance = await orchestrationService.generatePillarGuidance(
        req.params.projectId,
        pillar,
      );
      res.json(guidance);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown pillar guidance generation error";
      if (message === "Project not found.") {
        res.status(404).json({ status: "error", message });
        return;
      }
      if (message.includes("Retrieval index is not ready")) {
        res.status(400).json({ status: "error", message });
        return;
      }
      res.status(500).json({ status: "error", message });
    }
  });

  app.get("/projects/:projectId/conflicts", async (req, res) => {
    try {
      const analysis = await orchestrationService.analyzeProjectConflicts(
        req.params.projectId,
      );
      res.json(analysis);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown conflict analysis generation error";
      if (message === "Project not found.") {
        res.status(404).json({ status: "error", message });
        return;
      }
      res.status(500).json({ status: "error", message });
    }
  });

  app.get("/projects/:projectId/outputs", async (req, res) => {
    try {
      const outputs = await orchestrationService.generateProjectOutputs(
        req.params.projectId,
      );
      res.json({
        projectId: req.params.projectId,
        outputs,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown output generation error";
      if (message === "Project not found.") {
        res.status(404).json({ status: "error", message });
        return;
      }
      res.status(500).json({ status: "error", message });
    }
  });

  app.post("/assistant/guide", async (req, res) => {
    try {
      const request = (req.body ?? {}) as AssistantGuideRequest;
      if (!request.phase || typeof request.phase !== "string") {
        res.status(400).json({ status: "error", message: "phase is required." });
        return;
      }
      const response = await orchestrationService.guideAssistant(request);
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown assistant guidance error";
      if (message === "Project not found.") {
        res.status(404).json({ status: "error", message });
        return;
      }
      res.status(400).json({ status: "error", message });
    }
  });

  return {
    app,
    listen(port = options.port ?? 3000) {
      return app.listen(port, () => {
        // Keep runtime output short and deterministic in scripts.
        // eslint-disable-next-line no-console
        console.log(`API listening on http://localhost:${port}`);
      });
    },
  };
}

function resolveRepositoryRootFromCwd(cwd: string): string {
  // `npm run dev` is expected to run from `platform/`.
  return path.resolve(cwd, "..");
}

async function runFromCli(): Promise<void> {
  const repositoryRoot = resolveRepositoryRootFromCwd(process.cwd());
  const indexExists = await hasLexicalIndex(repositoryRoot);
  if (!indexExists) {
    // eslint-disable-next-line no-console
    console.error("No index found. Run npm run ingest first.");
    process.exit(1);
  }

  const server = await createApiServer({
    repositoryRoot,
    port: Number(process.env.PORT ?? 3000),
  });
  server.listen(Number(process.env.PORT ?? 3000));
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runFromCli().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[api] failed to start server");
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
