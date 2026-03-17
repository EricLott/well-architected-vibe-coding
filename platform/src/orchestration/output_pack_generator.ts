import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type {
  AssistantProviderConfig,
  ConflictAnalysisResponse,
  ProjectRecord,
} from "../shared/types.js";

const OUTPUT_ZIP_FILE = "ai-implementation-system.zip";
const OUTPUT_FOLDER_NAME = "ai-implementation-system";

const REQUIRED_DIRECTORIES = [
  "plans",
  "tasks",
  "decisions",
  "specs",
  "status",
  "templates",
] as const;

const REQUIRED_FILES = [
  "PROJECT_OVERVIEW.md",
  "AGENTS.md",
  "README.md",
  "plans/README.md",
  "plans/authentication.md",
  "plans/data-model.md",
  "plans/api-architecture.md",
  "plans/frontend-shell.md",
  "plans/billing.md",
  "tasks/README.md",
  "tasks/001-bootstrap-repo.md",
  "tasks/002-foundation-architecture.md",
  "tasks/003-auth-setup.md",
  "tasks/004-data-model-foundation.md",
  "tasks/005-api-shell.md",
  "tasks/006-frontend-app-shell.md",
  "tasks/007-design-system-foundation.md",
  "tasks/008-observability-foundation.md",
  "tasks/009-billing-foundation.md",
  "tasks/010-status-and-governance.md",
  "decisions/README.md",
  "decisions/001-template-decision-record.md",
  "decisions/002-use-task-driven-execution.md",
  "decisions/003-use-explicit-specs-as-source-of-truth.md",
  "specs/README.md",
  "specs/api-contracts.md",
  "specs/data-entities.md",
  "specs/route-map.md",
  "specs/permissions-matrix.md",
  "specs/state-machines.md",
  "specs/design-tokens.md",
  "specs/dto-examples.md",
  "status/README.md",
  "status/current-status.md",
  "status/task-board.md",
  "status/blockers.md",
  "status/next-task.md",
  "templates/task-template.md",
  "templates/plan-template.md",
  "templates/adr-template.md",
  "templates/spec-template.md",
  "templates/status-template.md",
] as const;

type DomainKind = "field-service" | "general";

interface ProfileSeed {
  appName: string;
  tagline: string;
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  workflows: string[];
  entities: string[];
  architectureComponents: string[];
  assumptions: string[];
  nonFunctionalRequirements: string[];
  billingApproach: string[];
}

interface RoleDefinition {
  name: string;
  responsibilities: string[];
}

interface WorkflowDefinition {
  name: string;
  actor: string;
  trigger: string;
  steps: string[];
  outcome: string;
}

interface EntityField {
  name: string;
  type: string;
  description: string;
}

interface EntityDefinition {
  name: string;
  description: string;
  keyFields: EntityField[];
  relationships: string[];
}

interface ApiEndpointDefinition {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  purpose: string;
  actor: string;
  requestShape: string[];
  responseShape: string[];
}

interface DomainProfile {
  appName: string;
  slug: string;
  tagline: string;
  problemStatement: string;
  targetUsers: string[];
  roles: RoleDefinition[];
  goals: string[];
  workflows: WorkflowDefinition[];
  entities: EntityDefinition[];
  apiEndpoints: ApiEndpointDefinition[];
  architectureComponents: string[];
  assumptions: string[];
  nonFunctionalRequirements: string[];
  billingApproach: string[];
  observabilitySignals: string[];
}

export interface OutputPackArchive {
  fileName: string;
  contentType: string;
  bytes: Buffer;
  fileCount: number;
  generatedAt: string;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function slugify(value: string): string {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value: string): string {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toPathSegment(value: string): string {
  const slug = slugify(value);
  return slug || "resource";
}

function pluralize(value: string): string {
  const normalized = normalize(value);
  const lower = normalized.toLowerCase();
  if (lower.endsWith("y")) {
    return `${normalized.slice(0, -1)}ies`;
  }
  if (
    lower.endsWith("s") ||
    lower.endsWith("x") ||
    lower.endsWith("z") ||
    lower.endsWith("ch") ||
    lower.endsWith("sh")
  ) {
    return `${normalized}es`;
  }
  return `${normalized}s`;
}

function markdownList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function safeParseJsonPayload(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) {
      return null;
    }
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function parseStringArray(input: unknown, limit: number): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return dedupe(input.map((item) => String(item ?? ""))).slice(0, limit);
}

function parseStringValue(input: unknown, fallback: string): string {
  const value = normalize(String(input ?? ""));
  return value || fallback;
}

function determineDomainKind(ideaText: string): DomainKind {
  const lower = ideaText.toLowerCase();
  if (
    /(schedule|scheduling|booking|dispatch|technician|field service|work order|service request)/.test(
      lower,
    )
  ) {
    return "field-service";
  }
  return "general";
}

function detectTargetUsers(ideaText: string, kind: DomainKind): string[] {
  const lower = ideaText.toLowerCase();
  const users: string[] = [];
  if (/customer|client|homeowner/.test(lower)) {
    users.push("Customers");
  }
  if (/technician|field|agent|operator|staff/.test(lower)) {
    users.push("Service technicians");
  }
  if (/manager|admin|operations|dispatcher/.test(lower)) {
    users.push("Operations managers");
  }
  if (kind === "field-service") {
    users.push("Dispatch coordinators");
  }
  if (users.length === 0) {
    users.push("Primary end users", "Operations team");
  }
  return dedupe(users).slice(0, 4);
}

function detectGoals(project: ProjectRecord): string[] {
  const goals = [
    "Ship a production-safe implementation baseline with clear architectural constraints",
    "Keep delivery aligned with explicit decisions across reliability, security, cost, operations, and performance",
    "Enable fast, auditable iteration through task-driven execution",
  ];
  for (const decision of project.decisions.slice(0, 3)) {
    goals.push(`Implement ${decision.title} without violating related pillar tradeoffs`);
  }
  return dedupe(goals).slice(0, 6);
}

function detectWorkflows(ideaText: string, kind: DomainKind): string[] {
  if (kind === "field-service") {
    return [
      "Capture customer service request",
      "Schedule and dispatch technician",
      "Track job progress and customer updates",
      "Close work order, invoice, and follow-up",
    ];
  }
  return [
    "Capture user request and validate permissions",
    "Execute primary business workflow",
    "Publish status changes and notifications",
    "Close workflow and capture audit trail",
  ];
}

function detectEntities(kind: DomainKind): string[] {
  if (kind === "field-service") {
    return [
      "Customer",
      "ServiceRequest",
      "WorkOrder",
      "Technician",
      "DispatchSlot",
      "StatusUpdate",
      "Invoice",
    ];
  }
  return [
    "UserAccount",
    "WorkItem",
    "Assignment",
    "WorkflowEvent",
    "Notification",
    "BillingAccount",
  ];
}

function detectArchitectureComponents(kind: DomainKind): string[] {
  if (kind === "field-service") {
    return [
      "Web and mobile-ready frontend shell for dispatcher and technician workflows",
      "API service layer with domain modules for requests, dispatch, status, and billing",
      "Relational data store for operational entities and transactional integrity",
      "Event bus or queue for status fan-out and notification processing",
      "Notification worker for customer SMS or email progress updates",
      "Observability stack with logs, metrics, traces, and domain health dashboards",
    ];
  }
  return [
    "Frontend shell with route-level access control",
    "API service layer with domain-driven module boundaries",
    "Primary relational store plus event outbox for integration events",
    "Background worker for notifications and long-running jobs",
    "Observability stack with unified telemetry and alerting",
    "Automated deployment pipeline with quality gates",
  ];
}

function detectAssumptions(project: ProjectRecord): string[] {
  const assumptions = [
    "The first release prioritizes one production region with a clear path to multi-region resilience",
    "Identity and authorization are enforced centrally before any business action",
    "Every critical workflow emits traceable state changes and audit records",
  ];
  for (const question of project.suggestedOpenQuestions.slice(0, 3)) {
    assumptions.push(`Assumption pending confirmation: ${question}`);
  }
  return dedupe(assumptions).slice(0, 8);
}

function detectNfrs(project: ProjectRecord): string[] {
  const nfrs = [
    "Reliability: define SLOs per critical workflow and error budget policy",
    "Security: enforce least privilege, key rotation, and encrypted data at rest and in transit",
    "Performance: set p95 latency target for primary user actions and protect throughput under peak load",
    "Operational excellence: standardize runbooks, deployment checks, and rollback paths",
    "Cost optimization: track unit economics per workflow and enforce budget alerts",
  ];
  for (const decision of project.decisions.slice(0, 2)) {
    nfrs.push(
      `Decision-aligned control: ${decision.pillar} -> ${decision.title} (${decision.selectedOption})`,
    );
  }
  return dedupe(nfrs).slice(0, 8);
}

function detectBillingApproach(kind: DomainKind): string[] {
  if (kind === "field-service") {
    return [
      "Bill per completed work order with optional add-on fees and discounts",
      "Track invoice state transitions from draft to paid with full audit history",
      "Support integration-ready payment event hooks for finance reconciliation",
    ];
  }
  return [
    "Start with a simple subscription or usage policy that can evolve without schema breaks",
    "Keep billing calculations deterministic and auditable",
    "Isolate pricing logic behind a dedicated domain service",
  ];
}

function buildFallbackSeed(
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
): ProfileSeed {
  const domainKind = determineDomainKind(project.ideaText);
  const topConflict =
    conflicts.conflicts[0]?.title ??
    "No high-severity conflicts were detected in the current decision set";
  return {
    appName: normalize(project.name) || "Architecture Implementation System",
    tagline:
      domainKind === "field-service"
        ? "Production architecture system for field service delivery"
        : "Production architecture system for workflow delivery",
    problemStatement: normalize(project.ideaSummary || project.ideaText),
    targetUsers: detectTargetUsers(project.ideaText, domainKind),
    goals: [
      ...detectGoals(project),
      `Keep implementation aligned with conflict analysis outcome: ${topConflict}`,
    ],
    workflows: detectWorkflows(project.ideaText, domainKind),
    entities: detectEntities(domainKind),
    architectureComponents: detectArchitectureComponents(domainKind),
    assumptions: detectAssumptions(project),
    nonFunctionalRequirements: detectNfrs(project),
    billingApproach: detectBillingApproach(domainKind),
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
      max_output_tokens: 2200,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
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
      system: systemPrompt,
      max_tokens: 2200,
      temperature: 0.2,
      messages: [{ role: "user", content: userPrompt }],
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

function mergeSeed(base: ProfileSeed, incoming: Partial<ProfileSeed>): ProfileSeed {
  return {
    appName: parseStringValue(incoming.appName, base.appName),
    tagline: parseStringValue(incoming.tagline, base.tagline),
    problemStatement: parseStringValue(
      incoming.problemStatement,
      base.problemStatement,
    ),
    targetUsers: dedupe([...(incoming.targetUsers ?? []), ...base.targetUsers]).slice(0, 5),
    goals: dedupe([...(incoming.goals ?? []), ...base.goals]).slice(0, 8),
    workflows: dedupe([...(incoming.workflows ?? []), ...base.workflows]).slice(0, 6),
    entities: dedupe([...(incoming.entities ?? []), ...base.entities]).slice(0, 8),
    architectureComponents: dedupe([
      ...(incoming.architectureComponents ?? []),
      ...base.architectureComponents,
    ]).slice(0, 8),
    assumptions: dedupe([...(incoming.assumptions ?? []), ...base.assumptions]).slice(
      0,
      10,
    ),
    nonFunctionalRequirements: dedupe([
      ...(incoming.nonFunctionalRequirements ?? []),
      ...base.nonFunctionalRequirements,
    ]).slice(0, 10),
    billingApproach: dedupe([
      ...(incoming.billingApproach ?? []),
      ...base.billingApproach,
    ]).slice(0, 6),
  };
}

async function maybeEnrichSeedWithProvider(
  seed: ProfileSeed,
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
  providerConfig?: AssistantProviderConfig,
): Promise<ProfileSeed> {
  if (!providerConfig?.apiKey?.trim() || !providerConfig.model?.trim()) {
    return seed;
  }

  const systemPrompt =
    "You design implementation-ready software architecture plans. Return strict JSON only with keys appName,tagline,problemStatement,targetUsers,goals,workflows,entities,architectureComponents,assumptions,nonFunctionalRequirements,billingApproach. Every value must be specific to the project context. No markdown.";
  const userPrompt = JSON.stringify({
    project: {
      id: project.id,
      name: project.name,
      idea: project.ideaText,
      ideaSummary: project.ideaSummary,
      currentFocus: project.currentFocus,
      decisions: project.decisions.map((decision) => ({
        pillar: decision.pillar,
        title: decision.title,
        selectedOption: decision.selectedOption,
        rationale: decision.rationale,
        status: decision.status,
      })),
      openQuestions: project.suggestedOpenQuestions,
      inferredMissingAreas: project.inferredMissingAreas,
      risks: project.risks,
    },
    conflicts: conflicts.conflicts.map((conflict) => ({
      title: conflict.title,
      severity: conflict.severity,
      whyItMatters: conflict.whyItMatters,
      recommendation: conflict.recommendation,
      involvedPillars: conflict.involvedPillars,
    })),
    requiredStructure: {
      workflows: "4 to 6 implementation workflows",
      entities: "6 to 8 domain entities",
      architectureComponents: "5 to 8 concrete components",
      nonFunctionalRequirements: "5 to 8 measurable controls",
      billingApproach: "2 to 4 billing architecture notes",
    },
    fallbackSeed: seed,
  });

  const payload = await callProviderJson(providerConfig, systemPrompt, userPrompt);
  if (!payload) {
    throw new Error(
      "Provider response for output pack generation could not be parsed as JSON.",
    );
  }

  const enriched: Partial<ProfileSeed> = {
    appName: parseStringValue(payload.appName, seed.appName),
    tagline: parseStringValue(payload.tagline, seed.tagline),
    problemStatement: parseStringValue(payload.problemStatement, seed.problemStatement),
    targetUsers: parseStringArray(payload.targetUsers, 5),
    goals: parseStringArray(payload.goals, 8),
    workflows: parseStringArray(payload.workflows, 6),
    entities: parseStringArray(payload.entities, 8),
    architectureComponents: parseStringArray(payload.architectureComponents, 8),
    assumptions: parseStringArray(payload.assumptions, 10),
    nonFunctionalRequirements: parseStringArray(payload.nonFunctionalRequirements, 10),
    billingApproach: parseStringArray(payload.billingApproach, 6),
  };

  return mergeSeed(seed, enriched);
}

function roleResponsibilities(roleName: string, kind: DomainKind): string[] {
  const lower = roleName.toLowerCase();
  if (lower.includes("customer")) {
    return [
      "Create and review requests",
      "Track progress and receive updates",
      "Approve completion and billing outcomes",
    ];
  }
  if (lower.includes("technician") || lower.includes("field")) {
    return [
      "Accept assignments and execute work",
      "Update status checkpoints and evidence",
      "Capture completion notes and handoff details",
    ];
  }
  if (lower.includes("manager") || lower.includes("dispatch")) {
    return [
      "Prioritize and assign workflow execution",
      "Monitor SLA adherence and blockers",
      "Resolve escalations and approve overrides",
    ];
  }
  if (lower.includes("admin")) {
    return [
      "Manage access, policies, and environment settings",
      "Review audit trails and compliance posture",
      "Maintain platform configuration standards",
    ];
  }
  if (kind === "field-service") {
    return [
      "Coordinate request throughput and staffing",
      "Track job quality and completion rate",
      "Collaborate with finance and customer operations",
    ];
  }
  return [
    "Operate the core workflow safely",
    "Review system health and quality outcomes",
    "Collaborate on continuous improvement",
  ];
}

function buildRoles(seed: ProfileSeed, kind: DomainKind): RoleDefinition[] {
  const candidates = [...seed.targetUsers, "Platform administrators"];
  return dedupe(candidates)
    .slice(0, 5)
    .map((name) => ({
      name,
      responsibilities: roleResponsibilities(name, kind),
    }));
}

function buildWorkflowDefinitions(
  seed: ProfileSeed,
  roles: RoleDefinition[],
): WorkflowDefinition[] {
  const primaryRole = roles[0]?.name ?? "Primary user";
  const secondaryRole = roles[1]?.name ?? "Operations team";
  return seed.workflows.slice(0, 5).map((workflow, index) => {
    const actor = index % 2 === 0 ? primaryRole : secondaryRole;
    return {
      name: workflow,
      actor,
      trigger:
        index === 0
          ? "A user submits or updates a business request"
          : "A prior workflow state reaches a transition checkpoint",
      steps: [
        "Validate caller identity and permissions",
        "Apply domain rules and persist state transitions",
        "Emit integration events for dependent workflows",
        "Publish user-facing status updates",
      ],
      outcome: `${workflow} completes with a persisted audit trail and actionable next step`,
    };
  });
}

function inferEntityDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("customer")) {
    return "Represents the account receiving the business service";
  }
  if (lower.includes("request")) {
    return "Captures the initial demand and triage details";
  }
  if (lower.includes("workorder") || lower.includes("work-order")) {
    return "Tracks execution scope, ownership, and completion checkpoints";
  }
  if (lower.includes("technician")) {
    return "Represents staff assigned to field or operational execution";
  }
  if (lower.includes("status")) {
    return "Stores immutable progress events emitted during execution";
  }
  if (lower.includes("invoice") || lower.includes("billing")) {
    return "Represents monetization and financial settlement details";
  }
  if (lower.includes("notification")) {
    return "Represents outbound communication intents and delivery state";
  }
  return `Represents the ${name} domain concept used by core workflows`;
}

function inferEntityFields(name: string): EntityField[] {
  const normalized = normalize(name);
  const lower = normalized.toLowerCase();
  const base: EntityField[] = [
    {
      name: `${toPathSegment(normalized)}Id`,
      type: "string (uuid)",
      description: "Stable identifier for this record",
    },
    {
      name: "status",
      type: "string",
      description: "Lifecycle state used by workflow orchestration",
    },
    {
      name: "createdAt",
      type: "string (ISO-8601)",
      description: "Creation timestamp",
    },
    {
      name: "updatedAt",
      type: "string (ISO-8601)",
      description: "Most recent update timestamp",
    },
  ];

  if (lower.includes("customer")) {
    return [
      { name: "customerId", type: "string (uuid)", description: "Customer identifier" },
      { name: "fullName", type: "string", description: "Customer display name" },
      { name: "email", type: "string", description: "Primary contact email" },
      { name: "phoneNumber", type: "string", description: "Primary contact phone" },
      { name: "notificationPreference", type: "string", description: "SMS, email, or both" },
      ...base.slice(2),
    ];
  }

  if (lower.includes("technician")) {
    return [
      { name: "technicianId", type: "string (uuid)", description: "Technician identifier" },
      { name: "displayName", type: "string", description: "Technician name" },
      { name: "skillTags", type: "string[]", description: "Service capability tags" },
      { name: "availabilityState", type: "string", description: "Availability for dispatch" },
      ...base.slice(2),
    ];
  }

  if (lower.includes("request")) {
    return [
      { name: "serviceRequestId", type: "string (uuid)", description: "Request identifier" },
      { name: "customerId", type: "string (uuid)", description: "Request owner" },
      { name: "requestedServiceType", type: "string", description: "Requested service category" },
      { name: "priority", type: "string", description: "Priority classification" },
      ...base.slice(1),
    ];
  }

  if (lower.includes("workorder") || lower.includes("work-order")) {
    return [
      { name: "workOrderId", type: "string (uuid)", description: "Work order identifier" },
      { name: "serviceRequestId", type: "string (uuid)", description: "Linked request" },
      { name: "assignedTechnicianId", type: "string (uuid)", description: "Assigned owner" },
      { name: "scheduledWindowStart", type: "string (ISO-8601)", description: "Window start" },
      { name: "scheduledWindowEnd", type: "string (ISO-8601)", description: "Window end" },
      ...base.slice(1),
    ];
  }

  if (lower.includes("invoice")) {
    return [
      { name: "invoiceId", type: "string (uuid)", description: "Invoice identifier" },
      { name: "workOrderId", type: "string (uuid)", description: "Linked work order" },
      { name: "currencyCode", type: "string", description: "Billing currency" },
      { name: "totalAmount", type: "number", description: "Total invoice amount" },
      ...base.slice(1),
    ];
  }

  return base;
}

function buildEntityDefinitions(seed: ProfileSeed): EntityDefinition[] {
  const entities = seed.entities.slice(0, 7);
  return entities.map((entity, index) => {
    const next = entities[(index + 1) % entities.length];
    return {
      name: titleCase(entity).replace(/\s+/g, ""),
      description: inferEntityDescription(entity),
      keyFields: inferEntityFields(entity),
      relationships: [
        `References ${titleCase(next).replace(/\s+/g, "")} through business workflow transitions`,
        "Generates auditable state changes consumed by downstream processes",
      ],
    };
  });
}

function buildApiEndpoints(
  entities: EntityDefinition[],
  roles: RoleDefinition[],
): ApiEndpointDefinition[] {
  const primary = entities[0]?.name ?? "WorkItem";
  const secondary = entities[1]?.name ?? "Assignment";
  const primaryCollection = toPathSegment(pluralize(primary));
  const secondaryCollection = toPathSegment(pluralize(secondary));
  const actor = roles[0]?.name ?? "Primary user";

  return [
    {
      method: "POST",
      path: "/api/v1/auth/session",
      purpose: "Authenticate user and establish scoped session",
      actor,
      requestShape: ["identityProviderToken", "deviceContext", "requestedRole"],
      responseShape: ["sessionToken", "expiresAt", "grantedPermissions"],
    },
    {
      method: "GET",
      path: "/api/v1/profile",
      purpose: "Return current user profile and effective permissions",
      actor,
      requestShape: ["Authorization header"],
      responseShape: ["userId", "roles", "permissions", "featureFlags"],
    },
    {
      method: "POST",
      path: `/api/v1/${primaryCollection}`,
      purpose: `Create a ${primary} and initialize workflow state`,
      actor,
      requestShape: ["payload", "requestedPriority", "idempotencyKey"],
      responseShape: [`${toPathSegment(primary)}Id`, "status", "createdAt"],
    },
    {
      method: "GET",
      path: `/api/v1/${primaryCollection}/{id}`,
      purpose: `Fetch ${primary} details and lifecycle history`,
      actor,
      requestShape: ["id path parameter"],
      responseShape: ["record", "transitions", "relatedLinks"],
    },
    {
      method: "PATCH",
      path: `/api/v1/${primaryCollection}/{id}/status`,
      purpose: `Apply a controlled status transition on ${primary}`,
      actor,
      requestShape: ["targetStatus", "reason", "metadata"],
      responseShape: ["status", "updatedAt", "emittedEvents"],
    },
    {
      method: "GET",
      path: `/api/v1/${secondaryCollection}`,
      purpose: `List ${secondary} records for planner and operator views`,
      actor: roles[1]?.name ?? actor,
      requestShape: ["filters", "pagination"],
      responseShape: ["items", "pageInfo", "summary"],
    },
    {
      method: "GET",
      path: "/api/v1/dashboard/summary",
      purpose: "Return operational and reliability summary metrics",
      actor: roles[2]?.name ?? actor,
      requestShape: ["dateRange"],
      responseShape: ["kpis", "slaBreaches", "backlogHealth"],
    },
  ];
}

function buildObservabilitySignals(workflows: WorkflowDefinition[]): string[] {
  const signals = [
    "Request throughput per minute by workflow and actor",
    "p95 latency for read and write API endpoints",
    "Error budget burn rate and incident trigger thresholds",
    "Queue depth and background worker processing lag",
    "Status transition success vs rollback ratio",
  ];
  for (const workflow of workflows.slice(0, 2)) {
    signals.push(`Workflow KPI: ${workflow.name} completion rate`);
  }
  return dedupe(signals).slice(0, 8);
}

function buildDomainProfile(seed: ProfileSeed, project: ProjectRecord): DomainProfile {
  const kind = determineDomainKind(project.ideaText);
  const roles = buildRoles(seed, kind);
  const workflows = buildWorkflowDefinitions(seed, roles);
  const entities = buildEntityDefinitions(seed);
  const apiEndpoints = buildApiEndpoints(entities, roles);

  return {
    appName: seed.appName,
    slug: slugify(seed.appName) || slugify(project.name) || "implementation-system",
    tagline: seed.tagline,
    problemStatement: seed.problemStatement,
    targetUsers: seed.targetUsers,
    roles,
    goals: seed.goals,
    workflows,
    entities,
    apiEndpoints,
    architectureComponents: seed.architectureComponents,
    assumptions: seed.assumptions,
    nonFunctionalRequirements: seed.nonFunctionalRequirements,
    billingApproach: seed.billingApproach,
    observabilitySignals: buildObservabilitySignals(workflows),
  };
}

function renderWorkflowTable(profile: DomainProfile): string {
  const header = "| workflow | primary actor | trigger | outcome |\n|---|---|---|---|";
  const rows = profile.workflows
    .map(
      (workflow) =>
        `| ${workflow.name} | ${workflow.actor} | ${workflow.trigger} | ${workflow.outcome} |`,
    )
    .join("\n");
  return `${header}\n${rows}`;
}

function renderEntitySummaryTable(profile: DomainProfile): string {
  const header = "| entity | purpose |\n|---|---|";
  const rows = profile.entities
    .map((entity) => `| ${entity.name} | ${entity.description} |`)
    .join("\n");
  return `${header}\n${rows}`;
}

function renderApiTable(profile: DomainProfile): string {
  const header = "| method | path | purpose | actor |\n|---|---|---|---|";
  const rows = profile.apiEndpoints
    .map(
      (api) => `| ${api.method} | ${api.path} | ${api.purpose} | ${api.actor} |`,
    )
    .join("\n");
  return `${header}\n${rows}`;
}

function buildProjectOverview(
  profile: DomainProfile,
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
  generatedAt: string,
): string {
  const highConflicts = conflicts.conflicts
    .filter((conflict) => conflict.severity === "high")
    .map((conflict) => `${conflict.title} -> ${conflict.recommendation}`);
  const decisions = project.decisions.map(
    (decision) => `${decision.pillar}: ${decision.title} -> ${decision.selectedOption}`,
  );

  return `# PROJECT_OVERVIEW

## source of truth
This file is the authoritative source for implementation scope and execution order for **${profile.appName}**. If any file conflicts with this document, update that file to match this overview.

## generated context
- generated at: ${generatedAt}
- project id: ${project.id}
- product name: ${profile.appName}
- tagline: ${profile.tagline}

## problem statement
${profile.problemStatement}

## target users
${markdownList(profile.targetUsers)}

## core goals
${markdownList(profile.goals)}

## core workflows
${renderWorkflowTable(profile)}

## architecture blueprint
${markdownList(profile.architectureComponents)}

## domain model summary
${renderEntitySummaryTable(profile)}

## key decisions already captured
${markdownList(decisions.length > 0 ? decisions : ["No decisions captured yet. Use task 002 and task 003 to lock architecture constraints before coding."])}

## open risks and conflicts
${markdownList(
  highConflicts.length > 0
    ? highConflicts
    : ["No high-severity conflicts detected. Continue validating medium and low tradeoffs."],
)}

## non-functional requirements
${markdownList(profile.nonFunctionalRequirements)}

## assumptions to validate
${markdownList(profile.assumptions)}

## implementation sequence
1. Complete plans in \`plans/\` and lock specs in \`specs/\`
2. Execute tasks in \`tasks/\` strictly in numerical order
3. Record any architecture changes in \`decisions/\`
4. Keep \`status/\` current at the end of every task
`;
}

function buildAgentsGuide(profile: DomainProfile): string {
  return `# AGENTS

## mission
Build and ship **${profile.appName}** using this output pack as the implementation operating system.

## required execution order
1. Read \`PROJECT_OVERVIEW.md\` fully
2. Read every document in \`plans/\`
3. Lock implementation details in \`specs/\`
4. Execute tasks in \`tasks/\` from 001 to 010
5. Update \`status/\` after each completed task
6. Log architecture changes in \`decisions/\` before coding diverges

## guardrails
- Treat \`PROJECT_OVERVIEW.md\` as the source of truth
- Do not start a task until all dependencies listed in that task are complete
- Do not change API or data contracts without updating matching files in \`specs/\`
- Every pull request must cite task id, changed specs, and impacted decisions
- Any unresolved blocker must be recorded in \`status/blockers.md\` the same day

## quality bar
- Tests exist for core API and state transitions
- Authentication and authorization are enforced at boundary handlers
- Observability includes logs, metrics, traces, and actionable alerts
- Deployment flow includes rollback and smoke checks
- Documentation reflects implemented behavior, not intended behavior
`;
}

function buildRootReadme(profile: DomainProfile): string {
  return `# ${profile.appName} implementation system

This package contains an implementation-ready system for building ${profile.appName} with production constraints.

## quick start
1. Read \`PROJECT_OVERVIEW.md\`
2. Review \`plans/README.md\`
3. Confirm contracts in \`specs/README.md\`
4. Start with \`tasks/001-bootstrap-repo.md\`

## package map
- \`plans/\`: architecture plans that define implementation strategy
- \`tasks/\`: sequential execution backlog
- \`specs/\`: implementation contracts and structures
- \`decisions/\`: decision records and governance rules
- \`status/\`: execution tracking and blockers
- \`templates/\`: reusable authoring formats for future updates
`;
}

function buildPlansReadme(profile: DomainProfile): string {
  return `# plans

These plans convert the project overview into implementation strategy for ${profile.appName}.

## plan files
1. \`authentication.md\`: identity, session, role, and permission architecture
2. \`data-model.md\`: entity boundaries, relationships, and migration strategy
3. \`api-architecture.md\`: API modules, contracts, and operational controls
4. \`frontend-shell.md\`: route shell, state boundaries, and UX flow
5. \`billing.md\`: monetization foundation and financial event model

## completion criteria
- Every plan references at least one supporting spec document
- All plan assumptions are tracked in \`status/blockers.md\` or resolved in specs
`;
}

function buildAuthenticationPlan(profile: DomainProfile): string {
  const roleSummary = profile.roles
    .map((role) => `- ${role.name}: ${role.responsibilities.join("; ")}`)
    .join("\n");
  return `# authentication plan

## objective
Implement secure identity and permission boundaries for ${profile.appName} before business workflows ship.

## strategy
- Use centralized identity provider integration with short-lived sessions
- Resolve permissions from role assignments and scoped policy rules
- Enforce authorization at API entry points and UI route guards

## roles and responsibilities
${roleSummary}

## implementation steps
1. Define identity adapter and token verification middleware
2. Create role-to-permission matrix in \`specs/permissions-matrix.md\`
3. Add route-level guard utilities in frontend shell
4. Add authorization checks for every mutating API endpoint
5. Add audit logging for privileged actions

## test expectations
- Unauthorized requests fail with deterministic error shapes
- Privileged operations are accepted only with explicit permissions
- Session expiration and refresh behavior are deterministic
`;
}

function buildDataModelPlan(profile: DomainProfile): string {
  const entities = profile.entities
    .map((entity) => `- ${entity.name}: ${entity.description}`)
    .join("\n");
  return `# data model plan

## objective
Establish a stable transactional data model that supports all committed workflows for ${profile.appName}.

## entity boundaries
${entities}

## implementation steps
1. Create schema definitions for each entity in \`specs/data-entities.md\`
2. Add migration strategy with backward-compatible rollout order
3. Define indexes around lookup paths used by core workflows
4. Add status transition persistence model with immutable history events
5. Add data retention and archival policy notes

## migration order
1. Identity and account entities
2. Request and workflow entities
3. Status and event entities
4. Billing and reconciliation entities

## quality checks
- Every relation is explicit and documented
- Referential integrity is enforced for primary workflow joins
- Seed and rollback scripts are deterministic
`;
}

function buildApiArchitecturePlan(profile: DomainProfile): string {
  return `# api architecture plan

## objective
Deliver a production-safe API shell for ${profile.appName} that enforces auth, validation, telemetry, and contract stability.

## contract surface
${renderApiTable(profile)}

## module boundaries
- auth module: identity and session management
- ${toPathSegment(pluralize(profile.entities[0]?.name ?? "work-item"))} module: primary workflow orchestration
- ${toPathSegment(pluralize(profile.entities[1]?.name ?? "assignment"))} module: planning and assignment views
- observability module: health, telemetry, and operational diagnostics
- billing module: invoice lifecycle and settlement events

## implementation steps
1. Implement typed request and response DTOs from \`specs/dto-examples.md\`
2. Add schema validation at controller boundaries
3. Add idempotency support for write endpoints
4. Add per-endpoint permission checks
5. Add structured logs and trace attributes for every request
`;
}

function buildFrontendShellPlan(profile: DomainProfile): string {
  const primaryWorkflow = profile.workflows[0]?.name ?? "Primary workflow";
  return `# frontend shell plan

## objective
Build a resilient frontend shell for ${profile.appName} with predictable route, state, and permission boundaries.

## route shell principles
- route ownership is tied to workflow ownership
- every route has explicit auth guard requirements
- async boundaries expose loading, empty, and failure states
- telemetry is emitted on route entry and critical actions

## implementation steps
1. Define route map in \`specs/route-map.md\`
2. Build shell layout with authenticated and unauthenticated segments
3. Build state containers aligned to API modules
4. Implement action feedback and optimistic update safety rules
5. Add instrumentation for ${primaryWorkflow}

## release gates
- shell navigates without unauthorized data exposure
- every route has deterministic fallback and error treatment
- role changes are reflected without client restart
`;
}

function buildBillingPlan(profile: DomainProfile): string {
  return `# billing plan

## objective
Create a reliable monetization foundation for ${profile.appName} that can evolve without breaking workflow execution.

## billing architecture
${markdownList(profile.billingApproach)}

## implementation steps
1. Model invoice and pricing entities in \`specs/data-entities.md\`
2. Define billing endpoints and DTOs in \`specs/api-contracts.md\` and \`specs/dto-examples.md\`
3. Add billing state machine in \`specs/state-machines.md\`
4. Add audit and reconciliation events for every billing transition
5. Add failure handling paths for payment provider errors

## controls
- idempotent invoice generation
- deterministic tax and discount application
- immutable billing event history
`;
}

function buildTasksReadme(): string {
  return `# tasks

Tasks are the execution engine. Complete them in numerical order and keep status artifacts current.

## sequencing rules
- do not skip task numbers
- do not mark a task done without verification evidence
- do not introduce scope outside the linked plans and specs without a decision record
`;
}

function buildTaskDocument(
  id: string,
  title: string,
  objective: string,
  dependencies: string[],
  steps: string[],
  doneCriteria: string[],
): string {
  return `# task ${id}: ${title}

## objective
${objective}

## dependencies
${markdownList(dependencies)}

## implementation steps
${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## done criteria
${markdownList(doneCriteria)}

## status update requirement
After completion, update:
- \`status/current-status.md\`
- \`status/task-board.md\`
- \`status/next-task.md\`
`;
}

function buildDecisionsReadme(): string {
  return `# decisions

This folder holds architecture decision records used to prevent implementation drift.

## required rules
- every material architecture change requires a new decision record
- decision status must be one of proposed, accepted, superseded, or rejected
- decisions must include consequences and rollback impact
`;
}

function buildAdrTemplate(profile: DomainProfile): string {
  return `# adr template

## id
ADR-XXX

## title
Short decision title for ${profile.appName}

## status
proposed

## context
Describe the concrete implementation problem and constraints

## decision
State the chosen approach with enough detail to implement it

## consequences
- positive outcomes
- negative tradeoffs
- operational impacts

## follow-up tasks
- link to task ids that enforce this decision
`;
}

function buildSpecsReadme(profile: DomainProfile): string {
  return `# specs

Specifications define implementation contracts for ${profile.appName}. Engineering work must follow these files.

## spec index
- \`api-contracts.md\`
- \`data-entities.md\`
- \`route-map.md\`
- \`permissions-matrix.md\`
- \`state-machines.md\`
- \`design-tokens.md\`
- \`dto-examples.md\`

## contract rules
- contract changes require a matching task and decision record
- breaking changes require migration notes and rollout gates
`;
}

function buildApiContractsSpec(profile: DomainProfile): string {
  const sections = profile.apiEndpoints.map((endpoint) => {
    return `### ${endpoint.method} ${endpoint.path}

- purpose: ${endpoint.purpose}
- actor: ${endpoint.actor}
- request fields:
${markdownList(endpoint.requestShape)}
- response fields:
${markdownList(endpoint.responseShape)}
`;
  });
  return `# api contracts

## endpoint catalog
${renderApiTable(profile)}

## endpoint details
${sections.join("\n")}

## contract governance
- maintain backward compatibility for published fields
- version new contract shapes instead of mutating old ones in place
`;
}

function buildDataEntitiesSpec(profile: DomainProfile): string {
  const entitySections = profile.entities
    .map((entity) => {
      const fieldRows = entity.keyFields
        .map(
          (field) =>
            `| ${field.name} | ${field.type} | ${field.description} |`,
        )
        .join("\n");
      return `### ${entity.name}

${entity.description}

| field | type | description |
|---|---|---|
${fieldRows}

relationships:
${markdownList(entity.relationships)}
`;
    })
    .join("\n");

  return `# data entities

## entity summary
${renderEntitySummaryTable(profile)}

## entity definitions
${entitySections}

## persistence controls
- enforce optimistic concurrency on mutable workflow records
- persist immutable status events for audit and replay
- avoid hard deletes for critical business entities
`;
}

function buildRouteMapSpec(profile: DomainProfile): string {
  const workflowRoutes = profile.workflows.map((workflow, index) => {
    const route = index === 0 ? "/app/dashboard" : `/app/workflows/${index + 1}`;
    return `| ${route} | ${workflow.actor} | ${workflow.name} |`;
  });
  return `# route map

| route | actor | purpose |
|---|---|---|
| /login | All users | Authenticate and establish session |
| /app | Authenticated users | Shell layout and global navigation |
${workflowRoutes.join("\n")}
| /app/settings | Platform administrators | Manage policy and operational settings |

## route constraints
- every route enforces permission guards before data fetches
- route-level telemetry includes actor role and workflow context
- destructive actions require explicit confirmation paths
`;
}

function buildPermissionsMatrixSpec(profile: DomainProfile): string {
  const actions = [
    "View dashboard",
    "Create primary record",
    "Update status transitions",
    "Manage assignments",
    "View billing details",
    "Administer platform settings",
  ];

  const roleHeaders = profile.roles.map((role) => role.name);
  const header = `| action | ${roleHeaders.join(" | ")} |\n|---|${roleHeaders
    .map(() => "---")
    .join("|")}|`;

  const rows = actions.map((action, index) => {
    const flags = profile.roles.map((_, roleIndex) => {
      if (roleIndex === profile.roles.length - 1) {
        return "allow";
      }
      if (index <= 1 && roleIndex <= 1) {
        return "allow";
      }
      if (index <= 3 && roleIndex === 1) {
        return "allow";
      }
      if (index === 4 && roleIndex <= 1) {
        return "allow";
      }
      return "deny";
    });
    return `| ${action} | ${flags.join(" | ")} |`;
  });

  return `# permissions matrix

${header}
${rows.join("\n")}

## enforcement notes
- authorization checks occur at both API and UI boundaries
- permission snapshots are included in session claims
- privileged operations are audit logged with actor identity and reason
`;
}

function buildStateMachinesSpec(profile: DomainProfile): string {
  const primaryEntity = profile.entities[2]?.name ?? profile.entities[0]?.name ?? "WorkItem";
  const billingEntity =
    profile.entities.find((entity) => entity.name.toLowerCase().includes("invoice"))?.name ??
    "Invoice";

  return `# state machines

## ${primaryEntity} lifecycle
\`\`\`mermaid
stateDiagram-v2
  [*] --> created
  created --> scheduled: assignment accepted
  scheduled --> in_progress: work started
  in_progress --> blocked: dependency failed
  blocked --> in_progress: blocker resolved
  in_progress --> completed: execution done
  completed --> closed: verification accepted
\`\`\`

## ${billingEntity} lifecycle
\`\`\`mermaid
stateDiagram-v2
  [*] --> draft
  draft --> issued: approval complete
  issued --> paid: payment posted
  issued --> disputed: customer dispute raised
  disputed --> issued: dispute resolved
  paid --> settled: reconciliation finished
\`\`\`

## transition controls
- transitions are validated by domain service policies
- illegal transitions return deterministic contract errors
- every transition emits audit and telemetry events
`;
}

function buildDesignTokensSpec(profile: DomainProfile): string {
  return `# design tokens

## token intent
Design tokens keep ${profile.appName} UI delivery consistent across dispatcher, operator, and customer views.

## color tokens
\`\`\`css
:root {
  --color-brand-strong: #0b5f86;
  --color-brand-accent: #2c8fbf;
  --color-surface-bg: #f4f7fb;
  --color-surface-card: #ffffff;
  --color-text-primary: #13263a;
  --color-text-muted: #4b6378;
  --color-success: #147a50;
  --color-warning: #b26a00;
  --color-danger: #b42328;
}
\`\`\`

## typography tokens
- font family primary: "Segoe UI", "Helvetica Neue", sans-serif
- font size scale: 12, 14, 16, 20, 28
- heading weight: 600
- body weight: 400

## spacing and radius
- spacing scale: 4, 8, 12, 16, 24, 32
- border radius: 6 for controls, 10 for cards
`;
}

function buildDtoExamplesSpec(profile: DomainProfile): string {
  const primaryEndpoint = profile.apiEndpoints.find(
    (endpoint) => endpoint.method === "POST" && endpoint.path.includes("/api/v1/"),
  );
  const primaryIdField = `${toPathSegment(profile.entities[0]?.name ?? "record")}Id`;
  const primaryPath = primaryEndpoint?.path ?? "/api/v1/work-items";

  return `# dto examples

## create request example
\`\`\`json
{
  "requestedBy": "user-123",
  "title": "Priority service request",
  "description": "Customer reported a critical issue requiring same-day response",
  "priority": "high",
  "idempotencyKey": "create-${profile.slug}-001"
}
\`\`\`

## create response example
\`\`\`json
{
  "${primaryIdField}": "rec-9d9e2e62",
  "status": "created",
  "createdAt": "2026-01-15T14:08:00Z",
  "links": {
    "self": "${primaryPath}/rec-9d9e2e62",
    "status": "${primaryPath}/rec-9d9e2e62/status"
  }
}
\`\`\`

## status transition request example
\`\`\`json
{
  "targetStatus": "in_progress",
  "reason": "Technician arrived onsite and started execution",
  "metadata": {
    "actorId": "tech-0024",
    "actorRole": "Service technicians"
  }
}
\`\`\`

## error response example
\`\`\`json
{
  "code": "authorization_denied",
  "message": "The current role cannot perform this status transition",
  "correlationId": "req-7f2bc9c1",
  "details": [
    "required permission: workorder.transition"
  ]
}
\`\`\`
`;
}

function buildStatusReadme(): string {
  return `# status

Status files provide execution transparency and governance.

## files
- \`current-status.md\`: current health and completion summary
- \`task-board.md\`: task-level state and ownership
- \`blockers.md\`: active blockers and mitigation plans
- \`next-task.md\`: immediate actionable work item
`;
}

function buildCurrentStatus(
  profile: DomainProfile,
  project: ProjectRecord,
  conflicts: ConflictAnalysisResponse,
  generatedAt: string,
): string {
  const high = conflicts.conflicts.filter((conflict) => conflict.severity === "high").length;
  const medium = conflicts.conflicts.filter(
    (conflict) => conflict.severity === "medium",
  ).length;
  const low = conflicts.conflicts.filter((conflict) => conflict.severity === "low").length;

  return `# current status

- generated at: ${generatedAt}
- product: ${profile.appName}
- decisions captured: ${project.decisions.length}
- conflict counts: high=${high}, medium=${medium}, low=${low}
- workflow definitions: ${profile.workflows.length}
- entity definitions: ${profile.entities.length}
- api contracts: ${profile.apiEndpoints.length}

## summary
The implementation system is initialized and ready for execution starting at task 001.
`;
}

function buildTaskBoard(): string {
  const rows = [
    "| task | title | status | notes |",
    "|---|---|---|---|",
    "| 001 | bootstrap repo | ready | First executable task |",
    "| 002 | foundation architecture | queued | Starts after task 001 is done |",
    "| 003 | auth setup | queued | Requires foundation boundaries |",
    "| 004 | data model foundation | queued | Requires auth and architecture decisions |",
    "| 005 | api shell | queued | Depends on data model and auth contracts |",
    "| 006 | frontend app shell | queued | Depends on route and permissions specs |",
    "| 007 | design system foundation | queued | Depends on frontend shell |",
    "| 008 | observability foundation | queued | Depends on API and frontend telemetry hooks |",
    "| 009 | billing foundation | queued | Depends on core entities and workflow closure |",
    "| 010 | status and governance | queued | Final stabilization and governance pass |",
  ];
  return `# task board\n\n${rows.join("\n")}\n`;
}

function buildBlockers(conflicts: ConflictAnalysisResponse, project: ProjectRecord): string {
  const blockers: string[] = [];
  for (const conflict of conflicts.conflicts.slice(0, 5)) {
    blockers.push(
      `[${conflict.severity}] ${conflict.title} -> ${conflict.recommendation}`,
    );
  }
  for (const question of project.suggestedOpenQuestions.slice(0, 4)) {
    blockers.push(`Open question requires confirmation: ${question}`);
  }
  if (blockers.length === 0) {
    blockers.push("No active blockers. Continue with task execution.");
  }
  return `# blockers\n\n${markdownList(blockers)}\n`;
}

function buildNextTask(profile: DomainProfile): string {
  return `# next task

## task id
001-bootstrap-repo

## objective
Initialize the implementation repository and tooling baseline for ${profile.appName}.

## immediate steps
1. Create project workspace and module layout
2. Add linting, formatting, and test runner configuration
3. Add CI gate for lint, type checks, and unit tests
4. Create initial README with execution notes and environment setup

## handoff
Once complete, update \`status/task-board.md\` and begin task 002.
`;
}

function buildTemplateTask(profile: DomainProfile): string {
  return `# task template

## title
Task XXX - descriptive title for ${profile.appName}

## objective
One outcome-focused sentence

## dependencies
- list required plans, specs, and prior tasks

## implementation steps
1. concrete step
2. concrete step
3. concrete step

## done criteria
- measurable completion check
- test or validation evidence
`;
}

function buildTemplatePlan(profile: DomainProfile): string {
  return `# plan template

## objective
Define the implementation strategy for a focused architecture area in ${profile.appName}

## scope
- in scope
- out of scope

## design
- constraints
- module boundaries
- integration points

## rollout
1. milestone one
2. milestone two
`;
}

function buildTemplateSpec(profile: DomainProfile): string {
  return `# spec template

## contract name
Name of contract for ${profile.appName}

## purpose
What this contract guarantees

## structure
- field definitions
- allowed transitions
- validation rules

## compatibility
- versioning approach
- migration notes
`;
}

function buildTemplateStatus(profile: DomainProfile): string {
  return `# status template

## date
YYYY-MM-DD

## project
${profile.appName}

## highlights
- completed tasks
- major decisions
- risk changes

## blockers
- blocker and owner

## next step
- exact next task and expected output
`;
}

function buildOutputFiles(options: {
  profile: DomainProfile;
  project: ProjectRecord;
  conflicts: ConflictAnalysisResponse;
  generatedAt: string;
}): Map<string, string> {
  const { profile, project, conflicts, generatedAt } = options;
  const files = new Map<string, string>();

  files.set(
    "PROJECT_OVERVIEW.md",
    buildProjectOverview(profile, project, conflicts, generatedAt),
  );
  files.set("AGENTS.md", buildAgentsGuide(profile));
  files.set("README.md", buildRootReadme(profile));

  files.set("plans/README.md", buildPlansReadme(profile));
  files.set("plans/authentication.md", buildAuthenticationPlan(profile));
  files.set("plans/data-model.md", buildDataModelPlan(profile));
  files.set("plans/api-architecture.md", buildApiArchitecturePlan(profile));
  files.set("plans/frontend-shell.md", buildFrontendShellPlan(profile));
  files.set("plans/billing.md", buildBillingPlan(profile));

  files.set("tasks/README.md", buildTasksReadme());
  files.set(
    "tasks/001-bootstrap-repo.md",
    buildTaskDocument(
      "001",
      "bootstrap repo",
      `Create the implementation repository baseline for ${profile.appName}.`,
      ["PROJECT_OVERVIEW.md", "plans/README.md", "specs/README.md"],
      [
        "Initialize repository structure for frontend, backend, and infrastructure modules",
        "Add linting, formatting, and type-check tooling with pre-commit automation",
        "Add CI workflow for lint, type-check, unit tests, and artifact upload",
        "Add environment template files and local developer bootstrap script",
      ],
      [
        "Repository bootstraps locally with one command",
        "CI checks pass on a clean branch",
        "Tooling documentation exists in repository root README",
      ],
    ),
  );
  files.set(
    "tasks/002-foundation-architecture.md",
    buildTaskDocument(
      "002",
      "foundation architecture",
      "Implement baseline module boundaries and shared platform utilities.",
      ["tasks/001-bootstrap-repo.md", "plans/api-architecture.md"],
      [
        "Create module boundaries for auth, domain workflows, billing, and observability",
        "Implement configuration loading and environment validation",
        "Add shared error, logging, and correlation-id middleware",
        "Document architecture boundaries in code-level README files",
      ],
      [
        "Module dependencies are acyclic and documented",
        "Error and logging conventions are standardized",
        "Architecture boundaries align with plans/api-architecture.md",
      ],
    ),
  );
  files.set(
    "tasks/003-auth-setup.md",
    buildTaskDocument(
      "003",
      "auth setup",
      "Implement identity, session, and permission enforcement paths.",
      [
        "tasks/002-foundation-architecture.md",
        "plans/authentication.md",
        "specs/permissions-matrix.md",
      ],
      [
        "Implement token verification middleware and session management",
        "Implement role and permission resolution service",
        "Apply authorization checks to all mutating API endpoints",
        "Implement frontend route guards and unauthorized UX paths",
      ],
      [
        "Unauthorized calls are blocked with deterministic responses",
        "Permission checks are covered by automated tests",
        "Auth behavior matches specs/permissions-matrix.md",
      ],
    ),
  );
  files.set(
    "tasks/004-data-model-foundation.md",
    buildTaskDocument(
      "004",
      "data model foundation",
      "Implement core entity schema, migrations, and repository adapters.",
      [
        "tasks/002-foundation-architecture.md",
        "plans/data-model.md",
        "specs/data-entities.md",
      ],
      [
        "Create schema and migration files for all core entities",
        "Implement repository interfaces with transaction boundaries",
        "Add optimistic concurrency checks for mutable workflow records",
        "Add deterministic seed data for local development and test",
      ],
      [
        "Migrations run cleanly forward and backward",
        "Entity constraints match specs/data-entities.md",
        "Repository integration tests pass",
      ],
    ),
  );
  files.set(
    "tasks/005-api-shell.md",
    buildTaskDocument(
      "005",
      "api shell",
      "Implement API controllers, validation, contracts, and error handling.",
      [
        "tasks/003-auth-setup.md",
        "tasks/004-data-model-foundation.md",
        "specs/api-contracts.md",
        "specs/dto-examples.md",
      ],
      [
        "Implement endpoint handlers listed in specs/api-contracts.md",
        "Add schema validation for request and response DTOs",
        "Implement idempotency and conflict handling on write endpoints",
        "Attach structured telemetry to request lifecycle hooks",
      ],
      [
        "Contract tests pass for all documented endpoints",
        "Validation failures return documented error shapes",
        "Request tracing data is visible in logs and metrics",
      ],
    ),
  );
  files.set(
    "tasks/006-frontend-app-shell.md",
    buildTaskDocument(
      "006",
      "frontend app shell",
      "Build route shell, state boundaries, and core workflow screens.",
      [
        "tasks/003-auth-setup.md",
        "tasks/005-api-shell.md",
        "specs/route-map.md",
      ],
      [
        "Create route shell and authenticated layout containers",
        "Implement state management for primary workflows",
        "Connect screens to API contracts with resilient error handling",
        "Add role-based visibility rules for route and action controls",
      ],
      [
        "Route map matches specs/route-map.md",
        "Unauthorized routes are blocked correctly",
        "Primary workflows can be completed end-to-end in local environment",
      ],
    ),
  );
  files.set(
    "tasks/007-design-system-foundation.md",
    buildTaskDocument(
      "007",
      "design system foundation",
      "Implement tokenized UI foundation and reusable component primitives.",
      ["tasks/006-frontend-app-shell.md", "specs/design-tokens.md"],
      [
        "Implement token variables and theme primitives",
        "Create base components for typography, buttons, inputs, cards, and alerts",
        "Apply component patterns across primary workflow screens",
        "Document accessibility checks and focus behavior",
      ],
      [
        "UI tokens are applied consistently across shell screens",
        "Core components are reusable and documented",
        "Accessibility baseline checks pass",
      ],
    ),
  );
  files.set(
    "tasks/008-observability-foundation.md",
    buildTaskDocument(
      "008",
      "observability foundation",
      "Ship logs, metrics, traces, and alert definitions for production support.",
      [
        "tasks/005-api-shell.md",
        "tasks/006-frontend-app-shell.md",
        "plans/api-architecture.md",
      ],
      [
        "Instrument API and workflow transitions with structured logs",
        "Publish metrics for latency, throughput, and error rates",
        "Add distributed tracing across critical request paths",
        "Define and test alert thresholds for high-severity failures",
      ],
      [
        "Telemetry coverage includes every critical workflow",
        "Alert rules map to documented runbook actions",
        "Operational dashboard shows key health indicators",
      ],
    ),
  );
  files.set(
    "tasks/009-billing-foundation.md",
    buildTaskDocument(
      "009",
      "billing foundation",
      "Implement invoice and pricing workflows with audit-safe controls.",
      [
        "tasks/004-data-model-foundation.md",
        "tasks/005-api-shell.md",
        "plans/billing.md",
      ],
      [
        "Implement invoice entity lifecycle and service interfaces",
        "Add billing endpoints with strict contract validation",
        "Add reconciliation events for payment state transitions",
        "Add failure and retry handling for payment provider integration points",
      ],
      [
        "Billing state transitions are deterministic and traceable",
        "Invoice generation is idempotent",
        "Billing flows are covered by integration tests",
      ],
    ),
  );
  files.set(
    "tasks/010-status-and-governance.md",
    buildTaskDocument(
      "010",
      "status and governance",
      "Finalize execution governance, hardening checks, and delivery readiness.",
      [
        "tasks/001-bootstrap-repo.md",
        "tasks/009-billing-foundation.md",
        "decisions/README.md",
        "status/README.md",
      ],
      [
        "Validate every completed task against done criteria and evidence",
        "Review unresolved blockers and create mitigation owners",
        "Publish delivery readiness report and deployment checklist",
        "Record final architecture decisions and open follow-up backlog",
      ],
      [
        "Task board reflects true execution state",
        "Blockers have owners and dates",
        "Release readiness report is approved",
      ],
    ),
  );

  files.set("decisions/README.md", buildDecisionsReadme());
  files.set("decisions/001-template-decision-record.md", buildAdrTemplate(profile));
  files.set(
    "decisions/002-use-task-driven-execution.md",
    `# ADR-002 use task-driven execution

## status
accepted

## context
${profile.appName} requires consistent execution across API, data, frontend, and operations. Unordered implementation increases rework and hidden risk.

## decision
Adopt task-driven execution where implementation proceeds strictly through \`tasks/001-010\`, with dependencies enforced and evidence recorded after each task.

## consequences
- positive: predictable delivery flow and clearer ownership
- positive: easier audit and rollback planning
- tradeoff: less flexibility for ad-hoc coding without governance updates

## follow-up
- keep \`status/task-board.md\` current
- reject pull requests that skip task dependency rules
`,
  );
  files.set(
    "decisions/003-use-explicit-specs-as-source-of-truth.md",
    `# ADR-003 use explicit specs as source of truth

## status
accepted

## context
${profile.appName} depends on aligned API, data, and UI contracts. Divergence between implementation and architecture docs can create production defects.

## decision
Require implementation to follow files in \`specs/\` as contract truth. Any breaking or material change must update specs and include a linked decision record before merge.

## consequences
- positive: contract-first development reduces integration failures
- positive: onboarding becomes faster with reliable architecture references
- tradeoff: changes require documentation discipline before code merges

## follow-up
- enforce spec reference in task completion evidence
- include contract checks in CI pipelines
`,
  );

  files.set("specs/README.md", buildSpecsReadme(profile));
  files.set("specs/api-contracts.md", buildApiContractsSpec(profile));
  files.set("specs/data-entities.md", buildDataEntitiesSpec(profile));
  files.set("specs/route-map.md", buildRouteMapSpec(profile));
  files.set("specs/permissions-matrix.md", buildPermissionsMatrixSpec(profile));
  files.set("specs/state-machines.md", buildStateMachinesSpec(profile));
  files.set("specs/design-tokens.md", buildDesignTokensSpec(profile));
  files.set("specs/dto-examples.md", buildDtoExamplesSpec(profile));

  files.set("status/README.md", buildStatusReadme());
  files.set(
    "status/current-status.md",
    buildCurrentStatus(profile, project, conflicts, generatedAt),
  );
  files.set("status/task-board.md", buildTaskBoard());
  files.set("status/blockers.md", buildBlockers(conflicts, project));
  files.set("status/next-task.md", buildNextTask(profile));

  files.set("templates/task-template.md", buildTemplateTask(profile));
  files.set("templates/plan-template.md", buildTemplatePlan(profile));
  files.set("templates/adr-template.md", buildAdrTemplate(profile));
  files.set("templates/spec-template.md", buildTemplateSpec(profile));
  files.set("templates/status-template.md", buildTemplateStatus(profile));

  return files;
}

function assertRequiredFiles(fileMap: Map<string, string>): void {
  const missing = REQUIRED_FILES.filter((file) => !fileMap.has(file));
  if (missing.length > 0) {
    throw new Error(`Output pack generation missing required files: ${missing.join(", ")}`);
  }
  for (const [filePath, content] of fileMap.entries()) {
    if (!normalize(content)) {
      throw new Error(`Generated file is empty: ${filePath}`);
    }
  }
}

async function writeOutputTree(rootDir: string, fileMap: Map<string, string>): Promise<void> {
  for (const dir of REQUIRED_DIRECTORIES) {
    await fs.mkdir(path.join(rootDir, dir), { recursive: true });
  }
  for (const [relativePath, content] of fileMap.entries()) {
    const destination = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, `${content.trimEnd()}\n`, "utf8");
  }
}

async function validateTree(rootDir: string): Promise<void> {
  for (const dir of REQUIRED_DIRECTORIES) {
    const stat = await fs.stat(path.join(rootDir, dir));
    if (!stat.isDirectory()) {
      throw new Error(`Missing required directory: ${dir}`);
    }
  }
  for (const relativeFile of REQUIRED_FILES) {
    const filePath = path.join(rootDir, relativeFile);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`Missing required file: ${relativeFile}`);
    }
    const content = await fs.readFile(filePath, "utf8");
    if (!normalize(content)) {
      throw new Error(`Required file is empty: ${relativeFile}`);
    }
  }
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFilesRecursively(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

async function buildZipFromDirectory(rootDir: string): Promise<Buffer> {
  const zip = new JSZip();
  const files = await listFilesRecursively(rootDir);
  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const content = await fs.readFile(filePath);
    zip.file(relative, content);
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

export interface GenerateOutputPackOptions {
  project: ProjectRecord;
  conflicts: ConflictAnalysisResponse;
  providerConfig?: AssistantProviderConfig;
}

export async function generateOutputPackArchive(
  options: GenerateOutputPackOptions,
): Promise<OutputPackArchive> {
  const generatedAt = new Date().toISOString();
  const fallbackSeed = buildFallbackSeed(options.project, options.conflicts);
  const seed = await maybeEnrichSeedWithProvider(
    fallbackSeed,
    options.project,
    options.conflicts,
    options.providerConfig,
  );
  const profile = buildDomainProfile(seed, options.project);
  const fileMap = buildOutputFiles({
    profile,
    project: options.project,
    conflicts: options.conflicts,
    generatedAt,
  });
  assertRequiredFiles(fileMap);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wavc-output-pack-"));
  const systemRoot = path.join(tempRoot, OUTPUT_FOLDER_NAME);

  try {
    await fs.mkdir(systemRoot, { recursive: true });
    await writeOutputTree(systemRoot, fileMap);
    await validateTree(systemRoot);

    const bytes = await buildZipFromDirectory(systemRoot);
    return {
      fileName: OUTPUT_ZIP_FILE,
      contentType: "application/zip",
      bytes,
      fileCount: REQUIRED_FILES.length,
      generatedAt,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
