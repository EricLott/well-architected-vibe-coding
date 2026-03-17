import type {
  AiSettings,
  AssistantGuideResponse,
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

export async function generateAssistantGuidance(options: {
  phase: string;
  userMessage: string;
  project: ProjectState | null;
  aiSettings: AiSettings;
}): Promise<AssistantGuideResponse> {
  const payload: Record<string, unknown> = {
    phase: options.phase,
    userMessage: options.userMessage,
  };

  if (options.project?.id) {
    payload.projectId = options.project.id;
  }

  if (options.aiSettings.enabled && options.aiSettings.apiKey.trim()) {
    payload.providerConfig = {
      provider: options.aiSettings.provider,
      model: options.aiSettings.model.trim(),
      apiKey: options.aiSettings.apiKey.trim(),
    };
  }

  const response = await fetch("/assistant/guide", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return (await response.json()) as AssistantGuideResponse;
}
