import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InfoTooltip } from "../components/InfoTooltip";
import { StatusCard } from "../components/StatusCard";
import { generateAssistantGuidance } from "../services/assistantService";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";
import type { DecisionItem, Pillar, PillarQuestion } from "../types/app";

const pillars: Pillar[] = [
  "Reliability",
  "Security",
  "Cost Optimization",
  "Operational Excellence",
  "Performance Efficiency",
];

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to complete this action.";
}

function decisionCountByPillar(decisions: DecisionItem[]): Record<Pillar, number> {
  const counts: Record<Pillar, number> = {
    Reliability: 0,
    Security: 0,
    "Cost Optimization": 0,
    "Operational Excellence": 0,
    "Performance Efficiency": 0,
  };

  for (const decision of decisions) {
    counts[decision.pillar] += 1;
  }
  return counts;
}

function statusLabel(count: number): string {
  if (count >= 3) {
    return "strong";
  }
  if (count >= 1) {
    return "in progress";
  }
  return "not started";
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function GuidedWorkspacePage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const project = state.currentProject;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const counts = useMemo(() => decisionCountByPillar(state.decisions), [state.decisions]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      navigate("/", { replace: true });
      return;
    }
    const selectedProjectId = projectId;
    let active = true;
    async function hydrate() {
      dispatch({ type: "start-pillar-guidance" });
      try {
        const guidance = await projectService.generatePillarGuidance(
          selectedProjectId,
          state.selectedPillar,
        );
        if (!active) {
          return;
        }
        dispatch({ type: "pillar-guidance-success", payload: guidance });
      } catch (error) {
        if (!active) {
          return;
        }
        dispatch({ type: "pillar-guidance-failure", payload: getMessage(error) });
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, [dispatch, navigate, project?.id, state.selectedPillar]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId || !project) {
      return;
    }
    const selectedProjectId = projectId;
    let active = true;
    async function syncSignals() {
      try {
        const [conflicts, guidance] = await Promise.all([
          projectService.analyzeConflicts(selectedProjectId),
          generateAssistantGuidance({
            phase: "pillar-guided-exploration",
            userMessage: "",
            project,
            aiSettings: state.aiSettings,
          }),
        ]);
        if (!active) {
          return;
        }
        dispatch({ type: "conflict-analysis-success", payload: conflicts });
        dispatch({ type: "guide-request-success", payload: guidance });
      } catch {
        // Do not block workspace rendering on this background sync.
      }
    }
    syncSignals();
    return () => {
      active = false;
    };
  }, [dispatch, project?.id, state.aiSettings]);

  if (!project) {
    return null;
  }
  const currentProjectId = project.id;

  const guidance = state.pillarGuidance;
  const relevantQuestions =
    guidance?.pillar === state.selectedPillar ? guidance.questions : [];
  const questionSignature = useMemo(
    () => relevantQuestions.map((question) => question.id).join("|"),
    [relevantQuestions],
  );

  const answeredQuestionTitles = useMemo(
    () =>
      new Set(
        state.decisions
          .filter((decision) => decision.pillar === state.selectedPillar)
          .map((decision) => normalize(decision.title)),
      ),
    [state.decisions, state.selectedPillar],
  );

  const answeredCount = useMemo(
    () =>
      relevantQuestions.filter((question) =>
        answeredQuestionTitles.has(normalize(question.question)),
      ).length,
    [answeredQuestionTitles, relevantQuestions],
  );

  const progressPercent =
    relevantQuestions.length === 0
      ? 0
      : Math.round((answeredCount / relevantQuestions.length) * 100);
  const activeQuestion = relevantQuestions[activeQuestionIndex] ?? null;
  const activeQuestionSaved = activeQuestion
    ? answeredQuestionTitles.has(normalize(activeQuestion.question))
    : false;

  useEffect(() => {
    if (relevantQuestions.length === 0) {
      setActiveQuestionIndex(0);
      return;
    }
    const firstUnansweredIndex = relevantQuestions.findIndex(
      (question) => !answeredQuestionTitles.has(normalize(question.question)),
    );
    if (firstUnansweredIndex === -1) {
      setActiveQuestionIndex(0);
      return;
    }
    setActiveQuestionIndex(firstUnansweredIndex);
  }, [state.selectedPillar, questionSignature, answeredQuestionTitles, relevantQuestions]);

  async function switchPillar(pillar: Pillar) {
    dispatch({ type: "set-selected-pillar", payload: pillar });
  }

  async function saveDecision(question: PillarQuestion) {
    const answer = normalize(answers[question.id] ?? "");
    if (!answer) {
      dispatch({
        type: "decision-save-failure",
        payload: "Add your selected approach before saving this decision.",
      });
      return;
    }

    const decision: DecisionItem = {
      id: `decision-${Date.now()}-${question.id}`,
      title: question.question,
      description: question.question,
      selectedOption: answer,
      status: "confirmed",
      pillar: question.pillar,
      rationale: question.whyItMatters,
      risks: [question.riskIfIgnored],
      relatedDecisionIds: [],
    };

    const existingDecisionIndex = state.decisions.findIndex(
      (item) =>
        item.pillar === question.pillar &&
        normalize(item.title) === normalize(question.question),
    );
    const updatedDecisions =
      existingDecisionIndex === -1
        ? [...state.decisions, decision]
        : state.decisions.map((item, index) =>
            index === existingDecisionIndex
              ? {
                  ...item,
                  title: decision.title,
                  description: decision.description,
                  selectedOption: decision.selectedOption,
                  status: decision.status,
                  rationale: decision.rationale,
                  risks: decision.risks,
                }
              : item,
          );

    dispatch({ type: "start-decision-save" });
    try {
      const updatedProject = await projectService.replaceDecisions(currentProjectId, updatedDecisions);
      dispatch({ type: "decision-save-success", payload: updatedProject });
      setAnswers((current) => ({ ...current, [question.id]: answer }));

      const conflicts = await projectService.analyzeConflicts(currentProjectId);
      dispatch({ type: "conflict-analysis-success", payload: conflicts });
      setActiveQuestionIndex((current) =>
        Math.min(current + 1, Math.max(0, relevantQuestions.length - 1)),
      );
    } catch (error) {
      dispatch({ type: "decision-save-failure", payload: getMessage(error) });
    }
  }

  return (
    <main className="guided-layout">
      <aside className="pillar-rail">
        <div className="rail-header">
          <p className="section-kicker">Project</p>
          <h2>{project.name}</h2>
          <p>{project.ideaText}</p>
        </div>
        <nav className="pillar-list" aria-label="Pillar journey">
          {pillars.map((pillar) => (
            <button
              key={pillar}
              type="button"
              className={`pillar-item${
                state.selectedPillar === pillar ? " pillar-item-active" : ""
              }`}
              onClick={() => switchPillar(pillar)}
            >
              <span>{pillar}</span>
              <span className="pillar-meta">
                {statusLabel(counts[pillar])} ({counts[pillar]})
              </span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/settings")}
          >
            AI settings
          </button>
        </div>
      </aside>

      <section className="guided-main">
        <header className="guided-header">
          <p className="section-kicker">Guided architecture flow</p>
          <h1>{state.selectedPillar}</h1>
          <p>
            We will make this pillar actionable one decision at a time.
          </p>
        </header>

        {state.pillarError ? (
          <p className="error-text" role="alert">
            {state.pillarError}
          </p>
        ) : null}

        <div className="question-stack">
          {state.pillarLoading ? (
            <StatusCard title="Loading guidance">
              <p>Retrieving framework guidance for {state.selectedPillar}...</p>
            </StatusCard>
          ) : relevantQuestions.length === 0 ? (
            <StatusCard title="No guided questions yet">
              <p>
                Generate pillar guidance by selecting another pillar and returning,
                or run ingestion if retrieval index is missing.
              </p>
            </StatusCard>
          ) : (
            <section className="conversation-card">
              <div className="conversation-progress">
                <div>
                  <p className="conversation-counter">
                    Question {activeQuestionIndex + 1} of {relevantQuestions.length}
                  </p>
                  <p className="conversation-subtitle">
                    {answeredCount} of {relevantQuestions.length} decisions captured
                  </p>
                </div>
                <div className="conversation-meter" aria-hidden="true">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div
                className="question-dots"
                role="group"
                aria-label={`${state.selectedPillar} question navigation`}
              >
                {relevantQuestions.map((question, index) => {
                  const isAnswered = answeredQuestionTitles.has(
                    normalize(question.question),
                  );
                  const isActive = activeQuestionIndex === index;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      className={`question-dot${isActive ? " question-dot-active" : ""}${
                        isAnswered ? " question-dot-complete" : ""
                      }`}
                      aria-label={`Question ${index + 1}: ${question.question}`}
                      title={`Question ${index + 1}: ${question.question}`}
                      onClick={() => setActiveQuestionIndex(index)}
                    />
                  );
                })}
              </div>

              {activeQuestion ? (
                <>
                  <article className="coach-card">
                    <p className="coach-kicker">Architecture coach</p>
                    <h3>{activeQuestion.question}</h3>
                    <div className="question-context-row">
                      <InfoTooltip
                        label="Why this matters"
                        content={activeQuestion.whyItMatters}
                        tone="accent"
                      />
                      <InfoTooltip
                        label="Risk if skipped"
                        content={activeQuestion.riskIfIgnored}
                        tone="warning"
                      />
                      {activeQuestion.suggestedDefault ? (
                        <InfoTooltip
                          label="Suggested default"
                          content={activeQuestion.suggestedDefault}
                        />
                      ) : null}
                    </div>
                  </article>

                  <section className="response-card">
                    <label htmlFor={`decision-${activeQuestion.id}`} className="form-label">
                      Your decision
                    </label>
                    <textarea
                      id={`decision-${activeQuestion.id}`}
                      rows={4}
                      className="idea-textarea"
                      value={answers[activeQuestion.id] ?? ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [activeQuestion.id]: event.target.value,
                        }))
                      }
                      placeholder="Describe the option you choose in 1-2 concise sentences."
                    />
                    <p className="helper-text">
                      Keep it practical. You can refine details after the pillar pass.
                    </p>
                    {state.decisionError ? (
                      <p className="error-text" role="alert">
                        {state.decisionError}
                      </p>
                    ) : null}
                    <div className="conversation-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setActiveQuestionIndex((current) => Math.max(current - 1, 0))
                        }
                        disabled={activeQuestionIndex === 0 || state.decisionSaving}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setActiveQuestionIndex((current) =>
                            Math.min(current + 1, relevantQuestions.length - 1),
                          )
                        }
                        disabled={
                          activeQuestionIndex >= relevantQuestions.length - 1 ||
                          state.decisionSaving
                        }
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => saveDecision(activeQuestion)}
                        disabled={state.decisionSaving}
                      >
                        {state.decisionSaving
                          ? "Saving..."
                          : activeQuestionSaved
                            ? "Update decision"
                            : "Save and continue"}
                      </button>
                    </div>
                  </section>
                </>
              ) : null}
            </section>
          )}
        </div>
      </section>

      <aside className="insight-rail">
        <StatusCard title="Next actions" tone="accent">
          {state.guideResponse ? (
            <ul>
              {state.guideResponse.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <p>Guidance will appear as you progress through pillars.</p>
          )}
        </StatusCard>

        <StatusCard title="Risk pulse" tone="warning">
          <p>{state.conflicts?.summary ?? "Run pillar decisions to unlock risk pulse."}</p>
          {state.conflicts?.conflicts.slice(0, 2).map((conflict) => (
            <p key={conflict.id}>
              <strong>{conflict.severity.toUpperCase()}:</strong> {conflict.title}
            </p>
          ))}
        </StatusCard>

        <StatusCard title="Decision coverage">
          <ul>
            {pillars.map((pillar) => (
              <li key={pillar}>
                {pillar}: {counts[pillar]}
              </li>
            ))}
          </ul>
        </StatusCard>
      </aside>
    </main>
  );
}
