import type {
  PillarDefinition,
  PillarName,
} from "../shared/types.js";

const pillarCatalog: PillarDefinition[] = [
  {
    name: "Reliability",
    slug: "reliability",
    category: "well-architected",
    summary: "Resilience, availability, and recovery posture.",
    retrievalQueryHint: "reliability architecture resilience recovery availability",
  },
  {
    name: "Security",
    slug: "security",
    category: "well-architected",
    summary: "Identity, data protection, and secure operations.",
    retrievalQueryHint: "security identity access control data protection",
  },
  {
    name: "Cost Optimization",
    slug: "cost-optimization",
    category: "well-architected",
    summary: "Cost efficiency, right-sizing, and spend visibility.",
    retrievalQueryHint: "cost optimization right-sizing spend efficiency",
  },
  {
    name: "Operational Excellence",
    slug: "operational-excellence",
    category: "well-architected",
    summary: "Safe operations, change management, and continuous improvement.",
    retrievalQueryHint: "operational excellence observability runbooks deployment",
  },
  {
    name: "Performance Efficiency",
    slug: "performance-efficiency",
    category: "well-architected",
    summary: "Latency, throughput, scalability, and efficient resource usage.",
    retrievalQueryHint: "performance efficiency latency throughput scaling",
  },
  {
    name: "Data Design",
    slug: "data-design",
    category: "solution-architecture",
    summary: "Entity boundaries, relationships, naming, and lifecycle.",
    retrievalQueryHint: "data modeling entities relationships naming lifecycle audit",
  },
  {
    name: "API & Service Layer",
    slug: "api-service-layer",
    category: "solution-architecture",
    summary: "Behavior contracts, validation, idempotency, and versioning.",
    retrievalQueryHint: "api design service layer idempotency validation versioning",
  },
  {
    name: "UX / UI System",
    slug: "ux-ui-system",
    category: "experience-design",
    summary: "Reusable components, interaction consistency, and accessibility.",
    retrievalQueryHint: "ui system design consistency accessibility loading states",
  },
  {
    name: "State & Client Architecture",
    slug: "state-client-architecture",
    category: "engineering-operations",
    summary: "Client data flow, caching, and scalable state patterns.",
    retrievalQueryHint: "frontend state architecture cache data flow client state",
  },
  {
    name: "Identity & Permissions",
    slug: "identity-permissions",
    category: "solution-architecture",
    summary: "RBAC, ownership models, and secure authorization defaults.",
    retrievalQueryHint: "identity permissions rbac authorization ownership model",
  },
  {
    name: "Integration & Extensibility",
    slug: "integration-extensibility",
    category: "solution-architecture",
    summary: "Bounded integrations, events, retries, and loose coupling.",
    retrievalQueryHint: "integration extensibility events webhooks retry loose coupling",
  },
  {
    name: "Observability & Debuggability",
    slug: "observability-debuggability",
    category: "engineering-operations",
    summary: "Structured logs, correlation IDs, metrics, and diagnostics.",
    retrievalQueryHint: "observability logging correlation id metrics debugging",
  },
  {
    name: "Developer Experience (DX)",
    slug: "developer-experience-dx",
    category: "engineering-operations",
    summary: "Conventions, scaffolding, fast feedback loops, and dev parity.",
    retrievalQueryHint: "developer experience project structure conventions scaffolding",
  },
  {
    name: "Branding & Product Consistency",
    slug: "branding-product-consistency",
    category: "experience-design",
    summary: "Voice, naming, tokens, and product identity consistency.",
    retrievalQueryHint: "product consistency branding design tokens naming consistency",
  },
  {
    name: "Workflow & Business Logic Modeling",
    slug: "workflow-business-logic-modeling",
    category: "solution-architecture",
    summary: "State machines, lifecycle transitions, and deterministic rules.",
    retrievalQueryHint: "workflow modeling business logic state machine lifecycle rules",
  },
];

const pillarFilterByName: Partial<Record<PillarName, string>> = {
  Reliability: "reliability",
  Security: "security",
  "Cost Optimization": "cost-optimization",
  "Operational Excellence": "operational-excellence",
  "Performance Efficiency": "performance-efficiency",
};

const pillarBySlug = new Map<string, PillarDefinition>(
  pillarCatalog.map((pillar) => [pillar.slug, pillar]),
);

interface AdHocPillarRule {
  name: string;
  summary: string;
  retrievalQueryHint: string;
  keywords: string[];
}

const adHocPillarRules: AdHocPillarRule[] = [
  {
    name: "Payments & Billing",
    summary:
      "Payment flows, provider integration, reconciliation, and financial risk controls.",
    retrievalQueryHint:
      "payments billing architecture provider integration reliability security cost",
    keywords: [
      "stripe",
      "payment",
      "payments",
      "checkout",
      "invoice",
      "billing",
      "subscription",
      "refund",
      "chargeback",
      "tax",
      "merchant",
      "card",
    ],
  },
  {
    name: "Compliance & Governance",
    summary:
      "Regulatory controls, audit readiness, data governance, and policy boundaries.",
    retrievalQueryHint:
      "compliance governance audit controls privacy regulatory architecture",
    keywords: [
      "hipaa",
      "gdpr",
      "pci",
      "soc2",
      "iso 27001",
      "compliance",
      "regulatory",
      "audit",
      "governance",
    ],
  },
  {
    name: "AI & Model Safety",
    summary:
      "Model lifecycle, safety controls, prompt boundaries, and evaluation quality.",
    retrievalQueryHint:
      "ai architecture model safety prompt security reliability operations",
    keywords: [
      "llm",
      "ai",
      "model",
      "prompt",
      "rag",
      "inference",
      "hallucination",
      "guardrail",
      "embedding",
    ],
  },
  {
    name: "Notifications & Communications",
    summary:
      "Email, SMS, push, and delivery reliability across user communication channels.",
    retrievalQueryHint:
      "notification architecture email sms push delivery reliability operations",
    keywords: [
      "email",
      "sms",
      "push",
      "notification",
      "notifications",
      "twilio",
      "sendgrid",
      "message delivery",
    ],
  },
  {
    name: "Tenant & Isolation Strategy",
    summary:
      "Tenant boundaries, data isolation, ownership, and multi-tenant operational controls.",
    retrievalQueryHint:
      "multi-tenant architecture tenant isolation security data model",
    keywords: [
      "multi-tenant",
      "multitenant",
      "tenant",
      "tenant isolation",
      "organization",
      "workspace",
      "per customer",
    ],
  },
];

export function pillarNameToSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\//g, " ")
    .replace(/[()]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeLabel(value).toLowerCase();
}

function toAdHocDefinition(rule: AdHocPillarRule): PillarDefinition {
  return {
    name: rule.name,
    slug: pillarNameToSlug(rule.name),
    category: "ad-hoc",
    summary: rule.summary,
    retrievalQueryHint: rule.retrievalQueryHint,
  };
}

export function mergePillarDefinitions(
  additional: PillarDefinition[] = [],
): PillarDefinition[] {
  const bySlug = new Map<string, PillarDefinition>();
  for (const pillar of [...pillarCatalog, ...additional]) {
    const slug = pillarNameToSlug(pillar.slug || pillar.name);
    bySlug.set(slug, {
      ...pillar,
      slug,
    });
  }
  return [...bySlug.values()];
}

export function listPillarDefinitions(): PillarDefinition[] {
  return [...pillarCatalog];
}

export function getPillarDefinition(pillar: PillarName): PillarDefinition {
  const found = pillarCatalog.find(
    (item) => normalizeKey(item.name) === normalizeKey(pillar),
  );
  if (!found) {
    return {
      name: normalizeLabel(pillar),
      slug: pillarNameToSlug(pillar),
      category: "ad-hoc",
      summary: `Ad-hoc pillar generated for ${normalizeLabel(pillar)}.`,
      retrievalQueryHint: `${normalizeLabel(pillar)} architecture guidance`,
    };
  }
  return found;
}

export function getPillarFilterValue(pillar: PillarName): string | null {
  return pillarFilterByName[pillar] ?? null;
}

export function normalizePillarInput(
  value: string,
  availablePillars: PillarDefinition[] = pillarCatalog,
): PillarName | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const slug = pillarNameToSlug(trimmed);
  const projectPillarBySlug = new Map<string, PillarDefinition>(
    availablePillars.map((pillar) => [pillarNameToSlug(pillar.slug), pillar]),
  );

  const direct = projectPillarBySlug.get(slug) ?? pillarBySlug.get(slug);
  if (direct) {
    return direct.name;
  }

  const byName = availablePillars.find(
    (pillar) => normalizeKey(pillar.name) === normalizeKey(trimmed),
  );
  if (byName) {
    return byName.name;
  }
  return normalizeLabel(trimmed);
}

export function listPillars(): PillarName[] {
  return pillarCatalog.map((pillar) => pillar.name);
}

export function buildPillarQueryHint(pillar: PillarName): string {
  return getPillarDefinition(pillar).retrievalQueryHint;
}

export function inferAdHocPillarsFromText(text: string): PillarDefinition[] {
  const normalized = text.toLowerCase();
  const inferred: PillarDefinition[] = [];
  for (const rule of adHocPillarRules) {
    const hasSignal = rule.keywords.some((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    );
    if (!hasSignal) {
      continue;
    }
    inferred.push(toAdHocDefinition(rule));
  }
  return mergePillarDefinitions(inferred).filter(
    (pillar) => pillar.category === "ad-hoc",
  );
}
