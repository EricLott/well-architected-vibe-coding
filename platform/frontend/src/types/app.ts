export type Pillar =
  | "Reliability"
  | "Security"
  | "Cost Optimization"
  | "Operational Excellence"
  | "Performance Efficiency";

export type DecisionStatus = "confirmed" | "proposed" | "unresolved";

export interface DecisionItem {
  id: string;
  title: string;
  description: string;
  selectedOption: string;
  status: DecisionStatus;
  pillar: Pillar;
  rationale: string;
  risks: string[];
  relatedDecisionIds: string[];
}

export type DecisionLinkType =
  | "depends-on"
  | "conflicts-with"
  | "enables"
  | "related";

export interface DecisionLink {
  id: string;
  fromDecisionId: string;
  toDecisionId: string;
  type: DecisionLinkType;
  rationale: string;
}

export interface DecisionGraph {
  nodes: DecisionItem[];
  links: DecisionLink[];
  unresolvedDecisionIds: string[];
}

export interface ProjectState {
  id: string;
  name: string;
  ideaText: string;
  ideaSummary: string;
  currentFocus: string;
  inferredMissingAreas: string[];
  risks: string[];
  suggestedOpenQuestions: string[];
  discoveryQuestions: string[];
  recommendedNextAction: string;
  decisions: DecisionItem[];
  decisionLinks: DecisionLink[];
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalCitation {
  source_path: string;
  heading_path: string[];
  title: string;
}

export interface RetrievalResult {
  chunk_id: string;
  score: number;
  citation: RetrievalCitation;
  metadata: Record<string, unknown>;
  content: string;
}

export interface RetrievalResponse {
  query: string;
  results: RetrievalResult[];
}

export interface RetrievalRequest {
  query: string;
  topK?: number;
  filters?: {
    pillar?: string[];
    doc_group?: string[];
    service_name?: string[];
    workload_name?: string[];
    content_type?: string[];
  };
}

export type WorkflowPhase = "idea-intake" | "project-initialized";

export interface ProjectListResponse {
  projects: ProjectState[];
}

export interface ProjectResponse {
  project: ProjectState;
}

export interface PillarQuestion {
  id: string;
  pillar: Pillar;
  question: string;
  whyItMatters: string;
  riskIfIgnored: string;
  suggestedDefault: string | null;
}

export interface PillarGuidance {
  projectId: string;
  pillar: Pillar;
  recommendedFocus: string;
  questions: PillarQuestion[];
  retrievedGuidance: RetrievalResult[];
}

export type ConflictSeverity = "high" | "medium" | "low";

export interface CrossPillarConflict {
  id: string;
  title: string;
  description: string;
  severity: ConflictSeverity;
  involvedPillars: Pillar[];
  decisionIds: string[];
  whyItMatters: string;
  recommendation: string;
  relatedGuidance: RetrievalResult[];
}

export interface ConflictAnalysis {
  projectId: string;
  generatedAt: string;
  summary: string;
  conflicts: CrossPillarConflict[];
}

export interface ArchitectureSummaryOutput {
  systemOverview: string[];
  pillarStrengths: string[];
  pillarGaps: string[];
}

export interface RiskReportOutput {
  topRisks: string[];
  mitigationActions: string[];
}

export interface PromptPackOutput {
  masterSystemPrompt: string;
  layerPrompts: {
    frontend: string;
    backend: string;
    data: string;
    devops: string;
  };
  featurePrompts: string[];
  buildBacklog: string[];
}

export interface GeneratedOutputs {
  architectureSummary: ArchitectureSummaryOutput;
  riskReport: RiskReportOutput;
  openQuestions: string[];
  promptPack: PromptPackOutput;
  generatedAt: string;
}

export interface DecisionGraphResponse {
  projectId: string;
  graph: DecisionGraph;
}

export interface OutputsResponse {
  projectId: string;
  outputs: GeneratedOutputs;
}

export type AiProvider = "openai" | "anthropic";

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AssistantGuideQuestion {
  question: string;
  whyItMatters: string;
  riskIfIgnored: string;
}

export interface AssistantGuideResponse {
  phase: string;
  summary: string;
  nextActions: string[];
  questions: AssistantGuideQuestion[];
  retrievedGuidance: RetrievalResult[];
  generatedAt: string;
  providerUsed: AiProvider | "heuristic";
  providerModel: string | null;
  warning: string | null;
}

export interface AppState {
  currentPhase: WorkflowPhase;
  pillarFocus: string;
  projectSummary: string;
  questions: string[];
  decisions: DecisionItem[];
  risks: string[];
  openQuestions: string[];
  nextStep: string;
  intakeText: string;
  currentProject: ProjectState | null;
  intakeLoading: boolean;
  intakeError: string | null;
  retrievalQuery: string;
  retrievedGuidance: RetrievalResult[];
  retrievalLoading: boolean;
  retrievalError: string | null;
  appLoading: boolean;
  appError: string | null;
  selectedPillar: Pillar;
  pillarGuidance: PillarGuidance | null;
  pillarLoading: boolean;
  pillarError: string | null;
  decisionSaving: boolean;
  decisionError: string | null;
  decisionLinks: DecisionLink[];
  decisionGraph: DecisionGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  conflicts: ConflictAnalysis | null;
  conflictLoading: boolean;
  conflictError: string | null;
  outputs: GeneratedOutputs | null;
  outputsLoading: boolean;
  outputsError: string | null;
  aiSettings: AiSettings;
  guideLoading: boolean;
  guideError: string | null;
  guideResponse: AssistantGuideResponse | null;
}
