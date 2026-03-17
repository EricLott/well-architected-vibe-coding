import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { OrchestrationService } from "../../src/orchestration/service.js";
import { ProjectStore } from "../../src/storage/project_store.js";
import type { RetrievalService } from "../../src/retrieval/index.js";
import type { DecisionItem } from "../../src/shared/types.js";

function createStubRetrievalService(): RetrievalService {
  return {
    retrieve: () => ({
      query: "stub",
      results: [
        {
          chunk_id: "chunk-1",
          score: 1,
          citation: {
            source_path: "well-architected/security/design-principles.md",
            heading_path: ["Security", "Identity management"],
            title: "Security design principles",
          },
          metadata: {} as any,
          content:
            "Use strong identity foundations and least privilege to secure access.",
        },
      ],
    }),
  } as unknown as RetrievalService;
}

async function createTempRepositoryRoot(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wavc-platform-"));
  await fs.mkdir(path.join(tempRoot, "platform"), { recursive: true });
  return tempRoot;
}

describe("orchestration service", () => {
  it("initializes a project and persists it in local storage", async () => {
    const repositoryRoot = await createTempRepositoryRoot();
    const store = new ProjectStore(repositoryRoot);
    const service = new OrchestrationService({
      projectStore: store,
      resolveRetrievalService: async () => createStubRetrievalService(),
    });

    const project = await service.initializeProject({
      ideaText:
        "A field service scheduling app for local electricians with customer updates.",
    });

    const listed = await service.listProjects();
    expect(project.id).toBeTruthy();
    expect(project.decisions).toEqual([]);
    expect(project.decisionLinks).toEqual([]);
    expect(Array.isArray(project.additionalPillars)).toBe(true);
    expect(listed.length).toBe(1);
    expect(listed[0]?.id).toBe(project.id);
    expect(listed[0]?.ideaText).toContain("field service scheduling app");
  });

  it("updates decision state and returns pillar guidance", async () => {
    const repositoryRoot = await createTempRepositoryRoot();
    const store = new ProjectStore(repositoryRoot);
    const service = new OrchestrationService({
      projectStore: store,
      resolveRetrievalService: async () => createStubRetrievalService(),
    });
    const project = await service.initializeProject({
      ideaText: "A secure booking portal for independent clinics.",
    });

    const decisions: DecisionItem[] = [
      {
        id: "decision-1",
        title: "Use managed identity for service access",
        description: "Avoid storing static credentials in app code.",
        selectedOption: "Managed identity",
        status: "proposed",
        pillar: "Security",
        rationale: "Reduce secret sprawl and strengthen access controls.",
        risks: ["Some services might need fallback auth during migration."],
        relatedDecisionIds: [],
      },
      {
        id: "decision-2",
        title: "Choose serverless consumption plan",
        description: "Optimize hosting spend for variable demand.",
        selectedOption: "Serverless consumption",
        status: "proposed",
        pillar: "Cost Optimization",
        rationale: "Reduce baseline cost while traffic is uncertain.",
        risks: [],
        relatedDecisionIds: [],
      },
      {
        id: "decision-3",
        title: "Require low latency real-time updates",
        description: "Support near-instant updates for booking changes.",
        selectedOption: "Sub-second websocket updates",
        status: "proposed",
        pillar: "Performance Efficiency",
        rationale: "User workflows depend on low latency feedback.",
        risks: [],
        relatedDecisionIds: [],
      },
    ];

    const updated = await service.replaceProjectDecisions(project.id, decisions);
    expect(updated?.decisions.length).toBe(3);

    const guidance = await service.generatePillarGuidance(project.id, "Security");
    expect(guidance.pillar).toBe("Security");
    expect(guidance.questions.length).toBeGreaterThan(0);
    expect(guidance.retrievedGuidance.length).toBeGreaterThan(0);

    const graph = await service.getDecisionGraph(project.id);
    expect(graph?.nodes.length).toBe(3);
    expect(graph?.links.length).toBe(0);

    const conflicts = await service.analyzeProjectConflicts(project.id);
    expect(conflicts.conflicts.length).toBeGreaterThan(0);

    const outputs = await service.generateProjectOutputs(project.id);
    expect(outputs.promptPack.masterSystemPrompt).toContain(project.name);
  });

  it("generates a downloadable output pack zip with required files", async () => {
    const repositoryRoot = await createTempRepositoryRoot();
    const store = new ProjectStore(repositoryRoot);
    const service = new OrchestrationService({
      projectStore: store,
      resolveRetrievalService: async () => createStubRetrievalService(),
    });
    const project = await service.initializeProject({
      ideaText:
        "A dispatch and scheduling platform for home maintenance teams with customer notifications and invoicing.",
    });

    const archive = await service.generateProjectOutputPack(project.id);
    expect(archive.fileName).toBe("ai-implementation-system.zip");
    expect(archive.contentType).toBe("application/zip");
    expect(archive.bytes.length).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(archive.bytes);
    const requiredFiles = [
      "PROJECT_OVERVIEW.md",
      "AGENTS.md",
      "README.md",
      "plans/authentication.md",
      "tasks/001-bootstrap-repo.md",
      "tasks/010-status-and-governance.md",
      "decisions/002-use-task-driven-execution.md",
      "specs/api-contracts.md",
      "specs/data-entities.md",
      "status/current-status.md",
      "templates/status-template.md",
    ];
    for (const file of requiredFiles) {
      expect(zip.file(file), `${file} should exist in output pack`).toBeTruthy();
      const content = await zip.file(file)?.async("string");
      expect(content?.trim().length ?? 0).toBeGreaterThan(0);
    }

    const overview = await zip.file("PROJECT_OVERVIEW.md")?.async("string");
    expect(overview).toContain(project.name);
    expect(overview).toContain("source of truth");
  });

  it("logs decisions from pillar chat turns only when a decision is detected", async () => {
    const repositoryRoot = await createTempRepositoryRoot();
    const store = new ProjectStore(repositoryRoot);
    const service = new OrchestrationService({
      projectStore: store,
      resolveRetrievalService: async () => createStubRetrievalService(),
    });
    const project = await service.initializeProject({
      ideaText: "A booking app for local tutoring teams.",
    });

    const exploratoryTurn = await service.processPillarChatTurn(project.id, "Security", {
      message: "How should we think about authentication for this app?",
    });
    expect(exploratoryTurn.decisionLogged).toBe(false);
    expect(exploratoryTurn.project.decisions.length).toBe(0);

    const decisionTurn = await service.processPillarChatTurn(project.id, "Security", {
      message:
        "We'll use Microsoft Entra ID with least-privilege RBAC and managed identity for service-to-service access.",
    });
    expect(decisionTurn.decisionLogged).toBe(true);
    expect(decisionTurn.decision).toBeTruthy();
    expect(decisionTurn.project.decisions.length).toBe(1);
    expect(decisionTurn.project.decisions[0]?.pillar).toBe("Security");
  });

  it("infers and exposes ad-hoc pillars from new requirement domains", async () => {
    const repositoryRoot = await createTempRepositoryRoot();
    const store = new ProjectStore(repositoryRoot);
    const service = new OrchestrationService({
      projectStore: store,
      resolveRetrievalService: async () => createStubRetrievalService(),
    });
    const project = await service.initializeProject({
      ideaText:
        "A tutoring marketplace with Stripe checkout and subscription billing.",
    });

    const initialPillars = await service.listProjectPillars(project.id);
    expect(
      initialPillars.some((pillar) => pillar.name === "Payments & Billing"),
    ).toBe(true);

    const turn = await service.processPillarChatTurn(
      project.id,
      "Payments & Billing",
      {
        message:
          "We'll use Stripe Checkout with webhook verification and idempotency keys for charge handling.",
      },
    );
    expect(turn.decisionLogged).toBe(true);
    expect(turn.pillar).toBe("Payments & Billing");
  });
});
