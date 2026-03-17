import path from "node:path";
import { shortHash } from "../../shared/hash.js";
import { getPathParts } from "../../shared/path.js";
import { estimateTokenCount } from "../../shared/text.js";
import type {
  ChunkDraft,
  ChunkMetadata,
  ChunkRecord,
  MappingConfig,
  ParsedDocument,
  RepoSnapshot,
} from "../../shared/types.js";

const PILLAR_LABELS: Record<string, string> = {
  reliability: "reliability",
  security: "security",
  "cost optimization": "cost-optimization",
  "operational excellence": "operational-excellence",
  "performance efficiency": "performance-efficiency",
};

const LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g;

function getFolderAfterDocsRoot(repoRelativePath: string): string {
  const parts = getPathParts(repoRelativePath);
  if (parts.length <= 1) {
    return "(root)";
  }
  return parts[1] ?? "(root)";
}

function inferDocGroup(
  mapping: MappingConfig,
  repoRelativePath: string,
): string {
  const folder = getFolderAfterDocsRoot(repoRelativePath);
  return mapping.docGroups[folder] ?? "framework";
}

function inferServiceName(repoRelativePath: string, docGroup: string): string | null {
  if (docGroup !== "service-guide") {
    return null;
  }
  const parts = getPathParts(repoRelativePath);
  if (parts.length < 3) {
    return null;
  }
  if (parts.length >= 4) {
    return parts[2] ?? null;
  }
  return path.basename(parts[2] ?? "", ".md") || null;
}

function inferWorkloadName(
  mapping: MappingConfig,
  repoRelativePath: string,
): string | null {
  const folder = getFolderAfterDocsRoot(repoRelativePath);
  return mapping.workloads[folder] ?? null;
}

function inferPillar(
  mapping: MappingConfig,
  repoRelativePath: string,
  headingPath: string[],
): string {
  const folder = getFolderAfterDocsRoot(repoRelativePath);
  if (mapping.pillars[folder]) {
    return mapping.pillars[folder];
  }

  const headingPathLower = headingPath.join(" ").toLowerCase();
  for (const [label, pillar] of Object.entries(PILLAR_LABELS)) {
    if (headingPathLower.includes(label)) {
      return pillar;
    }
  }

  const fileName = path.basename(repoRelativePath, ".md").toLowerCase();
  if (PILLAR_LABELS[fileName]) {
    return PILLAR_LABELS[fileName];
  }

  return "cross-pillar";
}

function inferContentType(
  fileName: string,
  headingPath: string[],
  content: string,
): string {
  const fileLower = fileName.toLowerCase();
  const headingLower = headingPath.join(" ").toLowerCase();
  const contentLower = content.toLowerCase();

  if (fileLower.includes("assessment")) {
    return "assessment";
  }
  if (fileLower.includes("checklist") || headingLower.includes("checklist")) {
    return "checklist";
  }
  if (fileLower.includes("tradeoff") || headingLower.includes("tradeoff")) {
    return "tradeoff";
  }
  if (fileLower.includes("principle") || headingLower.includes("principle")) {
    return "principle";
  }
  if (fileLower.includes("overview") || fileLower.includes("get-started")) {
    return "overview";
  }
  if (fileLower.includes("maturity-model") || fileLower.includes("design-patterns")) {
    return "reference";
  }
  if (headingLower.includes("configuration recommendations")) {
    return "implementation guidance";
  }
  if (headingLower.includes("design recommendations")) {
    return "implementation guidance";
  }
  if (contentLower.includes("anti-pattern")) {
    return "anti-pattern";
  }
  if (headingLower.includes("related links")) {
    return "reference";
  }
  return "guidance_general";
}

function inferRecommendationCode(content: string): string | null {
  const match = content.match(/\b(RE|SE|CO|OE|PE):\d{2}\b/);
  return match ? match[0] : null;
}

function normalizeFrontMatterValue(
  frontMatter: Record<string, unknown>,
  key: string,
): string | null {
  const value = frontMatter[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractChunkLocalLinks(content: string): string[] {
  const links = new Set<string>();
  for (const match of content.matchAll(LINK_REGEX)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("#")) {
      continue;
    }
    const cleaned = raw
      .replace(/\s+".*$/, "")
      .replace(/\s+'.*$/, "")
      .trim();
    if (
      cleaned.startsWith("http://") ||
      cleaned.startsWith("https://") ||
      cleaned.startsWith("mailto:") ||
      cleaned.startsWith("/")
    ) {
      continue;
    }
    const withoutFragment = cleaned.split("#")[0]?.trim() ?? "";
    if (!withoutFragment) {
      continue;
    }
    links.add(withoutFragment);
  }
  return [...links].sort((a, b) => a.localeCompare(b));
}

function chunkMetadataFromDraft(input: {
  draft: ChunkDraft;
  parsed: ParsedDocument;
  snapshot: RepoSnapshot;
  mapping: MappingConfig;
}): ChunkMetadata {
  const { draft, parsed, snapshot, mapping } = input;
  const repoRelativePath = parsed.source.repoRelativePath;
  const fileName = path.basename(repoRelativePath);
  const docGroup = inferDocGroup(mapping, repoRelativePath);
  const pillar = inferPillar(mapping, repoRelativePath, draft.headingPath);
  const chunkHash = shortHash(draft.content, 24);
  const chunkId =
    draft.chunkId ??
    `${repoRelativePath}::${draft.headingPath.join(" > ")}::${draft.sectionOrder}-${draft.chunkOrderInSection}::${shortHash(draft.content, 10)}`;

  return {
    chunk_id: chunkId,
    pillar,
    subtopic: path.basename(repoRelativePath, ".md"),
    title: parsed.title,
    heading_path: [...draft.headingPath],
    source_path: repoRelativePath,
    repo_relative_path: repoRelativePath,
    content_type: inferContentType(fileName, draft.headingPath, draft.content),
    file_name: fileName,
    repository_name: snapshot.repositoryName,
    commit_hash: snapshot.commitHash,
    last_modified: parsed.lastModified,
    section_order: draft.sectionOrder,
    chunk_order_in_section: draft.chunkOrderInSection,
    ingestion_timestamp: snapshot.ingestionTimestamp,
    doc_group: docGroup,
    workload_name: inferWorkloadName(mapping, repoRelativePath),
    service_name: inferServiceName(repoRelativePath, docGroup),
    recommendation_code: inferRecommendationCode(draft.content),
    ms_topic: normalizeFrontMatterValue(parsed.frontMatter, "ms.topic"),
    ms_date: normalizeFrontMatterValue(parsed.frontMatter, "ms.date"),
    ms_author: normalizeFrontMatterValue(parsed.frontMatter, "ms.author"),
    link_targets_local: extractChunkLocalLinks(draft.content),
    has_table: draft.hasTable,
    has_callout: draft.hasCallout,
    token_count_estimate:
      draft.tokenCountEstimate || estimateTokenCount(draft.content),
    chunk_hash: chunkHash,
  };
}

export function buildChunkRecords(input: {
  parsedDocument: ParsedDocument;
  chunkDrafts: ChunkDraft[];
  snapshot: RepoSnapshot;
  mapping: MappingConfig;
}): ChunkRecord[] {
  const { parsedDocument, chunkDrafts, snapshot, mapping } = input;
  return chunkDrafts.map((draft) => {
    const metadata = chunkMetadataFromDraft({
      draft,
      parsed: parsedDocument,
      snapshot,
      mapping,
    });
    return {
      chunk_id: metadata.chunk_id,
      content: draft.content,
      metadata,
    };
  });
}
