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
}
