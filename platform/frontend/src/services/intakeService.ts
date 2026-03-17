import type { ProjectState } from "../types/app";

export interface IntakeService {
  initializeProject(ideaText: string): Promise<ProjectState>;
}

function deriveProjectName(ideaText: string): string {
  const sanitized = ideaText
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
  const words = sanitized.split(" ").filter(Boolean).slice(0, 6);
  if (words.length === 0) {
    return "Untitled architecture project";
  }
  const titleCase = words.map(
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
  return titleCase.join(" ");
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
  const questions = [
    "What reliability target and recovery objective should guide architecture choices?",
    "What security model is required for identities, roles, and data protection?",
    "What latency, throughput, and usage growth should Phase 1 support?",
    "What operating budget and team capacity constraints must be respected?",
  ];

  if (!normalized.includes("mobile")) {
    questions.push("Will this be web-only, mobile-first, or multi-channel?");
  }

  return questions;
}

function buildSummary(ideaText: string): string {
  return `You want to build: ${ideaText.trim().replace(/\s+/g, " ")}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export const mockIntakeService: IntakeService = {
  async initializeProject(ideaText) {
    const normalizedIdea = ideaText.trim();
    if (!normalizedIdea) {
      throw new Error("Please enter an idea before starting intake.");
    }

    await delay(600);

    return {
      id: `project-${Date.now()}`,
      name: deriveProjectName(normalizedIdea),
      ideaText: normalizedIdea,
      ideaSummary: buildSummary(normalizedIdea),
      currentFocus: "Pillar-guided exploration (security and reliability first)",
      inferredMissingAreas: inferMissingAreas(normalizedIdea),
      risks: [
        "Skipping architecture intake can create hidden security and reliability debt.",
        "Unclear scope can increase rework during implementation and testing.",
      ],
      suggestedOpenQuestions: inferOpenQuestions(normalizedIdea),
      discoveryQuestions: [
        "Which user workflow must succeed even during degraded conditions?",
        "What identity and access model best fits your user and admin boundaries?",
        "Where should we place guardrails to balance cost, performance, and reliability?",
      ],
      recommendedNextAction:
        "Confirm user personas and non-functional priorities, then move to a security-focused decision pass.",
    };
  },
};
