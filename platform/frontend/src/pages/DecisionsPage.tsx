import { useEffect, useMemo, useState } from "react";
import { EmptyStatePanel } from "../components/EmptyStatePanel";
import { StatusCard } from "../components/StatusCard";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";
import type { DecisionLinkType } from "../types/app";

const linkTypes: DecisionLinkType[] = [
  "depends-on",
  "conflicts-with",
  "enables",
  "related",
];

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load decision graph.";
}

export function DecisionsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const project = state.currentProject;
  const [fromDecisionId, setFromDecisionId] = useState("");
  const [toDecisionId, setToDecisionId] = useState("");
  const [linkType, setLinkType] = useState<DecisionLinkType>("depends-on");
  const [rationale, setRationale] = useState("");

  const graph = state.decisionGraph;
  const links = graph?.links ?? [];

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }
    const selectedProjectId = projectId;
    let active = true;

    async function loadGraph() {
      dispatch({ type: "start-graph-load" });
      try {
        const nextGraph = await projectService.getDecisionGraph(selectedProjectId);
        if (!active) {
          return;
        }
        dispatch({ type: "graph-load-success", payload: nextGraph });
      } catch (error) {
        if (!active) {
          return;
        }
        dispatch({ type: "graph-load-failure", payload: getMessage(error) });
      }
    }

    loadGraph();
    return () => {
      active = false;
    };
  }, [dispatch, project?.id]);

  const options = useMemo(() => state.decisions, [state.decisions]);

  if (!project) {
    return <EmptyStatePanel />;
  }
  const projectId = project.id;

  async function addLink() {
    if (!fromDecisionId || !toDecisionId) {
      dispatch({
        type: "decision-save-failure",
        payload: "Select both source and target decisions to create a graph link.",
      });
      return;
    }
    if (fromDecisionId === toDecisionId) {
      dispatch({
        type: "decision-save-failure",
        payload: "Source and target decisions must be different.",
      });
      return;
    }

    const nextLinks = [
      ...links,
      {
        id: `link-${Date.now()}`,
        fromDecisionId,
        toDecisionId,
        type: linkType,
        rationale: rationale.trim(),
      },
    ];

    dispatch({ type: "start-decision-save" });
    try {
      const response = await projectService.replaceDecisionGraph(
        projectId,
        state.decisions,
        nextLinks,
      );
      dispatch({ type: "decision-save-success", payload: response.project });
      dispatch({ type: "graph-load-success", payload: response.graph });
      setRationale("");
    } catch (error) {
      dispatch({ type: "decision-save-failure", payload: getMessage(error) });
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Decision graph</p>
        <h2>Architecture decision model</h2>
        <p>
          Capture relationships between decisions so downstream conflict analysis and
          outputs use real dependencies instead of flat text.
        </p>
      </header>

      <div className="status-grid">
        <StatusCard title="Graph status" tone="accent">
          <p>
            Nodes: {state.decisions.length} | Links: {links.length}
          </p>
          <p>
            Unresolved decisions: {graph?.unresolvedDecisionIds.length ?? 0}
          </p>
        </StatusCard>
        <StatusCard title="Persistence">
          <p>
            Graph updates are persisted locally via
            `PUT /projects/:projectId/decision-graph`.
          </p>
          {state.graphLoading ? <p>Loading decision graph...</p> : null}
          {state.graphError ? (
            <p className="error-text" role="alert">
              {state.graphError}
            </p>
          ) : null}
        </StatusCard>
      </div>

      {state.decisions.length === 0 ? (
        <StatusCard title="No decisions yet">
          <p>
            Use the pillar workspace to create decisions before building graph
            relationships.
          </p>
        </StatusCard>
      ) : (
        <>
          <section className="decision-form-panel">
            <h3>Add decision relationship</h3>
            <div className="decision-form-grid">
              <label>
                From decision
                <select
                  value={fromDecisionId}
                  onChange={(event) => setFromDecisionId(event.target.value)}
                >
                  <option value="">Select a decision</option>
                  {options.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.pillar}: {decision.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To decision
                <select
                  value={toDecisionId}
                  onChange={(event) => setToDecisionId(event.target.value)}
                >
                  <option value="">Select a decision</option>
                  {options.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.pillar}: {decision.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Link type
                <select
                  value={linkType}
                  onChange={(event) =>
                    setLinkType(event.target.value as DecisionLinkType)
                  }
                >
                  {linkTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rationale
                <input
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                  placeholder="Explain why this relationship exists"
                />
              </label>
            </div>
            <div className="decision-actions">
              <button
                type="button"
                className="primary-button"
                onClick={addLink}
                disabled={state.decisionSaving}
              >
                {state.decisionSaving ? "Saving graph..." : "Add graph link"}
              </button>
              {state.decisionError ? (
                <p className="error-text" role="alert">
                  {state.decisionError}
                </p>
              ) : null}
            </div>
          </section>

          <div className="status-grid">
            {state.decisions.map((decision) => (
              <StatusCard
                key={decision.id}
                title={`${decision.pillar}: ${decision.title}`}
                tone="accent"
              >
                <p>
                  <strong>Status:</strong> {decision.status}
                </p>
                <p>
                  <strong>Option:</strong> {decision.selectedOption}
                </p>
                <p>{decision.rationale}</p>
              </StatusCard>
            ))}
          </div>

          <StatusCard title="Graph links">
            {links.length === 0 ? (
              <p>No links captured yet.</p>
            ) : (
              <ul>
                {links.map((link) => (
                  <li key={link.id}>
                    <p>
                      <strong>{link.type}</strong>: {link.fromDecisionId} {"->"}{" "}
                      {link.toDecisionId}
                    </p>
                    {link.rationale ? <p>{link.rationale}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </StatusCard>
        </>
      )}
    </section>
  );
}
