import type { AiProvider, AiSettings } from "../types/app";

const profileStorageKey = "wavc-ai-profile-v1";
const keyStorageKey = "wavc-ai-key-v1";

function defaultModel(provider: AiProvider): string {
  if (provider === "anthropic") {
    return "claude-3-5-sonnet-latest";
  }
  return "gpt-4.1-mini";
}

export function defaultAiSettings(): AiSettings {
  return {
    enabled: false,
    provider: "openai",
    model: defaultModel("openai"),
    apiKey: "",
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function loadAiSettings(): AiSettings {
  const defaults = defaultAiSettings();
  if (!canUseStorage()) {
    return defaults;
  }
  let profile: Partial<AiSettings> = {};
  try {
    const raw = window.localStorage.getItem(profileStorageKey);
    if (raw) {
      profile = JSON.parse(raw) as Partial<AiSettings>;
    }
  } catch {
    profile = {};
  }

  let apiKey = "";
  try {
    apiKey = window.sessionStorage.getItem(keyStorageKey) ?? "";
  } catch {
    apiKey = "";
  }

  const provider: AiProvider =
    profile.provider === "anthropic" ? "anthropic" : "openai";
  return {
    enabled: Boolean(profile.enabled),
    provider,
    model:
      typeof profile.model === "string" && profile.model.trim()
        ? profile.model
        : defaultModel(provider),
    apiKey,
  };
}

export function persistAiSettings(settings: AiSettings): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(
      profileStorageKey,
      JSON.stringify({
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
      }),
    );
  } catch {
    // Ignore local storage failures and keep working in-memory.
  }

  try {
    if (settings.apiKey.trim()) {
      window.sessionStorage.setItem(keyStorageKey, settings.apiKey.trim());
    } else {
      window.sessionStorage.removeItem(keyStorageKey);
    }
  } catch {
    // Ignore session storage failures and keep working in-memory.
  }
}
