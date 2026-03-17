import { useState } from "react";
import { EmptyStatePanel } from "../components/EmptyStatePanel";
import { StatusCard } from "../components/StatusCard";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to generate output package.";
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function OutputsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const project = state.currentProject;
  const [lastDownload, setLastDownload] = useState<{
    fileName: string;
    downloadedAt: string;
  } | null>(null);

  if (!project) {
    return <EmptyStatePanel />;
  }
  const projectId = project.id;

  async function generate() {
    dispatch({ type: "start-outputs-generation" });
    try {
      const result = await projectService.generateOutputPack(
        projectId,
        state.aiSettings,
      );
      triggerDownload(result.blob, result.fileName);
      setLastDownload({
        fileName: result.fileName,
        downloadedAt: new Date().toISOString(),
      });
      dispatch({ type: "outputs-generation-success" });
    } catch (error) {
      dispatch({ type: "outputs-generation-failure", payload: getMessage(error) });
    }
  }

  const usingByo =
    state.aiSettings.enabled &&
    state.aiSettings.apiKey.trim().length > 0 &&
    state.aiSettings.model.trim().length > 0;

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Output pack</p>
        <h2>AI implementation system ZIP</h2>
        <p>
          Generate a production-quality implementation system as a downloadable
          ZIP with plans, tasks, specs, decisions, status tracking, and reusable
          templates.
        </p>
      </header>

      <section className="pillar-controls">
        <p className="helper-text">
          {usingByo
            ? `Using BYO ${state.aiSettings.provider} model "${state.aiSettings.model.trim()}" for app-specific generation.`
            : "No BYO key configured. The pack will still generate from persisted project context and architecture decisions."}
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={generate}
          disabled={state.outputsLoading}
        >
          {state.outputsLoading
            ? "Generating ZIP..."
            : "Generate output pack (.zip)"}
        </button>
      </section>

      {state.outputsError ? (
        <p className="error-text" role="alert">
          {state.outputsError}
        </p>
      ) : null}

      {lastDownload ? (
        <StatusCard title="Latest download" tone="accent">
          <p>
            <strong>File:</strong> {lastDownload.fileName}
          </p>
          <p>
            <strong>Downloaded:</strong>{" "}
            {new Date(lastDownload.downloadedAt).toLocaleString()}
          </p>
        </StatusCard>
      ) : null}

      <div className="status-grid">
        <StatusCard title="ZIP contents">
          <ul>
            <li>PROJECT_OVERVIEW.md as source of truth</li>
            <li>AGENTS.md with execution rules for coding agents</li>
            <li>plans/, tasks/, decisions/, specs/, status/, templates/</li>
            <li>App-specific content grounded in your project context</li>
          </ul>
        </StatusCard>
        <StatusCard title="Generation checks" tone="warning">
          <ul>
            <li>All required directories are created</li>
            <li>All required markdown files are written and non-empty</li>
            <li>Task flow is sequential from 001 through 010</li>
            <li>ZIP file is validated before download</li>
          </ul>
        </StatusCard>
      </div>
    </section>
  );
}
