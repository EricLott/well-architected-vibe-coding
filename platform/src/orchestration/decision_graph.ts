import type { DecisionGraph, DecisionItem, DecisionLink } from "../shared/types.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function sanitizeDecisionLinks(
  decisions: DecisionItem[],
  links: DecisionLink[],
): DecisionLink[] {
  const validDecisionIds = new Set(decisions.map((decision) => decision.id));
  const dedupe = new Set<string>();
  const sanitized: DecisionLink[] = [];

  for (const link of links) {
    if (
      !link.id.trim() ||
      !validDecisionIds.has(link.fromDecisionId) ||
      !validDecisionIds.has(link.toDecisionId) ||
      link.fromDecisionId === link.toDecisionId
    ) {
      continue;
    }
    const dedupeKey = [
      normalize(link.fromDecisionId),
      normalize(link.toDecisionId),
      normalize(link.type),
    ].join(":");
    if (dedupe.has(dedupeKey)) {
      continue;
    }
    dedupe.add(dedupeKey);
    sanitized.push({
      ...link,
      rationale: link.rationale.trim(),
    });
  }

  return sanitized;
}

export function buildDecisionGraph(
  decisions: DecisionItem[],
  links: DecisionLink[],
): DecisionGraph {
  const sanitizedLinks = sanitizeDecisionLinks(decisions, links);
  const unresolvedDecisionIds = decisions
    .filter((decision) => decision.status === "unresolved")
    .map((decision) => decision.id);

  return {
    nodes: decisions,
    links: sanitizedLinks,
    unresolvedDecisionIds,
  };
}
