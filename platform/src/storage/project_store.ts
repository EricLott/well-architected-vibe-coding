import { getDbPool, ensureProjectsTable } from "./db.js";
import type {
  DecisionItem,
  DecisionLink,
  ProjectRecord,
} from "../shared/types.js";

function sortByUpdatedAtDescending(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function withProjectDefaults(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    decisionLinks: project.decisionLinks ?? [],
    additionalPillars: project.additionalPillars ?? [],
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
  private inited = false;

  constructor(private readonly repositoryRoot: string) { }

  private async ensureInit() {
    if (!this.inited) {
      await ensureProjectsTable();
      this.inited = true;
    }
  }

  public async listProjects(): Promise<ProjectRecord[]> {
    await this.ensureInit();
    const pool = await getDbPool();
    const [rows] = await pool.query<any>("SELECT data FROM projects ORDER BY updated_at DESC");
    const projects = (rows as any[]).map((row) => row.data as ProjectRecord);
    return sortByUpdatedAtDescending(projects.map(withProjectDefaults));
  }

  public async getProject(projectId: string): Promise<ProjectRecord | null> {
    await this.ensureInit();
    const pool = await getDbPool();
    const [rows] = await pool.query<any>("SELECT data FROM projects WHERE id = ?", [projectId]);
    const r = rows as any[];
    if (r.length === 0) {
      return null;
    }
    return withProjectDefaults(r[0].data as ProjectRecord);
  }

  public async upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
    await this.ensureInit();
    const normalized = withProjectDefaults(project);
    const pool = await getDbPool();
    const query = `
      INSERT INTO projects (id, updated_at, data) 
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at), data = VALUES(data)
    `;
    // Update updated_at properly formatting to JS Date so it converts to MySQL DATETIME
    const updateTime = new Date(normalized.updatedAt);

    await pool.query(query, [
      normalized.id,
      updateTime,
      JSON.stringify(normalized),
    ]);
    return normalized;
  }

  public async replaceProjectDecisions(
    projectId: string,
    decisions: DecisionItem[],
  ): Promise<ProjectRecord | null> {
    const current = await this.getProject(projectId);
    if (!current) {
      return null;
    }

    const updated: ProjectRecord = {
      ...current,
      decisions,
      decisionLinks: sanitizeDecisionLinks(decisions, current.decisionLinks ?? []),
      updatedAt: new Date().toISOString(),
    };

    await this.upsertProject(updated);
    return updated;
  }

  public async replaceDecisionGraph(
    projectId: string,
    decisions: DecisionItem[],
    links: DecisionLink[],
  ): Promise<ProjectRecord | null> {
    const current = await this.getProject(projectId);
    if (!current) {
      return null;
    }

    const updated: ProjectRecord = {
      ...current,
      decisions,
      decisionLinks: sanitizeDecisionLinks(decisions, links),
      updatedAt: new Date().toISOString(),
    };

    await this.upsertProject(updated);
    return updated;
  }
}
