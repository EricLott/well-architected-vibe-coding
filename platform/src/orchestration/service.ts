import { shortHash } from "../shared/hash.js";
import type { RetrievalService } from "../retrieval/index.js";
import type {
  AssistantGuideRequest,
  AssistantGuideResponse,
  ConflictAnalysisResponse,
  DecisionGraph,
  DecisionItem,
  DecisionLink,
  GeneratedOutputs,
  InitializeProjectRequest,
  PillarGuidanceResponse,
  PillarName,
  PillarQuestion,
  ProjectRecord,
  UpdateDecisionGraphRequest,
  RetrievalResult,
} from "../shared/types.js";
import { generateAssistantGuidance } from "./assistant.js";
import { analyzeCrossPillarConflicts } from "./cross_pillar_reasoning.js";
import { buildDecisionGraph } from "./decision_graph.js";
import { generateOutputs } from "./output_generator.js";
import { getPillarFilterValue } from "./pillars.js";
import { ProjectStore } from "../storage/project_store.js";

type RetrievalServiceResolver = () => Promise<RetrievalService | null>;

interface PillarQuestionTemplate {
  why: string;
  risk: string;
  defaultOption: string;
  fallbackQuestions: string[];
}

const pillarQuestionTemplates: Record<PillarName, PillarQuestionTemplate> = {
  Reliability: {
    why: "Reliability decisions define whether critical workflows continue during failures and recover without data loss.",
    risk: "Skipping reliability design can cause avoidable downtime, failed transactions, and slow recovery during incidents.",
    defaultOption:
      "Start with retry patterns, health checks, graceful degradation, and a documented recovery runbook.",
    fallbackQuestions: [
      "Which workflow must stay available during dependency or regional failures?",
      "What recovery time and recovery point objectives should guide architecture?",
      "Where do we need graceful degradation to keep user-facing outcomes intact?",
    ],
  },
  Security: {
    why: "Security decisions establish trust boundaries for identities, data, and operational access early in the lifecycle.",
    risk: "Skipping security architecture often leads to privilege sprawl, weak data protection, and expensive remediation later.",
    defaultOption:
      "Begin with least-privilege access, managed identity, and centralized secret/key management.",
    fallbackQuestions: [
      "What authentication and authorization model best matches user and admin roles?",
      "How will sensitive data be classified, encrypted, and audited end-to-end?",
      "Where should security checks be enforced in the request and deployment paths?",
    ],
  },
  "Cost Optimization": {
    why: "Cost decisions shape long-term sustainability and help avoid architecture choices that are operationally expensive at scale.",
    risk: "Ignoring cost architecture can produce uncontrolled spend, over-provisioning, and delayed delivery due to budget shocks.",
    defaultOption:
      "Start with usage estimates, right-sized baselines, and cost visibility in deployment and operations.",
    fallbackQuestions: [
      "Which components are likely to drive the largest recurring cost?",
      "What scaling model prevents over-provisioning while preserving service quality?",
      "Which cost guardrails and alerts should be mandatory before production?",
    ],
  },
  "Operational Excellence": {
    why: "Operational excellence ensures the system can be observed, changed safely, and improved continuously by the team.",
    risk: "Without operational discipline, release risk grows, incident response slows down, and knowledge becomes fragmented.",
    defaultOption:
      "Start with deployment standards, actionable telemetry, and clear ownership for each workload area.",
    fallbackQuestions: [
      "What operational metrics should signal system health and business success?",
      "How will deployments and rollbacks be tested and executed safely?",
      "Which runbooks are needed to reduce mean time to detect and recover?",
    ],
  },
  "Performance Efficiency": {
    why: "Performance choices set user experience expectations and ensure the system can scale to expected demand.",
    risk: "Skipping performance design can cause latency regressions, capacity bottlenecks, and emergency scaling costs.",
    defaultOption:
      "Start with SLO-driven performance targets and plan caching, queuing, and autoscaling boundaries.",
    fallbackQuestions: [
      "What latency and throughput targets define acceptable user experience?",
      "Which components are most likely to become bottlenecks first?",
      "How will performance baselines and load tests be validated before release?",
    ],
  },
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureNonEmptyIdea(ideaText: string): string {
  const normalized = normalizeText(ideaText);
  if (!normalized) {
    throw new Error("Please enter an idea before starting intake.");
  }
  return normalized;
}

function deriveProjectName(ideaText: string): string {
  const withoutPunctuation = ideaText.replace(/[^\w\s-]/g, " ");
  const words = withoutPunctuation.split(" ").filter(Boolean).slice(0, 6);
  if (words.length === 0) {
    return "Untitled architecture project";
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferMissingAreas(ideaText: string): string[] {
  const normalized = ideaText.toLowerCase();
  const missing: string[] = [];

  if (!normalized.includes("user") && !normalized.includes("customer")) {
    missing.push("Clarify primary user personas and user journeys");
  }
  if (!normalized.includes("integrat") && !normalized.includes("api")) {
    missing.push("List external systems and integration dependencies");
  }
  if (!normalized.includes("security") && !normalized.includes("auth")) {
    missing.push("Define authentication and authorization expectations");
  }
  if (!normalized.includes("scale") && !normalized.includes("growth")) {
    missing.push("Set expected scale, growth profile, and performance targets");
  }
  if (!normalized.includes("budget") && !normalized.includes("cost")) {
    missing.push("Capture budget guardrails and cost sensitivity");
  }
  if (missing.length < 4) {
    missing.push("Define compliance, privacy, and data retention boundaries");
  }

  return missing.slice(0, 5);
}

function inferOpenQuestions(ideaText: string): string[] {
  const normalized = ideaText.toLowerCase();
  const openQuestions = [
    "What reliability target and recovery objective should guide architecture choices?",
    "What security model is required for identities, roles, and data protection?",
    "What latency, throughput, and usage growth should Phase 1 support?",
    "What operating budget and team capacity constraints must be respected?",
  ];

  if (!normalized.includes("mobile")) {
    openQuestions.push("Will this be web-only, mobile-first, or multi-channel?");
  }

  return openQuestions;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function extractHeadingLabel(result: RetrievalResult): string {
  const heading = result.citation.heading_path
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" > ");
  if (heading) {
    return heading;
  }
  return result.citation.title;
}

function buildGuidanceQuestions(
  pillar: PillarName,
  guidance: RetrievalResult[],
): PillarQuestion[] {
  const template = pillarQuestionTemplates[pillar];
  const questionsFromGuidance = guidance.slice(0, 3).map((result, index) => {
    const headingLabel = extractHeadingLabel(result);
    return {
      id: `question-${pillar.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
      pillar,
      question: `How should "${headingLabel}" shape the architecture for this project?`,
      whyItMatters: template.why,
      riskIfIgnored: template.risk,
      suggestedDefault: template.defaultOption,
    };
  });

  if (questionsFromGuidance.length > 0) {
    return questionsFromGuidance;
  }

  return template.fallbackQuestions.slice(0, 3).map((question, index) => ({
    id: `question-${pillar.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
    pillar,
    question,
    whyItMatters: template.why,
    riskIfIgnored: template.risk,
    suggestedDefault: template.defaultOption,
  }));
}

function validateDecision(decision: DecisionItem): void {
  if (!decision.id.trim()) {
    throw new Error("Decision id is required.");
  }
  if (!decision.title.trim()) {
    throw new Error("Decision title is required.");
  }
  if (!decision.selectedOption.trim()) {
    throw new Error("Decision selected option is required.");
  }
  if (!decision.rationale.trim()) {
    throw new Error("Decision rationale is required.");
  }
}

function validateDecisionLink(link: DecisionLink): void {
  if (!link.id.trim()) {
    throw new Error("Decision link id is required.");
  }
  if (!link.fromDecisionId.trim() || !link.toDecisionId.trim()) {
    throw new Error("Decision link source and target are required.");
  }
  if (link.fromDecisionId === link.toDecisionId) {
    throw new Error("Decision links must connect two different decisions.");
  }
}

export class OrchestrationService {
  private readonly projectStore: ProjectStore;

  private readonly resolveRetrievalService: RetrievalServiceResolver;

  constructor(options: {
    projectStore: ProjectStore;
    resolveRetrievalService: RetrievalServiceResolver;
  }) {
    this.projectStore = options.projectStore;
    this.resolveRetrievalService = options.resolveRetrievalService;
  }

  public async initializeProject(
    request: InitializeProjectRequest,
  ): Promise<ProjectRecord> {
    const ideaText = ensureNonEmptyIdea(request.ideaText ?? "");
    const retrieval = await this.resolveRetrievalService();
    const retrievedGuidance = retrieval
      ? retrieval.retrieve({
          query: `architecture planning for ${ideaText}`,
          topK: 3,
        }).results
      : [];

    const guidanceQuestions = dedupe(
      retrievedGuidance
        .map((result) => extractHeadingLabel(result))
        .map((heading) => `How will "${heading}" influence your first architecture decisions?`),
    ).slice(0, 3);

    const now = new Date().toISOString();
    const projectId = `project-${shortHash(`${now}:${ideaText}`, 16)}`;
    const project: ProjectRecord = {
      id: projectId,
      name: deriveProjectName(ideaText),
      ideaText,
      ideaSummary: `You want to build: ${ideaText}`,
      currentFocus: "Pillar-guided exploration (security and reliability first)",
      inferredMissingAreas: inferMissingAreas(ideaText),
      risks: [
        "Skipping architecture intake can create hidden security and reliability debt.",
        "Unclear scope can increase rework during implementation and testing.",
      ],
      suggestedOpenQuestions: inferOpenQuestions(ideaText),
      discoveryQuestions:
        guidanceQuestions.length > 0
          ? guidanceQuestions
          : [
              "Which user workflow must succeed even during degraded conditions?",
              "What identity and access model best fits your user and admin boundaries?",
              "Where should we place guardrails to balance cost, performance, and reliability?",
            ],
      recommendedNextAction:
        "Confirm user personas and non-functional priorities, then move to a security-focused decision pass.",
      decisions: [],
      decisionLinks: [],
      createdAt: now,
      updatedAt: now,
    };

    return this.projectStore.upsertProject(project);
  }

  public async listProjects(): Promise<ProjectRecord[]> {
    return this.projectStore.listProjects();
  }

  public async getProject(projectId: string): Promise<ProjectRecord | null> {
    return this.projectStore.getProject(projectId);
  }

  public async replaceProjectDecisions(
    projectId: string,
    decisions: DecisionItem[],
  ): Promise<ProjectRecord | null> {
    for (const decision of decisions) {
      validateDecision(decision);
    }
    return this.projectStore.replaceProjectDecisions(projectId, decisions);
  }

  public async getDecisionGraph(projectId: string): Promise<DecisionGraph | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) {
      return null;
    }
    return buildDecisionGraph(project.decisions, project.decisionLinks ?? []);
  }

  public async replaceDecisionGraph(
    projectId: string,
    request: UpdateDecisionGraphRequest,
  ): Promise<{ project: ProjectRecord; graph: DecisionGraph } | null> {
    for (const decision of request.decisions ?? []) {
      validateDecision(decision);
    }
    for (const link of request.links ?? []) {
      validateDecisionLink(link);
    }

    const updated = await this.projectStore.replaceDecisionGraph(
      projectId,
      request.decisions ?? [],
      request.links ?? [],
    );
    if (!updated) {
      return null;
    }

    return {
      project: updated,
      graph: buildDecisionGraph(updated.decisions, updated.decisionLinks ?? []),
    };
  }

  public async analyzeProjectConflicts(
    projectId: string,
  ): Promise<ConflictAnalysisResponse> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    const retrieval = await this.resolveRetrievalService();
    return analyzeCrossPillarConflicts(
      project,
      project.decisions,
      project.decisionLinks ?? [],
      retrieval,
    );
  }

  public async generateProjectOutputs(projectId: string): Promise<GeneratedOutputs> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    const retrieval = await this.resolveRetrievalService();
    const conflicts = await analyzeCrossPillarConflicts(
      project,
      project.decisions,
      project.decisionLinks ?? [],
      retrieval,
    );
    return generateOutputs(project, conflicts);
  }

  public async generatePillarGuidance(
    projectId: string,
    pillar: PillarName,
  ): Promise<PillarGuidanceResponse> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const retrieval = await this.resolveRetrievalService();
    if (!retrieval) {
      throw new Error("Retrieval index is not ready. Run ingestion first.");
    }

    const retrievedGuidance = retrieval.retrieve({
      query: `${project.ideaText} ${pillar.toLowerCase()} architecture guidance`,
      filters: {
        pillar: [getPillarFilterValue(pillar)],
      },
      topK: 4,
    }).results;

    const template = pillarQuestionTemplates[pillar];
    return {
      projectId: project.id,
      pillar,
      recommendedFocus: template.defaultOption,
      questions: buildGuidanceQuestions(pillar, retrievedGuidance),
      retrievedGuidance,
    };
  }

  public async guideAssistant(
    request: AssistantGuideRequest,
  ): Promise<AssistantGuideResponse> {
    const project = request.projectId
      ? await this.projectStore.getProject(request.projectId)
      : null;
    if (request.projectId && !project) {
      throw new Error("Project not found.");
    }

    const retrieval = await this.resolveRetrievalService();
    return generateAssistantGuidance({
      request,
      project,
      retrievalService: retrieval,
    });
  }
}
