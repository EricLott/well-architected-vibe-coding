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

export function OutputsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const project = state.currentProject;

  if (!project) {
    return <EmptyStatePanel />;
  }
  const projectId = project.id;

  async function generate() {
    dispatch({ type: "start-outputs-generation" });
    try {
      const outputs = await projectService.generateOutputs(projectId);
      dispatch({ type: "outputs-generation-success", payload: outputs });
    } catch (error) {
      dispatch({ type: "outputs-generation-failure", payload: getMessage(error) });
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Outputs</p>
        <h2>Architecture export package</h2>
        <p>
          Generate an architecture summary, risk report, open questions, and
          implementation prompt pack from current project state.
        </p>
      </header>

      <section className="pillar-controls">
        <p className="helper-text">
          Output generation uses your persisted project, decisions, and
          cross-pillar reasoning.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={generate}
          disabled={state.outputsLoading}
        >
          {state.outputsLoading ? "Generating..." : "Generate outputs"}
        </button>
      </section>

      {state.outputsError ? (
        <p className="error-text" role="alert">
          {state.outputsError}
        </p>
      ) : null}

      {state.outputs ? (
        <>
          <StatusCard title="Architecture summary" tone="accent">
            <p>
              Generated: {new Date(state.outputs.generatedAt).toLocaleString()}
            </p>
            <ul>
              {state.outputs.architectureSummary.systemOverview.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              <strong>Strengths</strong>
            </p>
            <ul>
              {state.outputs.architectureSummary.pillarStrengths.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              <strong>Gaps</strong>
            </p>
            <ul>
              {state.outputs.architectureSummary.pillarGaps.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </StatusCard>

          <div className="status-grid">
            <StatusCard title="Risk report" tone="warning">
              <p>
                <strong>Top risks</strong>
              </p>
              <ul>
                {state.outputs.riskReport.topRisks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
              <p>
                <strong>Mitigation actions</strong>
              </p>
              <ul>
                {state.outputs.riskReport.mitigationActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </StatusCard>
            <StatusCard title="Open questions">
              <ul>
                {state.outputs.openQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </StatusCard>
          </div>

          <StatusCard title="Prompt pack">
            <p>
              <strong>Master system prompt</strong>
            </p>
            <pre className="prompt-block">
              {state.outputs.promptPack.masterSystemPrompt}
            </pre>
            <p>
              <strong>Layer prompts</strong>
            </p>
            <pre className="prompt-block">
              {state.outputs.promptPack.layerPrompts.frontend}
            </pre>
            <pre className="prompt-block">
              {state.outputs.promptPack.layerPrompts.backend}
            </pre>
            <pre className="prompt-block">
              {state.outputs.promptPack.layerPrompts.data}
            </pre>
            <pre className="prompt-block">
              {state.outputs.promptPack.layerPrompts.devops}
            </pre>
            <p>
              <strong>Feature prompts</strong>
            </p>
            <ul>
              {state.outputs.promptPack.featurePrompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
            <p>
              <strong>Build backlog</strong>
            </p>
            <ul>
              {state.outputs.promptPack.buildBacklog.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </StatusCard>
        </>
      ) : (
        <StatusCard title="No output package yet">
          <p>Generate outputs to create a production-minded handoff package.</p>
        </StatusCard>
      )}
    </section>
  );
}
