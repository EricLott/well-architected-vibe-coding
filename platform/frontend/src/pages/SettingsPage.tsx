import { useState } from "react";
import { StatusCard } from "../components/StatusCard";
import {
  defaultAiSettings,
  persistAiSettings,
} from "../services/aiSettingsStorage";
import { useAppDispatch, useAppState } from "../state/AppContext";
import type { AiProvider } from "../types/app";

function defaultModel(provider: AiProvider): string {
  if (provider === "anthropic") {
    return "claude-3-5-sonnet-latest";
  }
  return "gpt-4.1-mini";
}

export function SettingsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [saved, setSaved] = useState(false);

  function updateProvider(provider: AiProvider) {
    dispatch({
      type: "set-ai-settings",
      payload: {
        ...state.aiSettings,
        provider,
        model: state.aiSettings.model || defaultModel(provider),
      },
    });
    setSaved(false);
  }

  function save() {
    persistAiSettings(state.aiSettings);
    setSaved(true);
  }

  function reset() {
    const defaults = defaultAiSettings();
    dispatch({ type: "set-ai-settings", payload: defaults });
    persistAiSettings(defaults);
    setSaved(false);
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Settings</p>
        <h2>AI provider configuration</h2>
        <p>
          Bring your own API key for OpenAI or Anthropic guidance calls. Keys are
          kept in browser session storage and sent only on guidance requests.
        </p>
      </header>

      <section className="decision-form-panel">
        <h3>Copilot provider</h3>
        <div className="decision-form-grid">
          <label>
            <span>Enable provider calls</span>
            <select
              value={state.aiSettings.enabled ? "enabled" : "disabled"}
              onChange={(event) =>
                dispatch({
                  type: "set-ai-settings",
                  payload: {
                    ...state.aiSettings,
                    enabled: event.target.value === "enabled",
                  },
                })
              }
            >
              <option value="disabled">Heuristic only (no API key)</option>
              <option value="enabled">Enable provider calls</option>
            </select>
          </label>
          <label>
            <span>Provider</span>
            <select
              value={state.aiSettings.provider}
              onChange={(event) =>
                updateProvider(event.target.value as AiProvider)
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label>
            <span>Model</span>
            <input
              value={state.aiSettings.model}
              onChange={(event) =>
                dispatch({
                  type: "set-ai-settings",
                  payload: {
                    ...state.aiSettings,
                    model: event.target.value,
                  },
                })
              }
              placeholder={defaultModel(state.aiSettings.provider)}
            />
          </label>
          <label>
            <span>API key</span>
            <input
              type="password"
              value={state.aiSettings.apiKey}
              onChange={(event) =>
                dispatch({
                  type: "set-ai-settings",
                  payload: {
                    ...state.aiSettings,
                    apiKey: event.target.value,
                  },
                })
              }
              placeholder="Paste your API key"
            />
          </label>
        </div>

        <div className="decision-actions">
          <button className="primary-button" type="button" onClick={save}>
            Save provider settings
          </button>
          <button className="secondary-button" type="button" onClick={reset}>
            Reset
          </button>
          {saved ? <p className="helper-text">Settings saved locally.</p> : null}
        </div>
      </section>

      <StatusCard title="Security note" tone="warning">
        <p>
          API keys are not persisted to backend storage. They are stored only in
          browser session storage and cleared when the session ends.
        </p>
      </StatusCard>
    </section>
  );
}
