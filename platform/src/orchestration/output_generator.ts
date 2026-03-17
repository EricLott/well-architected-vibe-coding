import type {
  ConflictAnalysisResponse,
  GeneratedOutputs,
  ProjectRecord,
} from "../shared/types.js";
import { mergePillarDefinitions } from "./pillars.js";

function byPillar(project: ProjectRecord): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  const catalog = mergePillarDefinitions(project.additionalPillars ?? []);
  for (const pillar of catalog) {
    grouped[pillar.name] = [];
  }

  for (const decision of project.decisions) {
    if (!grouped[decision.pillar]) {
      grouped[decision.pillar] = [];
    }
    grouped[decision.pillar].push(`${decision.title}: ${decision.selectedOption}`);
  }
  return grouped;
}

function formatSection(title: string, lines: string[]): string {
  const body = lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : "- None";
  return `${title}\n${body}`;
}

function buildMasterSystemPrompt(
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
): string {
  const grouped = byPillar(project);
  const conflictLines = conflicts.conflicts.map(
    (conflict) => `${conflict.severity.toUpperCase()}: ${conflict.title}`,
  );
  const unresolved = project.decisions
    .filter((decision) => decision.status === "unresolved")
    .map((decision) => decision.title);
  const pillarSections = mergePillarDefinitions(project.additionalPillars ?? []).map(
    (pillar) => formatSection(`${pillar.name} decisions`, grouped[pillar.name] ?? []),
  );

  const sections = [
    "You are implementing a system from an architecture-first specification. Respect decisions before writing code.",
    `Project: ${project.name}`,
    `Idea: ${project.ideaText}`,
    ...pillarSections,
    formatSection("Open conflicts", conflictLines),
    formatSection("Unresolved decisions", unresolved),
    formatSection("Open questions", project.suggestedOpenQuestions),
    "Do not invent missing architecture decisions. Flag unresolved areas explicitly.",
  ];
  return sections.join("\n\n");
}

function buildLayerPrompt(
  layer: "frontend" | "backend" | "data" | "devops",
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
): string {
  const highConflicts = conflicts.conflicts
    .filter((conflict) => conflict.severity === "high")
    .map((conflict) => conflict.title);
  const decisionHighlights = project.decisions
    .slice(0, 6)
    .map((decision) => `${decision.pillar}: ${decision.title} -> ${decision.selectedOption}`);

  return [
    `Build the ${layer} layer for project "${project.name}" aligned to architecture decisions.`,
    "Required constraints:",
    ...decisionHighlights.map((line) => `- ${line}`),
    highConflicts.length > 0
      ? "High-severity conflicts to account for:"
      : "No high-severity conflicts currently detected.",
    ...highConflicts.map((line) => `- ${line}`),
    "If a required detail is missing, return a clarification request instead of guessing.",
  ].join("\n");
}

function buildFeaturePrompts(project: ProjectRecord): string[] {
  return project.decisions.slice(0, 8).map((decision) => {
    return `Implement "${decision.title}" using "${decision.selectedOption}" for the ${decision.pillar} pillar. Include tests and operational guardrails.`;
  });
}

function buildBacklog(project: ProjectRecord, conflicts: ConflictAnalysisResponse): string[] {
  const items: string[] = [];
  for (const question of project.suggestedOpenQuestions) {
    items.push(`Resolve open question: ${question}`);
  }
  for (const conflict of conflicts.conflicts) {
    items.push(`Resolve ${conflict.severity} conflict: ${conflict.title}`);
  }
  for (const area of project.inferredMissingAreas) {
    items.push(`Clarify architecture area: ${area}`);
  }
  return items.slice(0, 12);
}

export function generateOutputs(
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
): GeneratedOutputs {
  const grouped = byPillar(project);
  const catalog = mergePillarDefinitions(project.additionalPillars ?? []);
  const strengths: string[] = [];
  const gaps: string[] = [];

  for (const pillar of catalog) {
    const decisions = grouped[pillar.name] ?? [];
    if (decisions.length > 0) {
      strengths.push(`${pillar.name}: ${decisions.length} decision(s) captured.`);
    } else {
      gaps.push(`${pillar.name}: no explicit decisions captured yet.`);
    }
  }

  const topRisks = [
    ...project.risks,
    ...conflicts.conflicts.map((conflict) => conflict.title),
  ].slice(0, 8);
  const mitigationActions = conflicts.conflicts.map(
    (conflict) => `${conflict.title}: ${conflict.recommendation}`,
  );

  return {
    architectureSummary: {
      systemOverview: [
        `Project: ${project.name}`,
        `Idea: ${project.ideaText}`,
        `Current focus: ${project.currentFocus}`,
        `Decisions captured: ${project.decisions.length}`,
      ],
      pillarStrengths: strengths,
      pillarGaps: gaps,
    },
    riskReport: {
      topRisks,
      mitigationActions: mitigationActions.slice(0, 8),
    },
    openQuestions: project.suggestedOpenQuestions,
    promptPack: {
      masterSystemPrompt: buildMasterSystemPrompt(project, conflicts),
      layerPrompts: {
        frontend: buildLayerPrompt("frontend", project, conflicts),
        backend: buildLayerPrompt("backend", project, conflicts),
        data: buildLayerPrompt("data", project, conflicts),
        devops: buildLayerPrompt("devops", project, conflicts),
      },
      featurePrompts: buildFeaturePrompts(project),
      buildBacklog: buildBacklog(project, conflicts),
    },
    generatedAt: new Date().toISOString(),
  };
}
