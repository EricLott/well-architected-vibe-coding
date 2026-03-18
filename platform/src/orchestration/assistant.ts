import type { RetrievalService } from "../retrieval/index.js";
import type {
  AiProvider,
  AssistantGuideQuestion,
  AssistantGuideRequest,
  AssistantGuideResponse,
  AssistantProviderConfig,
  DecisionAssessment,
  ProjectRecord,
  RetrievalResult,
} from "../shared/types.js";
import { getPillarFilterValue } from "./pillars.js";

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildFallbackSummary(
  request: AssistantGuideRequest,
  project: ProjectRecord | null,
): string {
  if (request.pillar) {
    return `Focus on ${request.pillar}. Capture one concrete decision and rationale grounded in retrieved guidance.`;
  }
  if (!project) {
    return "Start with a clear 2-4 sentence idea so intake can infer architecture shape and unknowns.";
  }
  if (request.phase.includes("pillar")) {
    return `Focus this pass on ${project.currentFocus}. Capture decisions with explicit tradeoffs and dependencies.`;
  }
  if (request.phase.includes("risk")) {
    return "Resolve high-severity cross-pillar conflicts before exporting prompt packs.";
  }
  if (request.phase.includes("output")) {
    return "Verify unresolved decisions and conflict status before generating execution prompts.";
  }
  return project.recommendedNextAction;
}

function normalizeSentence(value: string): string {
  return normalize(value)
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ");
}

function firstSentence(value: string): string {
  const normalized = normalizeSentence(value);
  if (!normalized) {
    return "";
  }
  const first = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return first.slice(0, 220);
}

function headingLabel(item: RetrievalResult): string {
  const heading = item.citation.heading_path
    .map((part) => normalize(part))
    .filter(Boolean)
    .join(" > ");
  return heading || item.citation.title;
}

function guidanceFocusLabel(item: RetrievalResult): string {
  const parts = item.citation.heading_path
    .map((part) => normalize(part))
    .filter(Boolean);
  const focus = parts[parts.length - 1] ?? "";
  return focus || normalize(item.citation.title);
}

function isDeveloperExperiencePillar(
  pillar?: AssistantGuideRequest["pillar"],
): boolean {
  const normalized = normalize(pillar ?? "").toLowerCase();
  return (
    normalized.includes("developer experience") ||
    normalized.includes("(dx)") ||
    normalized.endsWith(" dx")
  );
}

function developerExperienceStarterNudges(): string[] {
  return [
    "Set up a GitHub Actions workflow that runs lint, type checks, and tests on every pull request.",
    "Protect the main branch with required status checks, at least one reviewer, and no direct pushes.",
    "Add a pull request template and CODEOWNERS so architecture-sensitive changes always get the right reviewers.",
    "Automate local setup with a devcontainer or bootstrap script so new contributors can start in one command.",
    "Document branch naming, commit conventions, and merge rules in CONTRIBUTING.md and enforce them in CI.",
  ];
}

function pillarStarterNudges(pillar?: AssistantGuideRequest["pillar"]): string[] {
  if (isDeveloperExperiencePillar(pillar)) {
    return developerExperienceStarterNudges();
  }
  return [];
}

function toActionNudge(
  value: string,
  pillar?: AssistantGuideRequest["pillar"],
): string {
  const normalized = normalize(value).replace(/[?]+$/g, "").trim();
  if (!normalized) {
    return pillar
      ? `Capture one concrete ${pillar} decision and rationale.`
      : "Capture one concrete architecture decision and rationale.";
  }

  const approachMatch = normalized.match(
    /^what(?:'s| is)\s+your\s+approach\s+to\s+(.+)$/i,
  );
  if (approachMatch) {
    return `Define your implementation approach for ${approachMatch[1]} and capture one explicit tradeoff.`;
  }

  const nextDecisionMatch = normalized.match(
    /^what(?:'s| is)\s+the\s+next\s+architecture\s+decision\s+you\s+should\s+make$/i,
  );
  if (nextDecisionMatch) {
    return "Capture the next architecture decision and include rationale and risks.";
  }

  const howWillMatch = normalized.match(/^how\s+will\s+you\s+(.+)$/i);
  if (howWillMatch) {
    return `Define how you'll ${howWillMatch[1]} and capture the owner and rollout plan.`;
  }

  const whichMatch = normalized.match(/^which\s+(.+)$/i);
  if (whichMatch) {
    return `Choose ${whichMatch[1]} and document the tradeoff.`;
  }

  if (startsWithQuestionPhrase(normalized)) {
    if (isDeveloperExperiencePillar(pillar)) {
      return developerExperienceStarterNudges()[0];
    }
    return pillar
      ? `Define one concrete ${pillar} implementation decision and capture its tradeoffs.`
      : "Define one concrete architecture implementation decision and capture its tradeoffs.";
  }

  if (/[.!]$/.test(normalized)) {
    return normalized;
  }
  return `${normalized}.`;
}

function guidanceNudgeFromItem(
  item: RetrievalResult,
  pillar?: AssistantGuideRequest["pillar"],
): string {
  if (isDeveloperExperiencePillar(pillar)) {
    const keywordPool = `${headingLabel(item)} ${item.content}`.toLowerCase();
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
    if (
      keywordPool.includes("version-control") ||
      keywordPool.includes("change management")
    ) {
      return "Use short-lived branches and require PR reviews before merge to keep change control lightweight and safe.";
    }
    return "Define branch strategy, pull request gates, and CI checks so developer workflows stay fast and predictable.";
  }

  const focus = guidanceFocusLabel(item);
  const pillarPhrase = pillar ? ` for ${pillar}` : "";
  return `Capture one concrete implementation decision for ${focus}${pillarPhrase} and record the tradeoff.`;
}

function dedupeGuideQuestions(values: AssistantGuideQuestion[]): AssistantGuideQuestion[] {
  const seen = new Set<string>();
  const result: AssistantGuideQuestion[] = [];
  for (const value of values) {
    const key = normalize(value.question).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function extractQuestionsFromGuidance(
  guidance: RetrievalResult[],
  pillar?: AssistantGuideRequest["pillar"],
): AssistantGuideQuestion[] {
  return guidance.slice(0, 3).map((item) => {
    const heading = headingLabel(item);
    const why = firstSentence(item.content);
    return {
      question: toActionNudge(guidanceNudgeFromItem(item, pillar), pillar),
      whyItMatters:
        why || `This guidance area is highlighted in the retrieved framework content for ${heading}.`,
      riskIfIgnored: `Leaving ${heading} unresolved can create avoidable architectural risk and later rework.`,
    };
  });
}

function deriveFallbackNextActions(
  request: AssistantGuideRequest,
  project: ProjectRecord | null,
): string[] {
  const starterNudges = pillarStarterNudges(request.pillar);
  if (!project) {
    if (request.pillar) {
      return dedupe(
        [
          ...starterNudges,
          `Define your current approach to ${request.pillar} in one or two sentences.`,
          "Use one retrieved recommendation, then adapt it to your workload constraints.",
          "Save the selected approach as a decision before moving to the next pillar.",
        ].map((value) => toActionNudge(value, request.pillar)),
      ).slice(0, 6);
    }
    return dedupe(
      [
        "Capture the app idea with users, workflow, and expected outcomes.",
        "Confirm priority pillar for the first guided exploration pass.",
        "Run retrieval preview to validate grounding coverage.",
      ].map((value) => toActionNudge(value, request.pillar)),
    ).slice(0, 6);
  }

  const actions = dedupe(
    [
      ...starterNudges,
      project.recommendedNextAction,
      request.pillar
        ? `Capture your current approach to ${request.pillar} and save it as a decision.`
        : "Capture one concrete pillar approach and save it as a decision.",
      "Capture at least one explicit decision and rationale per active pillar.",
      "Link dependent or conflicting decisions in the decision graph.",
    ].map((value) => toActionNudge(value, request.pillar)),
  );
  if (request.phase.includes("risk")) {
    actions.unshift(
      toActionNudge("Run conflict analysis and resolve high-severity conflicts.", request.pillar),
    );
  }
  if (request.phase.includes("output")) {
    actions.unshift(
      toActionNudge(
        "Generate outputs and validate master prompt against unresolved risks.",
        request.pillar,
      ),
    );
  }
  return dedupe(actions).slice(0, 6);
}

function safeParseJsonPayload(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace < firstBrace) {
      return null;
    }
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }
}

function parseQuestionArray(
  input: unknown,
  pillar?: AssistantGuideRequest["pillar"],
): AssistantGuideQuestion[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const parsed: AssistantGuideQuestion[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rawQuestion = normalize(
      String((item as { question?: unknown }).question ?? ""),
    );
    const whyItMatters = normalize(
      String((item as { whyItMatters?: unknown }).whyItMatters ?? ""),
    );
    const riskIfIgnored = normalize(
      String((item as { riskIfIgnored?: unknown }).riskIfIgnored ?? ""),
    );
    if (!rawQuestion || !whyItMatters || !riskIfIgnored) {
      continue;
    }
    const question = toActionNudge(rawQuestion, pillar);
    parsed.push({
      question,
      whyItMatters,
      riskIfIgnored,
    });
  }
  return dedupeGuideQuestions(parsed).slice(0, 4);
}

function parseStringArray(
  input: unknown,
  pillar?: AssistantGuideRequest["pillar"],
): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const values = input
    .map((item) => normalize(String(item ?? "")))
    .filter(Boolean)
    .map((item) => toActionNudge(item, pillar))
    .filter(Boolean);
  return dedupe(values).slice(0, 6);
}

function parseRiskArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => normalize(String(item ?? "")))
    .filter(Boolean)
    .slice(0, 3);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(2));
}

function startsWithQuestionPhrase(value: string): boolean {
  return /^(what|why|how|should|can|could|would|do|does|is|are|when|where)\b/i.test(
    value,
  );
}

function buildHeuristicDecisionAssessment(options: {
  message: string;
  pillar?: AssistantGuideRequest["pillar"];
  guidance: RetrievalResult[];
}): DecisionAssessment {
  const normalizedMessage = normalize(options.message);
  if (!normalizedMessage) {
    return {
      isDecision: false,
      confidence: 0,
      reason: "No message to evaluate for decision capture.",
      title: null,
      selectedOption: null,
      rationale: null,
      risks: [],
    };
  }

  const lower = normalizedMessage.toLowerCase();
  const decisionSignals = [
    "we will",
    "we'll",
    "we should",
    "we choose",
    "we are choosing",
    "i choose",
    "i'll use",
    "we'll use",
    "use ",
    "must ",
    "require ",
    "going with",
    "our approach",
    "let's use",
  ];
  const hasDecisionSignal = decisionSignals.some((signal) => lower.includes(signal));
  const looksLikeQuestion =
    normalizedMessage.endsWith("?") || startsWithQuestionPhrase(normalizedMessage);
  const hasSpecificity =
    normalizedMessage.length >= 35 ||
    /because|so that|to reduce|to improve|to avoid/i.test(normalizedMessage);

  const isDecision = !looksLikeQuestion && hasDecisionSignal && hasSpecificity;
  const confidence = clampConfidence(
    isDecision
      ? 0.65 + (hasSpecificity ? 0.12 : 0) + (options.guidance.length > 0 ? 0.08 : 0)
      : looksLikeQuestion
        ? 0.14
        : 0.35,
  );
  const topGuidance = options.guidance[0];
  const heading = topGuidance ? headingLabel(topGuidance) : options.pillar ?? "this pillar";
  const rationale = topGuidance
    ? firstSentence(topGuidance.content) ||
      `The approach should align with retrieved guidance for ${heading}.`
    : `Capture a clear ${options.pillar?.toLowerCase() ?? "architecture"} approach to reduce ambiguity.`;
  const risks = options.guidance
    .slice(0, 2)
    .map((item) => `Review ${headingLabel(item)} to avoid unresolved architecture risk.`);

  return {
    isDecision,
    confidence,
    reason: isDecision
      ? "Message contains a concrete architectural commitment."
      : looksLikeQuestion
        ? "Message is phrased as a question, not a committed decision."
        : "Message appears exploratory and not specific enough for decision logging.",
    title: options.pillar ? `${options.pillar} approach` : "Architecture approach",
    selectedOption: normalizedMessage,
    rationale,
    risks,
  };
}

function parseDecisionAssessmentPayload(
  payload: Record<string, unknown> | null,
): DecisionAssessment | null {
  if (!payload) {
    return null;
  }
  const isDecisionRaw = payload.isDecision;
  if (typeof isDecisionRaw !== "boolean") {
    return null;
  }
  const confidenceRaw = Number(payload.confidence ?? 0);
  const reason = normalize(String(payload.reason ?? ""));
  const title = normalize(String(payload.title ?? "")) || null;
  const selectedOption = normalize(String(payload.selectedOption ?? "")) || null;
  const rationale = normalize(String(payload.rationale ?? "")) || null;
  const risks = parseRiskArray(payload.risks);
  const suggestedPillar = normalize(String(payload.suggestedPillar ?? "")) || null;
  return {
    isDecision: isDecisionRaw,
    confidence: clampConfidence(confidenceRaw),
    reason: reason || "No reason provided by decision assessor.",
    title,
    selectedOption,
    rationale,
    risks,
    suggestedPillar: suggestedPillar || undefined,
  };
}

async function callOpenAiJson(
  provider: AssistantProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      temperature: 0.2,
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const text =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" || item.type === undefined)
      .map((item) => item.text ?? "")
      .join("\n") ??
    "";
  return safeParseJsonPayload(text);
}

async function callAnthropicJson(
  provider: AssistantProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 900,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  const text = payload.content?.map((item) => item.text ?? "").join("\n") ?? "";
  return safeParseJsonPayload(text);
}

async function callProviderJson(
  provider: AssistantProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  if (provider.provider === "openai") {
    return callOpenAiJson(provider, systemPrompt, userPrompt);
  }
  if (provider.provider === "anthropic") {
    return callAnthropicJson(provider, systemPrompt, userPrompt);
  }
  throw new Error("Unsupported provider.");
}

function retrievalQueryFromRequest(
  request: AssistantGuideRequest,
  project: ProjectRecord | null,
): string {
  const phrase = normalize(request.userMessage ?? "");
  if (phrase) {
    return phrase;
  }
  if (project && request.pillar) {
    return `${project.ideaText} ${request.pillar} architecture guidance`;
  }
  if (project) {
    return `${project.ideaText} ${request.phase} architecture guidance`;
  }
  if (request.pillar) {
    return `${request.pillar} architecture guidance`;
  }
  return `phase ${request.phase} architecture guidance`;
}

export async function assessDecisionCandidate(options: {
  request: AssistantGuideRequest;
  project: ProjectRecord | null;
  retrievedGuidance: RetrievalResult[];
}): Promise<DecisionAssessment> {
  const { request, project, retrievedGuidance } = options;
  const message = normalize(request.userMessage ?? "");
  const heuristic = buildHeuristicDecisionAssessment({
    message,
    pillar: request.pillar,
    guidance: retrievedGuidance,
  });

  const provider = request.providerConfig;
  if (!provider?.apiKey?.trim() || !provider.model.trim() || !message) {
    return heuristic;
  }

  const systemPrompt =
    "You classify user chat turns for architecture decision logging. Output strict JSON only with keys isDecision,confidence,reason,title,selectedOption,rationale,risks,suggestedPillar. confidence is 0-1. risks is a string array. Output suggestedPillar only if it differs from the provided pillar or if no pillar was provided. No markdown.";
  const userPrompt = JSON.stringify({
    pillar: request.pillar ?? null,
    userMessage: message,
    project: project
      ? {
          name: project.name,
          ideaText: project.ideaText,
          existingPillarDecisions: project.decisions
            .filter((decision) => !request.pillar || decision.pillar === request.pillar)
            .map((decision) => ({
              title: decision.title,
              selectedOption: decision.selectedOption,
              status: decision.status,
            })),
        }
      : null,
    retrievedGuidance: retrievedGuidance.map((item) => ({
      heading: headingLabel(item),
      snippet: item.content.slice(0, 280),
    })),
    fallback: heuristic,
  });

  try {
    const payload = await callProviderJson(provider, systemPrompt, userPrompt);
    const parsed = parseDecisionAssessmentPayload(payload);
    if (!parsed) {
      return {
        ...heuristic,
        reason: "Decision classifier response was invalid. Falling back to heuristic.",
      };
    }
    if (!parsed.selectedOption) {
      parsed.selectedOption = message;
    }
    if (!parsed.title && request.pillar) {
      parsed.title = `${request.pillar} approach`;
    }
    if (!parsed.rationale) {
      parsed.rationale = heuristic.rationale;
    }
    if (parsed.risks.length === 0) {
      parsed.risks = heuristic.risks;
    }
    return parsed;
  } catch (error) {
    const reason =
      error instanceof Error
        ? `Decision classifier failed: ${error.message}`
        : "Decision classifier failed.";
    return {
      ...heuristic,
      reason,
    };
  }
}

export async function generateAssistantGuidance(options: {
  request: AssistantGuideRequest;
  project: ProjectRecord | null;
  retrievalService: RetrievalService | null;
}): Promise<AssistantGuideResponse> {
  const { request, project, retrievalService } = options;
  const pillarFilter = request.pillar ? getPillarFilterValue(request.pillar) : null;

  const retrievedGuidance = retrievalService
    ? retrievalService.retrieve({
        query: retrievalQueryFromRequest(request, project),
        topK: 4,
        filters: pillarFilter
          ? {
              pillar: [pillarFilter],
            }
          : undefined,
      }).results
    : [];

  const guidanceQuestions = extractQuestionsFromGuidance(
    retrievedGuidance,
    request.pillar,
  );
  const starterQuestionNudges = pillarStarterNudges(request.pillar)
    .slice(0, 2)
    .map((nudge) => ({
      question: toActionNudge(nudge, request.pillar),
      whyItMatters:
        "Concrete implementation nudges keep this pillar conversation practical and execution-ready.",
      riskIfIgnored:
        "Staying abstract can slow decisions and increase rework during implementation.",
    }));
  const fallbackQuestion: AssistantGuideQuestion = request.pillar
    ? {
        question: `Define the initial ${request.pillar} approach and capture one explicit implementation tradeoff.`,
        whyItMatters:
          "Capturing one clear approach per pillar prevents hidden assumptions before implementation.",
        riskIfIgnored:
          "Skipping this decision can create cross-pillar drift and expensive course-correction later.",
      }
    : {
        question: "Capture the next architecture decision and include one implementation detail.",
        whyItMatters:
          "Explicit decision capture keeps architecture coherent and implementation prompts consistent.",
        riskIfIgnored:
          "Missing decisions create conflicting assumptions across code, operations, and security.",
      };
  const fallbackQuestions = dedupeGuideQuestions(
    guidanceQuestions.length > 0
      ? [...starterQuestionNudges, ...guidanceQuestions]
      : [...starterQuestionNudges, fallbackQuestion],
  ).slice(0, 4);
  const fallbackResponse: AssistantGuideResponse = {
    phase: request.phase,
    summary: buildFallbackSummary(request, project),
    nextActions: deriveFallbackNextActions(request, project),
    questions: fallbackQuestions.length > 0 ? fallbackQuestions : [fallbackQuestion],
    retrievedGuidance,
    generatedAt: new Date().toISOString(),
    providerUsed: "heuristic",
    providerModel: null,
    warning: null,
  };

  const provider = request.providerConfig;
  if (!provider?.apiKey?.trim() || !provider.model.trim()) {
    return fallbackResponse;
  }

  const systemPrompt =
    "You are an architecture copilot for Well-Architected Vibe Coding. Ground every recommendation in retrieved framework snippets. Output strict JSON only with keys summary,nextActions,questions. Each questions item must include question,whyItMatters,riskIfIgnored. Important: the question field is a short action nudge, not a question. Never use question marks or phrasing like 'What's your approach'. Start nudges with strong verbs such as Set up, Protect, Add, Automate, Define, Enforce, Document, Capture. For developer experience context, prefer concrete repository workflow nudges (for example CI checks, branch protection, PR templates, CODEOWNERS, and local environment automation). Keep output concise and practical. No markdown.";
  const userPrompt = JSON.stringify({
    phase: request.phase,
    pillar: request.pillar ?? null,
    project: project
      ? {
          name: project.name,
          ideaText: project.ideaText,
          currentFocus: project.currentFocus,
          decisions: project.decisions.map((decision) => ({
            title: decision.title,
            pillar: decision.pillar,
            selectedOption: decision.selectedOption,
            status: decision.status,
          })),
          openQuestions: project.suggestedOpenQuestions,
          risks: project.risks,
        }
      : null,
    userMessage: request.userMessage ?? "",
    retrievedGuidance: retrievedGuidance.map((item) => ({
      title: item.citation.title,
      headingPath: item.citation.heading_path,
      sourcePath: item.citation.source_path,
      snippet: item.content.slice(0, 360),
    })),
    fallback: {
      summary: fallbackResponse.summary,
      nextActions: fallbackResponse.nextActions,
      questions: fallbackResponse.questions,
    },
  });

  try {
    const modelPayload = await callProviderJson(provider, systemPrompt, userPrompt);
    if (!modelPayload) {
      return {
        ...fallbackResponse,
        warning: "Provider response could not be parsed. Showing fallback guidance.",
      };
    }

    const summary = normalize(String(modelPayload.summary ?? ""));
    const nextActions = dedupe([
      ...pillarStarterNudges(request.pillar),
      ...parseStringArray(modelPayload.nextActions, request.pillar),
    ]).slice(0, 6);
    const questions = dedupeGuideQuestions(
      parseQuestionArray(modelPayload.questions, request.pillar),
    ).slice(0, 4);
    if (!summary || nextActions.length === 0 || questions.length === 0) {
      return {
        ...fallbackResponse,
        warning: "Provider response was incomplete. Showing fallback guidance.",
      };
    }

    return {
      phase: request.phase,
      summary,
      nextActions,
      questions,
      retrievedGuidance,
      generatedAt: new Date().toISOString(),
      providerUsed: provider.provider,
      providerModel: provider.model,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider call failed.";
    return {
      ...fallbackResponse,
      warning: message,
    };
  }
}
