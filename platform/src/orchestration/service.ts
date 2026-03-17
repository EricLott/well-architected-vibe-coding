import { shortHash } from "../shared/hash.js";
import type { RetrievalService } from "../retrieval/index.js";
import type {
  AssistantGuideRequest,
  AssistantGuideResponse,
  ConflictAnalysisResponse,
  DecisionGraph,
  DecisionStatus,
  DecisionItem,
  DecisionLink,
  GenerateOutputPackRequest,
  GeneratedOutputs,
  InitializeProjectRequest,
  PillarChatTurnRequest,
  PillarChatTurnResponse,
  PillarDefinition,
  PillarGuidanceResponse,
  PillarName,
  PillarQuestion,
  ProjectRecord,
  UpdateDecisionGraphRequest,
  RetrievalResult,
} from "../shared/types.js";
import {
  assessDecisionCandidate,
  generateAssistantGuidance,
} from "./assistant.js";
import { analyzeCrossPillarConflicts } from "./cross_pillar_reasoning.js";
import { buildDecisionGraph } from "./decision_graph.js";
import {
  generateOutputPackArchive,
  type OutputPackArchive,
} from "./output_pack_generator.js";
import { generateOutputs } from "./output_generator.js";
import {
  buildPillarQueryHint,
  getPillarFilterValue,
  inferAdHocPillarsFromText,
  mergePillarDefinitions,
  getPillarDefinition,
} from "./pillars.js";
import { ProjectStore } from "../storage/project_store.js";

type RetrievalServiceResolver = () => Promise<RetrievalService | null>;

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

function dedupePillarDefinitions(
  pillars: PillarDefinition[],
): PillarDefinition[] {
  const bySlug = new Map<string, PillarDefinition>();
  for (const pillar of pillars) {
    bySlug.set(pillar.slug, pillar);
  }
  return [...bySlug.values()];
}

function adHocPillarsForProject(project: ProjectRecord): PillarDefinition[] {
  return (project.additionalPillars ?? []).filter(
    (pillar) => pillar.category === "ad-hoc",
  );
}

function normalizeKey(value: string): string {
  return normalizeText(value).toLowerCase();
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

function firstSentence(value: string): string {
  const normalized = normalizeText(value).replace(/[#>*`]/g, "");
  if (!normalized) {
    return "";
  }
  const first = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return first.slice(0, 240);
}

function summarizeContent(value: string): string {
  const sentence = firstSentence(value);
  if (sentence) {
    return sentence;
  }
  return normalizeText(value).slice(0, 200);
}

function guidanceFocusLabel(result: RetrievalResult): string {
  const parts = result.citation.heading_path
    .map((part) => normalizeText(part))
    .filter(Boolean);
  const focus = parts[parts.length - 1] ?? "";
  return focus || normalizeText(result.citation.title);
}

function startsWithQuestionPhrase(value: string): boolean {
  return /^(what|why|how|should|can|could|would|do|does|is|are|when|where|which)\b/i.test(
    value,
  );
}

function isDeveloperExperiencePillar(pillar: PillarName): boolean {
  const normalized = normalizeText(pillar).toLowerCase();
  return (
    normalized.includes("developer experience") ||
    normalized.includes("(dx)") ||
    normalized.endsWith(" dx")
  );
}

function pillarStarterNudges(pillar: PillarName): string[] {
  if (!isDeveloperExperiencePillar(pillar)) {
    return [];
  }
  return [
    "Set up a GitHub Actions workflow that runs lint, type checks, and tests on every pull request.",
    "Protect the main branch with required status checks, at least one reviewer, and no direct pushes.",
    "Add a pull request template and CODEOWNERS so architecture-sensitive changes always get the right reviewers.",
  ];
}

function toActionNudge(value: string, pillar: PillarName): string {
  const normalized = normalizeText(value).replace(/[?]+$/g, "").trim();
  if (!normalized) {
    return `Capture one concrete ${pillar} implementation decision and rationale.`;
  }

  const approachMatch = normalized.match(
    /^what(?:'s| is)\s+your\s+approach\s+to\s+(.+)$/i,
  );
  if (approachMatch) {
    return `Define your implementation approach for ${approachMatch[1]} and capture one explicit tradeoff.`;
  }

  const howWillMatch = normalized.match(/^how\s+will\s+you\s+(.+)$/i);
  if (howWillMatch) {
    return `Define how you'll ${howWillMatch[1]} and capture the owner and rollout plan.`;
  }

  if (startsWithQuestionPhrase(normalized)) {
    if (isDeveloperExperiencePillar(pillar)) {
      return pillarStarterNudges(pillar)[0];
    }
    return `Define one concrete ${pillar} implementation decision and capture its tradeoffs.`;
  }

  if (/[.!]$/.test(normalized)) {
    return normalized;
  }
  return `${normalized}.`;
}

function guidanceNudge(pillar: PillarName, result: RetrievalResult): string {
  if (isDeveloperExperiencePillar(pillar)) {
    const keywordPool = `${extractHeadingLabel(result)} ${result.content}`.toLowerCase();
    if (keywordPool.includes("automation")) {
      return "Add GitHub Actions checks for lint, tests, and build validation on every pull request.";
    }
    if (
      keywordPool.includes("local environment") ||
      keywordPool.includes("development environment") ||
      keywordPool.includes("container")
    ) {
      return "Standardize local development with a devcontainer or bootstrap script to keep onboarding friction low.";
    }
    if (
      keywordPool.includes("security") ||
      keywordPool.includes("secret") ||
      keywordPool.includes("vulnerability")
    ) {
      return "Run secret scanning and dependency vulnerability checks as required pull request gates.";
    }
    if (keywordPool.includes("coding practices") || keywordPool.includes("standards")) {
      return "Enforce coding standards with linting, formatting, and pre-commit hooks in CI.";
    }
    return "Define branch strategy, pull request gates, and CI checks so developer workflows stay fast and predictable.";
  }

  return `Capture one concrete implementation decision for ${guidanceFocusLabel(result)} and record the tradeoff.`;
}

function deriveRecommendedFocus(
  pillar: PillarName,
  guidance: RetrievalResult[],
): string {
  const topGuidance = guidance[0];
  if (!topGuidance) {
    return `Grounding is limited for ${pillar}. Clarify constraints first, then capture a proposed approach with explicit risks.`;
  }
  const heading = extractHeadingLabel(topGuidance);
  const evidence = summarizeContent(topGuidance.content);
  if (!evidence) {
    return `Use "${heading}" as the first focus area for this pillar pass.`;
  }
  return `${heading}: ${evidence}`;
}

function buildGuidanceQuestions(
  pillar: PillarName,
  guidance: RetrievalResult[],
  project: ProjectRecord,
): PillarQuestion[] {
  const starterNudges = pillarStarterNudges(pillar).slice(0, 2).map((nudge) => ({
    question: toActionNudge(nudge, pillar),
    whyItMatters:
      "Concrete implementation nudges keep this pillar discussion practical and execution-ready.",
    riskIfIgnored:
      "Staying abstract can delay decisions and increase rework during delivery.",
    suggestedDefault: null,
  }));

  const questionsFromGuidance = guidance.slice(0, 3).map((result) => {
    const headingLabel = extractHeadingLabel(result);
    const evidence = summarizeContent(result.content);
    return {
      question: toActionNudge(guidanceNudge(pillar, result), pillar),
      whyItMatters:
        evidence ||
        `This topic appears in retrieved framework guidance for ${headingLabel}.`,
      riskIfIgnored: `Leaving ${headingLabel} unresolved can introduce avoidable architectural risk and rework.`,
      suggestedDefault: evidence ? `Start with: ${evidence}` : null,
    };
  });

  const combined = dedupe(
    [...starterNudges, ...questionsFromGuidance].map((item) => item.question),
  ).map((question) => {
    const match =
      [...starterNudges, ...questionsFromGuidance].find(
        (item) => normalizeText(item.question).toLowerCase() === question.toLowerCase(),
      ) ?? starterNudges[0];
    return {
      question,
      whyItMatters: match?.whyItMatters ?? "",
      riskIfIgnored: match?.riskIfIgnored ?? "",
      suggestedDefault: match?.suggestedDefault ?? null,
    };
  });

  if (combined.length > 0) {
    return combined.slice(0, 4).map((question, index) => ({
      ...question,
      id: `question-${pillar.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
      pillar,
    }));
  }

  return [
    {
      question: toActionNudge(
        `Define the initial ${pillar} approach for this project and document one implementation tradeoff.`,
        pillar,
      ),
      whyItMatters: `A clear ${pillar.toLowerCase()} approach keeps implementation aligned with architecture intent.`,
      riskIfIgnored:
        "Skipping this decision can create conflicting assumptions and late-stage redesign.",
      suggestedDefault: `Start from the project context: ${project.ideaText.slice(0, 160)}.`,
    },
    {
      question: toActionNudge(
        `Choose the first ${pillar.toLowerCase()} tradeoff to accept and document why.`,
        pillar,
      ),
      whyItMatters:
        "Explicit tradeoffs make constraints visible and avoid hidden design debt.",
      riskIfIgnored:
        "Unstated tradeoffs often create cross-pillar conflicts during delivery.",
      suggestedDefault: null,
    },
  ].map((question, index) => ({
    ...question,
    id: `question-${pillar.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
    pillar,
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

  private async refreshProjectAdHocPillars(
    project: ProjectRecord,
    signalText?: string,
  ): Promise<ProjectRecord> {
    const inferred = inferAdHocPillarsFromText(
      [project.ideaText, signalText ?? ""].filter(Boolean).join(" "),
    );
    const mergedAdHoc = dedupePillarDefinitions([
      ...adHocPillarsForProject(project),
      ...inferred,
    ]);
    const previousSlugs = adHocPillarsForProject(project)
      .map((pillar) => pillar.slug)
      .sort();
    const nextSlugs = mergedAdHoc.map((pillar) => pillar.slug).sort();
    if (previousSlugs.join("|") === nextSlugs.join("|")) {
      return project;
    }

    const persisted = await this.projectStore.upsertProject({
      ...project,
      additionalPillars: mergedAdHoc,
      updatedAt: new Date().toISOString(),
    });
    return persisted;
  }

  private async ensureProjectHasPillar(
    project: ProjectRecord,
    pillar: PillarName,
  ): Promise<ProjectRecord> {
    const known = mergePillarDefinitions(project.additionalPillars ?? []).some(
      (item) => normalizeKey(item.name) === normalizeKey(pillar),
    );
    if (known) {
      return project;
    }

    const derived = getPillarDefinition(pillar);
    if (derived.category !== "ad-hoc") {
      return project;
    }

    const persisted = await this.projectStore.upsertProject({
      ...project,
      additionalPillars: dedupePillarDefinitions([
        ...adHocPillarsForProject(project),
        {
          ...derived,
          category: "ad-hoc",
        },
      ]),
      updatedAt: new Date().toISOString(),
    });
    return persisted;
  }

  public async listProjectPillars(projectId: string): Promise<PillarDefinition[]> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    const refreshed = await this.refreshProjectAdHocPillars(project);
    return mergePillarDefinitions(refreshed.additionalPillars ?? []);
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
    const inferredAdHocPillars = inferAdHocPillarsFromText(ideaText);
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
      additionalPillars: inferredAdHocPillars,
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

  public async generateProjectOutputPack(
    projectId: string,
    request?: GenerateOutputPackRequest,
  ): Promise<OutputPackArchive> {
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
    return generateOutputPackArchive({
      project,
      conflicts,
      providerConfig: request?.providerConfig,
    });
  }

  public async generatePillarGuidance(
    projectId: string,
    pillar: PillarName,
  ): Promise<PillarGuidanceResponse> {
    const existingProject = await this.projectStore.getProject(projectId);
    if (!existingProject) {
      throw new Error("Project not found.");
    }
    const refreshedProject = await this.refreshProjectAdHocPillars(existingProject);
    const project = await this.ensureProjectHasPillar(refreshedProject, pillar);

    const retrieval = await this.resolveRetrievalService();
    if (!retrieval) {
      throw new Error("Retrieval index is not ready. Run ingestion first.");
    }

    const pillarFilter = getPillarFilterValue(pillar);
    const retrievedGuidance = retrieval.retrieve({
      query: `${project.ideaText} ${buildPillarQueryHint(pillar)}`,
      filters: pillarFilter
        ? {
            pillar: [pillarFilter],
          }
        : undefined,
      topK: 4,
    }).results;

    return {
      projectId: project.id,
      pillar,
      recommendedFocus: deriveRecommendedFocus(pillar, retrievedGuidance),
      questions: buildGuidanceQuestions(pillar, retrievedGuidance, project),
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

  public async processPillarChatTurn(
    projectId: string,
    pillar: PillarName,
    request: PillarChatTurnRequest,
  ): Promise<PillarChatTurnResponse> {
    const existingProject = await this.projectStore.getProject(projectId);
    if (!existingProject) {
      throw new Error("Project not found.");
    }

    const userMessage = normalizeText(request.message ?? "");
    if (!userMessage) {
      throw new Error("message is required.");
    }
    const previousAdHocSlugs = new Set(
      adHocPillarsForProject(existingProject).map((item) => item.slug),
    );
    const refreshedProject = await this.refreshProjectAdHocPillars(
      existingProject,
      userMessage,
    );
    let project = await this.ensureProjectHasPillar(refreshedProject, pillar);
    const newlyInferredPillars = adHocPillarsForProject(project).filter(
      (item) => !previousAdHocSlugs.has(item.slug),
    );

    const guideRequest: AssistantGuideRequest = {
      projectId,
      phase: "pillar-guided-chat",
      userMessage,
      pillar,
      providerConfig: request.providerConfig,
    };
    const retrieval = await this.resolveRetrievalService();
    let guidance = await generateAssistantGuidance({
      request: guideRequest,
      project,
      retrievalService: retrieval,
    });
    if (guidance.retrievedGuidance.length === 0 && !guidance.warning) {
      guidance = {
        ...guidance,
        warning:
          `Grounding for ${pillar} is weak. Capture this as proposed only and validate with additional source guidance before confirming.`,
      };
    }
    if (newlyInferredPillars.length > 0) {
      const names = newlyInferredPillars.map((item) => item.name).join(", ");
      guidance = {
        ...guidance,
        nextActions: dedupe([
          `New pillar identified: ${names}. Address it before implementation to avoid architecture drift.`,
          ...guidance.nextActions,
        ]).slice(0, 6),
        warning:
          guidance.warning ??
          `Additional requirements detected (${names}).`,
      };
    }

    let decisionAssessment = await assessDecisionCandidate({
      request: guideRequest,
      project,
      retrievedGuidance: guidance.retrievedGuidance,
    });
    const hasGrounding = guidance.retrievedGuidance.length > 0;
    if (!request.forceDecisionCapture && !hasGrounding && decisionAssessment.isDecision) {
      decisionAssessment = {
        ...decisionAssessment,
        isDecision: false,
        reason: `${decisionAssessment.reason} Auto-capture skipped because grounding is weak for this pillar.`,
      };
    }

    const shouldLogDecision =
      request.forceDecisionCapture ||
      (hasGrounding &&
        decisionAssessment.isDecision &&
        decisionAssessment.confidence >= 0.55);

    let updatedProject = project;
    let loggedDecision: DecisionItem | null = null;

    if (shouldLogDecision) {
      const title = normalizeText(
        decisionAssessment.title ?? `${pillar} approach`,
      );
      const selectedOption = normalizeText(
        decisionAssessment.selectedOption ?? userMessage,
      );
      const status: DecisionStatus =
        request.forceDecisionCapture || decisionAssessment.confidence < 0.8
          ? "proposed"
          : "confirmed";
      const rationale = normalizeText(
        decisionAssessment.rationale ||
          guidance.summary ||
          `Captured from ${pillar} guided chat.`,
      );
      const risks = dedupe([
        ...decisionAssessment.risks,
        ...guidance.questions.map((item) => item.riskIfIgnored),
      ]).slice(0, 3);

      const existingDecision = project.decisions.find(
        (item) => item.pillar === pillar && normalizeKey(item.title) === normalizeKey(title),
      );

      const decision: DecisionItem = {
        id:
          existingDecision?.id ??
          `decision-${pillar.toLowerCase().replace(/\s+/g, "-")}-${shortHash(`${title}:${selectedOption}`, 8)}`,
        title,
        description: `Captured from ${pillar} guided chat.`,
        selectedOption,
        status,
        pillar,
        rationale,
        risks,
        relatedDecisionIds: existingDecision?.relatedDecisionIds ?? [],
      };

      const updatedDecisions = existingDecision
        ? project.decisions.map((item) =>
            item.id === existingDecision.id
              ? {
                  ...item,
                  title: decision.title,
                  description: decision.description,
                  selectedOption: decision.selectedOption,
                  status: decision.status,
                  rationale: decision.rationale,
                  risks: decision.risks,
                }
              : item,
          )
        : [...project.decisions, decision];

      const persisted = await this.projectStore.replaceProjectDecisions(
        projectId,
        updatedDecisions,
      );
      if (!persisted) {
        throw new Error("Project not found.");
      }
      updatedProject = persisted;
      loggedDecision = decision;
    }

    return {
      project: updatedProject,
      pillar,
      guidance,
      decisionLogged: Boolean(loggedDecision),
      decision: loggedDecision,
      decisionAssessment,
    };
  }
}
