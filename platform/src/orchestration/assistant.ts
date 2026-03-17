import type { RetrievalService } from "../retrieval/index.js";
import type {
  AiProvider,
  AssistantGuideQuestion,
  AssistantGuideRequest,
  AssistantGuideResponse,
  AssistantProviderConfig,
  ProjectRecord,
  RetrievalResult,
} from "../shared/types.js";

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildFallbackSummary(
  request: AssistantGuideRequest,
  project: ProjectRecord | null,
): string {
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

function extractQuestionsFromGuidance(guidance: RetrievalResult[]): AssistantGuideQuestion[] {
  return guidance.slice(0, 3).map((item) => {
    const heading = item.citation.heading_path.join(" > ") || item.citation.title;
    return {
      question: `How should "${heading}" shape the next architecture decision?`,
      whyItMatters:
        "Grounding decisions in framework guidance helps maintain architectural consistency across pillars.",
      riskIfIgnored:
        "Skipping this analysis can create hidden design debt and conflicting implementation prompts.",
    };
  });
}

function deriveFallbackNextActions(
  request: AssistantGuideRequest,
  project: ProjectRecord | null,
): string[] {
  if (!project) {
    return [
      "Capture the app idea with users, workflow, and expected outcomes.",
      "Confirm priority pillar for the first guided exploration pass.",
      "Run retrieval preview to validate grounding coverage.",
    ];
  }

  const actions = [
    project.recommendedNextAction,
    "Capture at least one explicit decision and rationale per active pillar.",
    "Link dependent or conflicting decisions in the decision graph.",
  ];
  if (request.phase.includes("risk")) {
    actions.unshift("Run conflict analysis and resolve high-severity conflicts.");
  }
  if (request.phase.includes("output")) {
    actions.unshift("Generate outputs and validate master prompt against unresolved risks.");
  }
  return actions.slice(0, 4);
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

function parseQuestionArray(input: unknown): AssistantGuideQuestion[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const parsed: AssistantGuideQuestion[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const question = normalize(String((item as { question?: unknown }).question ?? ""));
    const whyItMatters = normalize(
      String((item as { whyItMatters?: unknown }).whyItMatters ?? ""),
    );
    const riskIfIgnored = normalize(
      String((item as { riskIfIgnored?: unknown }).riskIfIgnored ?? ""),
    );
    if (!question || !whyItMatters || !riskIfIgnored) {
      continue;
    }
    parsed.push({
      question,
      whyItMatters,
      riskIfIgnored,
    });
  }
  return parsed.slice(0, 4);
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const values = input
    .map((item) => normalize(String(item ?? "")))
    .filter(Boolean);
  return values.slice(0, 6);
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
  if (project) {
    return `${project.ideaText} ${request.phase} architecture guidance`;
  }
  return `phase ${request.phase} architecture guidance`;
}

export async function generateAssistantGuidance(options: {
  request: AssistantGuideRequest;
  project: ProjectRecord | null;
  retrievalService: RetrievalService | null;
}): Promise<AssistantGuideResponse> {
  const { request, project, retrievalService } = options;

  const retrievedGuidance = retrievalService
    ? retrievalService.retrieve({
        query: retrievalQueryFromRequest(request, project),
        topK: 3,
      }).results
    : [];

  const fallbackQuestions = extractQuestionsFromGuidance(retrievedGuidance);
  const fallbackResponse: AssistantGuideResponse = {
    phase: request.phase,
    summary: buildFallbackSummary(request, project),
    nextActions: deriveFallbackNextActions(request, project),
    questions:
      fallbackQuestions.length > 0
        ? fallbackQuestions
        : [
            {
              question:
                "What decision should be captured next to reduce uncertainty?",
              whyItMatters:
                "Explicit decisions with rationale prevent drift and improve implementation quality.",
              riskIfIgnored:
                "Missing decisions create conflicting assumptions across code and operations.",
            },
          ],
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
    "You are an architecture copilot for Well-Architected Vibe Coding. Output strict JSON only with keys summary,nextActions,questions. Questions must include question,whyItMatters,riskIfIgnored. No markdown.";
  const userPrompt = JSON.stringify({
    phase: request.phase,
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
    const nextActions = parseStringArray(modelPayload.nextActions);
    const questions = parseQuestionArray(modelPayload.questions);
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
