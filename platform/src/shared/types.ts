export interface ChunkingConfig {
  targetMinTokens: number;
  targetMaxTokens: number;
  softMinTokens: number;
  softMaxTokens: number;
  overlapTokens: number;
}

export interface IngestionConfig {
  repositoryName: string;
  docsRoot: string;
  artifactsRoot: string;
  include: string[];
  exclude: string[];
  chunking: ChunkingConfig;
}

export interface MappingConfig {
  pillars: Record<string, string>;
  docGroups: Record<string, string>;
  workloads: Record<string, string>;
  serviceGuide: {
    rootFolder: string;
    splitByPillarHeading: boolean;
    pillarHeadings: string[];
  };
}

export interface SourceFile {
  absolutePath: string;
  repoRelativePath: string;
  docsRelativePath: string;
}

export interface ScanResult {
  includedFiles: SourceFile[];
  includedFileCount: number;
  excludedFileCount: number;
}

export interface RepoSnapshot {
  repositoryName: string;
  repositoryRoot: string;
  docsRoot: string;
  commitHash: string;
  ingestionTimestamp: string;
}

export interface SourceManifest {
  repository_name: string;
  repository_root: string;
  docs_root: string;
  commit_hash: string;
  ingestion_timestamp: string;
  included_file_count: number;
  excluded_file_count: number;
  included_files: string[];
}

export interface HeadingInfo {
  level: number;
  text: string;
  line: number;
  path: string[];
}

export interface ParsedSection {
  sectionOrder: number;
  headingLevel: number;
  headingText: string;
  headingPath: string[];
  markdown: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedDocument {
  source: SourceFile;
  frontMatter: Record<string, unknown>;
  title: string;
  rawBody: string;
  headings: HeadingInfo[];
  sections: ParsedSection[];
  localLinks: string[];
  lastModified: string;
}

export interface ChunkDraft {
  chunkId?: string;
  sectionOrder: number;
  chunkOrderInSection: number;
  headingPath: string[];
  headingLevel: number;
  content: string;
  tokenCountEstimate: number;
  hasTable: boolean;
  hasCallout: boolean;
  linkTargetsLocal: string[];
}

export interface ChunkMetadata {
  chunk_id: string;
  pillar: string;
  subtopic: string;
  title: string;
  heading_path: string[];
  source_path: string;
  repo_relative_path: string;
  content_type: string;
  file_name: string;
  repository_name: string;
  commit_hash: string;
  last_modified: string;
  section_order: number;
  chunk_order_in_section: number;
  ingestion_timestamp: string;
  doc_group: string;
  workload_name: string | null;
  service_name: string | null;
  recommendation_code: string | null;
  ms_topic: string | null;
  ms_date: string | null;
  ms_author: string | null;
  link_targets_local: string[];
  has_table: boolean;
  has_callout: boolean;
  token_count_estimate: number;
  chunk_hash: string;
}

export interface ChunkRecord {
  chunk_id: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface IngestionSummary {
  repositoryName: string;
  commitHash: string;
  ingestionTimestamp: string;
  includedFileCount: number;
  excludedFileCount: number;
  parsedDocumentCount: number;
  chunkCount: number;
  artifactsRoot: string;
}

export interface RetrievalFilters {
  pillar?: string[];
  doc_group?: string[];
  service_name?: string[];
  workload_name?: string[];
  content_type?: string[];
}

export interface RetrievalRequest {
  query: string;
  filters?: RetrievalFilters;
  topK?: number;
}

export interface RetrievalResult {
  chunk_id: string;
  score: number;
  citation: {
    source_path: string;
    heading_path: string[];
    title: string;
  };
  metadata: ChunkMetadata;
  content: string;
}

export interface RetrievalResponse {
  query: string;
  results: RetrievalResult[];
}

export type PillarName = string;

export type PillarCategory =
  | "well-architected"
  | "solution-architecture"
  | "experience-design"
  | "engineering-operations"
  | "core"
  | "ad-hoc";

export interface PillarDefinition {
  name: PillarName;
  slug: string;
  category: PillarCategory;
  summary: string;
  retrievalQueryHint: string;
}

export type DecisionStatus = "confirmed" | "proposed" | "unresolved";

export interface DecisionItem {
  id: string;
  title: string;
  description: string;
  selectedOption: string;
  status: DecisionStatus;
  pillar: PillarName;
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

export interface DecisionGraphResponse {
  projectId: string;
  graph: DecisionGraph;
}

export interface UpdateDecisionGraphRequest {
  decisions: DecisionItem[];
  links: DecisionLink[];
}

export type ConflictSeverity = "high" | "medium" | "low";

export interface CrossPillarConflict {
  id: string;
  title: string;
  description: string;
  severity: ConflictSeverity;
  involvedPillars: PillarName[];
  decisionIds: string[];
  whyItMatters: string;
  recommendation: string;
  relatedGuidance: RetrievalResult[];
}

export interface ConflictAnalysisResponse {
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

export interface OutputsResponse {
  projectId: string;
  outputs: GeneratedOutputs;
}

export interface GenerateOutputPackRequest {
  providerConfig?: AssistantProviderConfig;
}

export type AiProvider = "openai" | "anthropic";

export interface AssistantProviderConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AssistantGuideQuestion {
  question: string;
  whyItMatters: string;
  riskIfIgnored: string;
}

export interface AssistantGuideRequest {
  projectId?: string;
  phase: string;
  userMessage?: string;
  pillar?: PillarName;
  providerConfig?: AssistantProviderConfig;
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

export interface DecisionAssessment {
  isDecision: boolean;
  confidence: number;
  reason: string;
  title: string | null;
  selectedOption: string | null;
  rationale: string | null;
  risks: string[];
}

export interface PillarChatTurnRequest {
  message: string;
  forceDecisionCapture?: boolean;
  providerConfig?: AssistantProviderConfig;
}

export interface PillarChatTurnResponse {
  project: ProjectRecord;
  pillar: PillarName;
  guidance: AssistantGuideResponse;
  decisionLogged: boolean;
  decision: DecisionItem | null;
  decisionAssessment: DecisionAssessment;
}

export interface ProjectRecord {
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
  additionalPillars: PillarDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface InitializeProjectRequest {
  ideaText: string;
}

export interface InitializeProjectResponse {
  project: ProjectRecord;
}

export interface ProjectListResponse {
  projects: ProjectRecord[];
}

export interface ProjectResponse {
  project: ProjectRecord;
}

export interface UpdateDecisionsRequest {
  decisions: DecisionItem[];
}

export interface PillarQuestion {
  id: string;
  pillar: PillarName;
  question: string;
  whyItMatters: string;
  riskIfIgnored: string;
  suggestedDefault: string | null;
}

export interface PillarGuidanceResponse {
  projectId: string;
  pillar: PillarName;
  recommendedFocus: string;
  questions: PillarQuestion[];
  retrievedGuidance: RetrievalResult[];
}

export interface PillarCatalogResponse {
  pillars: PillarDefinition[];
}
