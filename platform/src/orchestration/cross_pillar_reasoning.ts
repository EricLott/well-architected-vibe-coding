import type { RetrievalService } from "../retrieval/index.js";
import type {
  ConflictAnalysisResponse,
  ConflictSeverity,
  CrossPillarConflict,
  DecisionItem,
  DecisionLink,
  PillarName,
  ProjectRecord,
} from "../shared/types.js";
import { getPillarFilterValue } from "./pillars.js";

interface HeuristicRule {
  id: string;
  title: string;
  description: string;
  severity: ConflictSeverity;
  whyItMatters: string;
  recommendation: string;
  left: {
    pillar: PillarName;
    keywords: string[];
  };
  right: {
    pillar: PillarName;
    keywords: string[];
  };
}

const heuristicRules: HeuristicRule[] = [
  {
    id: "cost-performance-latency",
    title: "Cost minimization can conflict with low-latency goals",
    description:
      "A cost-first runtime choice may not satisfy strict real-time or low-latency targets.",
    severity: "high",
    whyItMatters:
      "Performance regressions in user-facing workflows can cause churn and expensive architectural rework.",
    recommendation:
      "Define explicit latency SLOs and test if the selected cost model can meet them under peak load.",
    left: {
      pillar: "Cost Optimization",
      keywords: [
        "serverless",
        "consumption",
        "lowest tier",
        "cheap",
        "minimize cost",
        "single instance",
      ],
    },
    right: {
      pillar: "Performance Efficiency",
      keywords: [
        "low latency",
        "real-time",
        "sub-second",
        "high throughput",
        "websocket",
        "near-instant",
      ],
    },
  },
  {
    id: "reliability-cost-redundancy",
    title: "High availability can conflict with aggressive cost reduction",
    description:
      "Multi-region resilience patterns can materially increase baseline infrastructure cost.",
    severity: "medium",
    whyItMatters:
      "Ignoring this tradeoff can lead to underfunded reliability commitments and unstable production posture.",
    recommendation:
      "Align reliability targets with budget constraints and phase resilience investments by criticality.",
    left: {
      pillar: "Reliability",
      keywords: [
        "active-active",
        "multi-region",
        "high availability",
        "redundancy",
        "failover",
      ],
    },
    right: {
      pillar: "Cost Optimization",
      keywords: ["lowest cost", "single region", "budget cap", "minimize spend"],
    },
  },
  {
    id: "security-usability-friction",
    title: "Strict security controls can conflict with frictionless onboarding",
    description:
      "Strong access controls may increase user friction if onboarding flow is not designed intentionally.",
    severity: "medium",
    whyItMatters:
      "Unmanaged friction can hurt adoption, while loosened controls can create security exposure.",
    recommendation:
      "Design adaptive authentication and role-based paths that preserve both protection and usability.",
    left: {
      pillar: "Security",
      keywords: [
        "mfa",
        "zero trust",
        "strict access",
        "private network",
        "ip allowlist",
      ],
    },
    right: {
      pillar: "Operational Excellence",
      keywords: [
        "fast onboarding",
        "frictionless",
        "self-serve signup",
        "quick setup",
      ],
    },
  },
];

function decisionText(decision: DecisionItem): string {
  return [
    decision.title,
    decision.description,
    decision.selectedOption,
    decision.rationale,
    ...decision.risks,
  ]
    .join(" ")
    .toLowerCase();
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function findDecisionForRule(
  decisions: DecisionItem[],
  pillar: PillarName,
  keywords: string[],
): DecisionItem | null {
  for (const decision of decisions) {
    if (decision.pillar !== pillar) {
      continue;
    }
    if (includesAnyKeyword(decisionText(decision), keywords)) {
      return decision;
    }
  }
  return null;
}

function dedupePillars(values: PillarName[]): PillarName[] {
  const seen = new Set<string>();
  const deduped: PillarName[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
  }
  return deduped;
}

async function hydrateGuidance(
  project: ProjectRecord,
  conflict: CrossPillarConflict,
  retrieval: RetrievalService | null,
) {
  if (!retrieval) {
    return conflict;
  }

  const filters = {
    pillar: conflict.involvedPillars.map((pillar) => getPillarFilterValue(pillar)),
  };
  const query = `${project.ideaText} ${conflict.involvedPillars.join(
    " ",
  )} tradeoffs ${conflict.title}`;

  const relatedGuidance = retrieval.retrieve({
    query,
    filters,
    topK: 2,
  }).results;

  return {
    ...conflict,
    relatedGuidance,
  };
}

export async function analyzeCrossPillarConflicts(
  project: ProjectRecord,
  decisions: DecisionItem[],
  links: DecisionLink[],
  retrieval: RetrievalService | null,
): Promise<ConflictAnalysisResponse> {
  const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
  const conflicts: CrossPillarConflict[] = [];
  const dedupe = new Set<string>();

  for (const link of links) {
    if (link.type !== "conflicts-with") {
      continue;
    }
    const left = decisionById.get(link.fromDecisionId);
    const right = decisionById.get(link.toDecisionId);
    if (!left || !right) {
      continue;
    }

    const key = [left.id, right.id].sort().join(":");
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);

    conflicts.push({
      id: `conflict-link-${key}`,
      title: `${left.title} conflicts with ${right.title}`,
      description:
        link.rationale ||
        "This conflict was flagged directly in the decision graph.",
      severity: "high",
      involvedPillars: dedupePillars([left.pillar, right.pillar]),
      decisionIds: [left.id, right.id],
      whyItMatters:
        "Unresolved architectural conflicts create implementation ambiguity and hidden production risk.",
      recommendation:
        "Resolve this conflict with an explicit tradeoff decision and update dependent design choices.",
      relatedGuidance: [],
    });
  }

  for (const rule of heuristicRules) {
    const leftDecision = findDecisionForRule(
      decisions,
      rule.left.pillar,
      rule.left.keywords,
    );
    const rightDecision = findDecisionForRule(
      decisions,
      rule.right.pillar,
      rule.right.keywords,
    );
    if (!leftDecision || !rightDecision) {
      continue;
    }

    const key = [leftDecision.id, rightDecision.id].sort().join(":");
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);

    conflicts.push({
      id: `conflict-rule-${rule.id}`,
      title: rule.title,
      description: rule.description,
      severity: rule.severity,
      involvedPillars: dedupePillars([leftDecision.pillar, rightDecision.pillar]),
      decisionIds: [leftDecision.id, rightDecision.id],
      whyItMatters: rule.whyItMatters,
      recommendation: rule.recommendation,
      relatedGuidance: [],
    });
  }

  const hydrated = await Promise.all(
    conflicts.map((conflict) => hydrateGuidance(project, conflict, retrieval)),
  );
  const summary =
    hydrated.length === 0
      ? "No cross-pillar conflicts detected in the current decision set."
      : `${hydrated.length} cross-pillar conflict(s) detected. Resolve high-severity conflicts before prompt export.`;

  return {
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    summary,
    conflicts: hydrated,
  };
}
