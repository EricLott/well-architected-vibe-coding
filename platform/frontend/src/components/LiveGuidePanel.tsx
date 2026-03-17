import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { generateAssistantGuidance } from "../services/assistantService";
import { useAppDispatch, useAppState } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to get guidance right now.";
}

function phaseFromPath(pathname: string): string {
  if (pathname.includes("pillars")) {
    return "pillar-guided-exploration";
  }
  if (pathname.includes("decisions")) {
    return "decision-graph";
  }
  if (pathname.includes("risks")) {
    return "risk-analysis";
  }
  if (pathname.includes("outputs")) {
    return "output-generation";
  }
  if (pathname.includes("project")) {
    return "project-workspace";
  }
  return "idea-intake";
}

export function LiveGuidePanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const lastPhaseRef = useRef<string>("");

  const phase = useMemo(() => phaseFromPath(location.pathname), [location.pathname]);

  async function requestGuidance(customMessage: string) {
    dispatch({ type: "start-guide-request" });
    try {
      const response = await generateAssistantGuidance({
        phase,
        userMessage: customMessage,
        project: state.currentProject,
        aiSettings: state.aiSettings,
      });
      dispatch({ type: "guide-request-success", payload: response });
    } catch (error) {
      dispatch({ type: "guide-request-failure", payload: getMessage(error) });
    }
  }

  const response = state.guideResponse;

  useEffect(() => {
    if (state.guideLoading) {
      return;
    }
    if (lastPhaseRef.current === phase && response) {
      return;
    }
    lastPhaseRef.current = phase;
    void requestGuidance("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <section className="live-guide-panel">
      <header className="live-guide-header">
        <div>
          <p className="section-kicker">Live guidance</p>
          <h3>Architecture copilot</h3>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => requestGuidance("")}
          disabled={state.guideLoading}
        >
          {state.guideLoading ? "Refreshing..." : "Refresh guidance"}
        </button>
      </header>

      <div className="live-guide-body">
        <p className="helper-text">
          {response?.summary ??
            "Ask for next-step guidance to keep architecture progress moving."}
        </p>
        {response?.warning ? (
          <p className="warning-text" role="status">
            {response.warning}
          </p>
        ) : null}
        {response?.nextActions?.length ? (
          <ul>
            {response.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        ) : null}
        {response?.questions?.length ? (
          <ul>
            {response.questions.map((question) => (
              <li key={question.question}>
                <strong>{question.question}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form
        className="live-guide-form"
        onSubmit={(event) => {
          event.preventDefault();
          requestGuidance(message.trim());
        }}
      >
        <label htmlFor="live-guide-input">Ask the architecture copilot</label>
        <div className="grounding-controls">
          <input
            id="live-guide-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What should we decide next to reduce risk?"
          />
          <button type="submit" disabled={state.guideLoading}>
            Ask
          </button>
        </div>
      </form>

      {state.guideError ? (
        <p className="error-text" role="alert">
          {state.guideError}
        </p>
      ) : null}
      <p className="provider-note">
        Provider:{" "}
        {state.aiSettings.enabled
          ? `${state.aiSettings.provider} (${state.aiSettings.model})`
          : "heuristic mode"}
      </p>
    </section>
  );
}
