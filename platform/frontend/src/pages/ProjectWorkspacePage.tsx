import { GroundingPreviewPanel } from "../components/GroundingPreviewPanel";
import { EmptyStatePanel } from "../components/EmptyStatePanel";
import { StatusCard } from "../components/StatusCard";
import { useGuidancePreview } from "../hooks/useGuidancePreview";
import { useAppState } from "../state/AppContext";

export function ProjectWorkspacePage() {
  const state = useAppState();
  const guidance = useGuidancePreview();
  const project = state.currentProject;

  if (!project) {
    return <EmptyStatePanel />;
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <p className="section-kicker">Project initialized</p>
        <h2>{project.name}</h2>
        <p>
          The idea is captured. Continue with structured, pillar-aware decisions
          before moving into implementation prompts.
        </p>
      </header>

      <div className="workspace-grid">
        <StatusCard title="Entered idea" tone="accent">
          <p>{project.ideaSummary}</p>
        </StatusCard>
        <StatusCard title="Current focus">
          <p>{project.currentFocus}</p>
        </StatusCard>
        <StatusCard title="Inferred missing areas">
          <ul>
            {project.inferredMissingAreas.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </StatusCard>
        <StatusCard title="Decisions">
          <p>
            {state.decisions.length === 0
              ? "No decisions captured yet."
              : `${state.decisions.length} decisions captured.`}
          </p>
        </StatusCard>
        <StatusCard title="Risks" tone="warning">
          <ul>
            {state.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </StatusCard>
        <StatusCard title="Open questions">
          <ul>
            {state.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </StatusCard>
        <StatusCard title="Next recommended action" tone="accent">
          <p>{state.nextStep}</p>
        </StatusCard>
      </div>

      <GroundingPreviewPanel
        query={guidance.query}
        onQueryChange={guidance.setQuery}
        onRun={guidance.runQuery}
        isLoading={guidance.isLoading}
        errorMessage={guidance.errorMessage}
        results={guidance.results}
      />
    </section>
  );
}
