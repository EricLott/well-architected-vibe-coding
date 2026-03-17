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
