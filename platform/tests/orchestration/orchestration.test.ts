import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
});
