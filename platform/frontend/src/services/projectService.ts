import type {
  ConflictAnalysis,
  DecisionItem,
  DecisionLink,
  DecisionGraphResponse,
  GeneratedOutputs,
  OutputsResponse,
  Pillar,
  PillarGuidance,
  ProjectListResponse,
  ProjectResponse,
  ProjectState,
} from "../types/app";

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return (await response.json()) as T;
}

const pillarToSlug: Record<Pillar, string> = {
  Reliability: "reliability",
  Security: "security",
  "Cost Optimization": "cost-optimization",
  "Operational Excellence": "operational-excellence",
  "Performance Efficiency": "performance-efficiency",
};

export const projectService = {
  async initializeProject(ideaText: string): Promise<ProjectState> {
    const payload = await requestJson<ProjectResponse>("/projects/intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ideaText }),
    });
    return payload.project;
  },

  async listProjects(): Promise<ProjectState[]> {
    const payload = await requestJson<ProjectListResponse>("/projects");
    return payload.projects;
  },

  async getProject(projectId: string): Promise<ProjectState> {
    const payload = await requestJson<ProjectResponse>(`/projects/${projectId}`);
    return payload.project;
  },

  async replaceDecisions(
    projectId: string,
    decisions: DecisionItem[],
  ): Promise<ProjectState> {
    const payload = await requestJson<ProjectResponse>(
      `/projects/${projectId}/decisions`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decisions }),
      },
    );
    return payload.project;
  },

  async replaceDecisionGraph(
    projectId: string,
    decisions: DecisionItem[],
    links: DecisionLink[],
  ): Promise<{ project: ProjectState; graph: DecisionGraphResponse["graph"] }> {
    return requestJson<{ project: ProjectState; graph: DecisionGraphResponse["graph"] }>(
      `/projects/${projectId}/decision-graph`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decisions, links }),
      },
    );
  },

  async getDecisionGraph(projectId: string): Promise<DecisionGraphResponse["graph"]> {
    const payload = await requestJson<DecisionGraphResponse>(
      `/projects/${projectId}/decision-graph`,
    );
    return payload.graph;
  },

  async generatePillarGuidance(
    projectId: string,
    pillar: Pillar,
  ): Promise<PillarGuidance> {
    const pillarSlug = pillarToSlug[pillar];
    return requestJson<PillarGuidance>(
      `/projects/${projectId}/pillars/${pillarSlug}/questions`,
      {
        method: "POST",
      },
    );
  },

  async analyzeConflicts(projectId: string): Promise<ConflictAnalysis> {
    return requestJson<ConflictAnalysis>(`/projects/${projectId}/conflicts`);
  },

  async generateOutputs(projectId: string): Promise<GeneratedOutputs> {
    const payload = await requestJson<OutputsResponse>(
      `/projects/${projectId}/outputs`,
    );
    return payload.outputs;
  },
};
