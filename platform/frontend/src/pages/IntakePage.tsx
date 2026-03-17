import { useNavigate } from "react-router-dom";
import { GroundingPreviewPanel } from "../components/GroundingPreviewPanel";
import { IdeaIntakeForm } from "../components/IdeaIntakeForm";
import { StatusCard } from "../components/StatusCard";
import { useGuidancePreview } from "../hooks/useGuidancePreview";
import { intakeService } from "../services/intakeService";
import { useAppDispatch, useAppState } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to initialize the project from this idea.";
}

export function IntakePage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const guidance = useGuidancePreview();

  async function handleSubmit() {
    dispatch({ type: "start-intake" });
    try {
      const project = await intakeService.initializeProject(state.intakeText);
      dispatch({ type: "intake-success", payload: project });
      navigate("/project");
    } catch (error) {
      dispatch({ type: "intake-failure", payload: getMessage(error) });
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Phase 1 intake</p>
        <h2>Turn a rough app idea into an architecture-ready starting point</h2>
        <p>
          Capture the minimum context now so decisions, risks, and tradeoffs are
          grounded before implementation.
        </p>
      </header>

      <div className="status-grid">
        <StatusCard title="Project summary">
          <p>{state.projectSummary}</p>
        </StatusCard>
        <StatusCard title="Pillar focus" tone="accent">
          <p>{state.pillarFocus}</p>
        </StatusCard>
        <StatusCard title="Questions">
          <p>{state.questions[0]}</p>
        </StatusCard>
        <StatusCard title="Decisions">
          <p>
            {state.decisions.length === 0
              ? "No decisions captured yet."
              : `${state.decisions.length} decisions captured.`}
          </p>
        </StatusCard>
        <StatusCard title="Risks" tone="warning">
          <p>{state.risks[0]}</p>
        </StatusCard>
        <StatusCard title="Open questions">
          <ul>
            {state.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </StatusCard>
        <StatusCard title="Next step" tone="accent">
          <p>{state.nextStep}</p>
        </StatusCard>
      </div>

      <div className="intake-grid">
        <IdeaIntakeForm
          value={state.intakeText}
          onChange={(value) =>
            dispatch({ type: "set-intake-text", payload: value })
          }
          onSubmit={handleSubmit}
          isLoading={state.intakeLoading}
          errorMessage={state.intakeError}
        />
        <GroundingPreviewPanel
          query={guidance.query}
          onQueryChange={guidance.setQuery}
          onRun={guidance.runQuery}
          isLoading={guidance.isLoading}
          errorMessage={guidance.errorMessage}
          results={guidance.results}
        />
      </div>
    </section>
  );
}
