import { useEffect, useMemo, useState } from "react";
import { EmptyStatePanel } from "../components/EmptyStatePanel";
import { StatusCard } from "../components/StatusCard";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";
import type {
  DecisionItem,
  DecisionStatus,
  Pillar,
  PillarDefinition,
} from "../types/app";

interface DecisionDraftState {
  title: string;
  description: string;
  selectedOption: string;
  status: DecisionStatus;
  rationale: string;
  risks: string;
}

function createDecisionDraft(): DecisionDraftState {
  return {
    title: "",
    description: "",
    selectedOption: "",
    status: "proposed",
    rationale: "",
    risks: "",
  };
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to complete this operation.";
}

function parseRisks(input: string): string[] {
  return input
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PillarsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const project = state.currentProject;
  const [draft, setDraft] = useState<DecisionDraftState>(createDecisionDraft);
  const [pillarCatalog, setPillarCatalog] = useState<PillarDefinition[]>([]);
  const pillars = useMemo<Pillar[]>(
    () =>
      pillarCatalog.length > 0
        ? pillarCatalog.map((pillar) => pillar.name)
        : [state.selectedPillar],
    [pillarCatalog, state.selectedPillar],
  );

  const hasGuidanceForSelection = useMemo(
    () => state.pillarGuidance?.pillar === state.selectedPillar,
    [state.pillarGuidance, state.selectedPillar],
  );

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }
    let active = true;
    async function loadCatalog() {
      try {
        const definitions = await projectService.listPillars(projectId);
        if (!active) {
          return;
        }
        setPillarCatalog(definitions);
      } catch {
        // Keep page usable even if catalog fetch fails.
      }
    }
    loadCatalog();
    return () => {
      active = false;
    };
  }, [project?.id]);

  if (!project) {
    return <EmptyStatePanel />;
  }
  const projectId = project.id;

  async function loadPillarGuidance() {
    dispatch({ type: "start-pillar-guidance" });
    try {
      const guidance = await projectService.generatePillarGuidance(
        projectId,
        state.selectedPillar,
      );
      dispatch({ type: "pillar-guidance-success", payload: guidance });
    } catch (error) {
      dispatch({ type: "pillar-guidance-failure", payload: getMessage(error) });
    }
  }

  async function saveDecision() {
    if (!draft.title.trim() || !draft.selectedOption.trim() || !draft.rationale.trim()) {
      dispatch({
        type: "decision-save-failure",
        payload:
          "Decision title, selected option, and rationale are required before saving.",
      });
      return;
    }

    const nextDecision: DecisionItem = {
      id: `decision-${Date.now()}`,
      title: draft.title.trim(),
      description: draft.description.trim() || draft.title.trim(),
      selectedOption: draft.selectedOption.trim(),
      status: draft.status,
      pillar: state.selectedPillar,
      rationale: draft.rationale.trim(),
      risks: parseRisks(draft.risks),
      relatedDecisionIds: [],
    };

    dispatch({ type: "start-decision-save" });
    try {
      const updatedProject = await projectService.replaceDecisions(projectId, [
        ...state.decisions,
        nextDecision,
      ]);
      dispatch({ type: "decision-save-success", payload: updatedProject });
      setDraft(createDecisionDraft());
    } catch (error) {
      dispatch({ type: "decision-save-failure", payload: getMessage(error) });
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Pillar workspace</p>
        <h2>Pillar-guided exploration</h2>
        <p>
          Generate grounded nudges per pillar and capture decisions that are
          persisted to local project storage.
        </p>
      </header>

      <section className="pillar-controls">
        <div className="pillar-tabs" role="tablist" aria-label="Pillar selection">
          {pillars.map((pillar) => (
            <button
              key={pillar}
              type="button"
              role="tab"
              aria-selected={state.selectedPillar === pillar}
              className={`pillars-tab${
                state.selectedPillar === pillar ? " pillars-tab-active" : ""
              }`}
              onClick={() =>
                dispatch({ type: "set-selected-pillar", payload: pillar })
              }
            >
              {pillar}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={loadPillarGuidance}
          disabled={state.pillarLoading}
        >
          {state.pillarLoading ? "Generating guidance..." : "Generate guidance"}
        </button>
      </section>

      {state.pillarError ? (
        <p className="error-text" role="alert">
          {state.pillarError}
        </p>
      ) : null}

      {hasGuidanceForSelection && state.pillarGuidance ? (
        <div className="pillar-grid">
          <StatusCard title="Recommended focus" tone="accent">
            <p>{state.pillarGuidance.recommendedFocus}</p>
          </StatusCard>
          <StatusCard title="Guided nudges">
            <ul>
              {state.pillarGuidance.questions.map((question) => (
                <li key={question.id}>
                  <p>
                    <strong>{question.question}</strong>
                  </p>
                  <p>{question.whyItMatters}</p>
                  <p>Risk if ignored: {question.riskIfIgnored}</p>
                  {question.suggestedDefault ? (
                    <p>Suggested default: {question.suggestedDefault}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </StatusCard>
          <StatusCard title="Retrieved guidance">
            <ul>
              {state.pillarGuidance.retrievedGuidance.map((result) => (
                <li key={result.chunk_id}>
                  <p>
                    <strong>{result.citation.title}</strong>
                  </p>
                  <p>{result.citation.heading_path.join(" > ")}</p>
                  <p>{result.citation.source_path}</p>
                </li>
              ))}
            </ul>
          </StatusCard>
        </div>
      ) : (
        <StatusCard title="Guidance status">
          <p>
            Select a pillar and generate guidance to start decision capture for
            that pillar.
          </p>
        </StatusCard>
      )}

      <section className="decision-form-panel">
        <h3>Capture decision for {state.selectedPillar}</h3>
        <div className="decision-form-grid">
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Use managed identity for service-to-service auth"
            />
          </label>
          <label>
            Selected option
            <input
              value={draft.selectedOption}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  selectedOption: event.target.value,
                }))
              }
              placeholder="Managed identity"
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as DecisionStatus,
                }))
              }
            >
              <option value="proposed">proposed</option>
              <option value="confirmed">confirmed</option>
              <option value="unresolved">unresolved</option>
            </select>
          </label>
          <label>
            Description
            <input
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Explain the decision context"
            />
          </label>
        </div>
        <label>
          Rationale
          <textarea
            rows={3}
            value={draft.rationale}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                rationale: event.target.value,
              }))
            }
            placeholder="This reduces credential sprawl and supports least privilege."
          />
        </label>
        <label>
          Risks (one per line)
          <textarea
            rows={2}
            value={draft.risks}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                risks: event.target.value,
              }))
            }
            placeholder="Legacy dependency may require temporary fallback credentials."
          />
        </label>
        <div className="decision-actions">
          <button
            type="button"
            className="primary-button"
            onClick={saveDecision}
            disabled={state.decisionSaving}
          >
            {state.decisionSaving ? "Saving decision..." : "Save decision"}
          </button>
          {state.decisionError ? (
            <p className="error-text" role="alert">
              {state.decisionError}
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
