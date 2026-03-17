import path from "node:path";
import { fileExists, readJsonFile, writeJsonFile } from "../shared/fs.js";
import type {
  DecisionItem,
  DecisionLink,
  ProjectRecord,
} from "../shared/types.js";

interface ProjectStorePayload {
  version: number;
  projects: ProjectRecord[];
}

function sortByUpdatedAtDescending(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function withProjectDefaults(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    decisionLinks: project.decisionLinks ?? [],
  };
}

function sanitizeDecisionLinks(
  decisions: DecisionItem[],
  links: DecisionLink[],
): DecisionLink[] {
  const decisionIds = new Set(decisions.map((item) => item.id));
  const dedupe = new Set<string>();
  const valid: DecisionLink[] = [];

  for (const link of links) {
    if (
      !link.id.trim() ||
      !decisionIds.has(link.fromDecisionId) ||
      !decisionIds.has(link.toDecisionId) ||
      link.fromDecisionId === link.toDecisionId
    ) {
      continue;
    }
    const key = `${link.fromDecisionId}:${link.toDecisionId}:${link.type}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    valid.push(link);
  }

  return valid;
}

export class ProjectStore {
  private readonly filePath: string;

  constructor(repositoryRoot: string) {
    this.filePath = path.resolve(
      repositoryRoot,
      "platform/artifacts/workspace/projects.json",
    );
  }

  public async listProjects(): Promise<ProjectRecord[]> {
    const payload = await this.readPayload();
    return sortByUpdatedAtDescending(payload.projects.map(withProjectDefaults));
  }

  public async getProject(projectId: string): Promise<ProjectRecord | null> {
    const payload = await this.readPayload();
    const project = payload.projects.find((item) => item.id === projectId);
    return project ? withProjectDefaults(project) : null;
  }

  public async upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
    const payload = await this.readPayload();
    const normalized = withProjectDefaults(project);
    const index = payload.projects.findIndex((item) => item.id === normalized.id);
    if (index === -1) {
      payload.projects.push(normalized);
    } else {
      payload.projects[index] = normalized;
    }
    await this.writePayload(payload);
    return normalized;
  }

  public async replaceProjectDecisions(
    projectId: string,
    decisions: DecisionItem[],
  ): Promise<ProjectRecord | null> {
    const payload = await this.readPayload();
    const index = payload.projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return null;
    }

    const current = payload.projects[index];
    const updated: ProjectRecord = {
      ...current,
      decisions,
      decisionLinks: sanitizeDecisionLinks(decisions, current.decisionLinks ?? []),
      updatedAt: new Date().toISOString(),
    };
    payload.projects[index] = updated;
    await this.writePayload(payload);
    return updated;
  }

  public async replaceDecisionGraph(
    projectId: string,
    decisions: DecisionItem[],
    links: DecisionLink[],
  ): Promise<ProjectRecord | null> {
    const payload = await this.readPayload();
    const index = payload.projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return null;
    }

    const current = payload.projects[index];
    const updated: ProjectRecord = {
      ...current,
      decisions,
      decisionLinks: sanitizeDecisionLinks(decisions, links),
      updatedAt: new Date().toISOString(),
    };
    payload.projects[index] = updated;
    await this.writePayload(payload);
    return updated;
  }

  private async readPayload(): Promise<ProjectStorePayload> {
    const exists = await fileExists(this.filePath);
    if (!exists) {
      return this.emptyPayload();
    }

    const payload = await readJsonFile<ProjectStorePayload>(this.filePath);
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.projects)) {
      return this.emptyPayload();
    }
    return payload;
  }

  private async writePayload(payload: ProjectStorePayload): Promise<void> {
    await writeJsonFile(this.filePath, payload, true);
  }

  private emptyPayload(): ProjectStorePayload {
    return {
      version: 1,
      projects: [],
    };
  }
}
