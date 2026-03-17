import type {
  AiSettings,
  ConflictAnalysis,
  DecisionItem,
  DecisionLink,
  DecisionGraphResponse,
  Pillar,
  PillarCatalogResponse,
  PillarDefinition,
  PillarChatTurnResponse,
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

function getFileNameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) {
    return null;
  }
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }
  return null;
}

async function requestBlob(
  url: string,
  init?: RequestInit,
): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return {
    blob: await response.blob(),
    fileName: getFileNameFromContentDisposition(
      response.headers.get("content-disposition"),
    ),
  };
}

function pillarToSlug(pillar: Pillar): string {
  return pillar
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\//g, " ")
    .replace(/[()]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const projectService = {
  async listPillars(projectId?: string): Promise<PillarDefinition[]> {
    const endpoint = projectId ? `/projects/${projectId}/pillars` : "/pillars";
    const payload = await requestJson<PillarCatalogResponse>(endpoint);
    return payload.pillars;
  },

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
    const pillarSlug = pillarToSlug(pillar);
    return requestJson<PillarGuidance>(
      `/projects/${projectId}/pillars/${pillarSlug}/questions`,
      {
        method: "POST",
      },
    );
  },

  async sendPillarChatTurn(options: {
    projectId: string;
    pillar: Pillar;
    message: string;
    aiSettings: AiSettings;
    forceDecisionCapture?: boolean;
  }): Promise<PillarChatTurnResponse> {
    const pillarSlug = pillarToSlug(options.pillar);
    const payload: Record<string, unknown> = {
      message: options.message,
    };

    if (options.forceDecisionCapture) {
      payload.forceDecisionCapture = true;
    }
    if (options.aiSettings.enabled && options.aiSettings.apiKey.trim()) {
      payload.providerConfig = {
        provider: options.aiSettings.provider,
        model: options.aiSettings.model.trim(),
        apiKey: options.aiSettings.apiKey.trim(),
      };
    }

    return requestJson<PillarChatTurnResponse>(
      `/projects/${options.projectId}/pillars/${pillarSlug}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  },

  async analyzeConflicts(projectId: string): Promise<ConflictAnalysis> {
    return requestJson<ConflictAnalysis>(`/projects/${projectId}/conflicts`);
  },

  async generateOutputPack(
    projectId: string,
    aiSettings: AiSettings,
  ): Promise<{ blob: Blob; fileName: string }> {
    const payload: Record<string, unknown> = {};
    if (
      aiSettings.enabled &&
      aiSettings.apiKey.trim().length > 0 &&
      aiSettings.model.trim().length > 0
    ) {
      payload.providerConfig = {
        provider: aiSettings.provider,
        model: aiSettings.model.trim(),
        apiKey: aiSettings.apiKey.trim(),
      };
    }

    const result = await requestBlob(
      `/projects/${projectId}/outputs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    return {
      blob: result.blob,
      fileName: result.fileName ?? "ai-implementation-system.zip",
    };
  },
};
