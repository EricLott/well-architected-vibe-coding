import { useNavigate } from "react-router-dom";
import { IdeaIntakeForm } from "../components/IdeaIntakeForm";
import { intakeService } from "../services/intakeService";
import { useAppDispatch, useAppState } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to initialize project from this idea.";
}

export function LandingIdeaPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  async function handleStart() {
    dispatch({ type: "start-intake" });
    try {
      const project = await intakeService.initializeProject(state.intakeText);
      dispatch({ type: "intake-success", payload: project });
      navigate("/workspace");
    } catch (error) {
      dispatch({ type: "intake-failure", payload: getMessage(error) });
    }
  }

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <p className="section-kicker">Well-Architected vibe coding</p>
        <h1>What app do you want to build?</h1>
        <p>
          Start with your idea. We’ll guide you through architecture decisions
          across reliability, security, cost optimization, operational
          excellence, and performance efficiency before code generation.
        </p>
      </section>

      <section className="landing-intake">
        <IdeaIntakeForm
          value={state.intakeText}
          onChange={(value) =>
            dispatch({ type: "set-intake-text", payload: value })
          }
          onSubmit={handleStart}
          isLoading={state.intakeLoading}
          errorMessage={state.intakeError}
        />
      </section>
    </main>
  );
}
