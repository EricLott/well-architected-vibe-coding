import { EmptyStatePanel } from "../components/EmptyStatePanel";
import { StatusCard } from "../components/StatusCard";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to analyze cross-pillar risks.";
}

export function RisksPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const project = state.currentProject;

  if (!project) {
    return <EmptyStatePanel />;
  }
  const projectId = project.id;

  async function analyzeRisks() {
    dispatch({ type: "start-conflict-analysis" });
    try {
      const analysis = await projectService.analyzeConflicts(projectId);
      dispatch({ type: "conflict-analysis-success", payload: analysis });
    } catch (error) {
      dispatch({ type: "conflict-analysis-failure", payload: getMessage(error) });
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Risk register</p>
        <h2>Cross-pillar conflict analysis</h2>
        <p>
          Detect architecture tradeoff conflicts from your decision graph and
          receive grounded recommendations.
        </p>
      </header>

      <section className="pillar-controls">
        <p className="helper-text">
          Analyze conflicts across reliability, security, cost, operations, and
          performance decisions.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={analyzeRisks}
          disabled={state.conflictLoading}
        >
          {state.conflictLoading ? "Analyzing..." : "Analyze conflicts"}
        </button>
      </section>

      {state.conflictError ? (
        <p className="error-text" role="alert">
          {state.conflictError}
        </p>
      ) : null}

      {state.conflicts ? (
        <>
          <StatusCard title="Analysis summary" tone="accent">
            <p>{state.conflicts.summary}</p>
            <p>
              Generated: {new Date(state.conflicts.generatedAt).toLocaleString()}
            </p>
          </StatusCard>

          {state.conflicts.conflicts.length === 0 ? (
            <StatusCard title="No conflicts detected">
              <p>
                No explicit cross-pillar conflicts were detected in the current
                decision model.
              </p>
            </StatusCard>
          ) : (
            <div className="status-grid">
              {state.conflicts.conflicts.map((conflict) => (
                <StatusCard
                  key={conflict.id}
                  title={`${conflict.severity.toUpperCase()}: ${conflict.title}`}
                  tone={conflict.severity === "high" ? "warning" : "default"}
                >
                  <p>{conflict.description}</p>
                  <p>
                    <strong>Pillars:</strong> {conflict.involvedPillars.join(", ")}
                  </p>
                  <p>
                    <strong>Why it matters:</strong> {conflict.whyItMatters}
                  </p>
                  <p>
                    <strong>Recommendation:</strong> {conflict.recommendation}
                  </p>
                  {conflict.relatedGuidance.length > 0 ? (
                    <ul>
                      {conflict.relatedGuidance.map((result) => (
                        <li key={result.chunk_id}>
                          {result.citation.title} ({result.citation.source_path})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </StatusCard>
              ))}
            </div>
          )}
        </>
      ) : (
        <StatusCard title="No analysis yet">
          <p>Run conflict analysis to populate the risk register.</p>
        </StatusCard>
      )}
    </section>
  );
}
