import { useState } from "react";
import type { RetrievalResult } from "../types/app";

interface GroundingPreviewPanelProps {
  query: string;
  results: RetrievalResult[];
  isLoading: boolean;
  errorMessage: string | null;
  onQueryChange: (value: string) => void;
  onRun: () => void;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export function GroundingPreviewPanel({
  query,
  results,
  isLoading,
  errorMessage,
  onQueryChange,
  onRun,
}: GroundingPreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="grounding-panel">
      <button
        className="grounding-toggle"
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span>Grounding preview</span>
        <span className="toggle-hint">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded ? (
        <div className="grounding-content">
          <p className="grounding-note">
            Validate retrieval integration without leaving the architecture
            workspace.
          </p>
          <form
            className="grounding-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRun();
            }}
          >
            <label htmlFor="grounding-query">Retrieval query</label>
            <div className="grounding-controls">
              <input
                id="grounding-query"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="authentication strategy for small SaaS app"
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? "Loading..." : "Run"}
              </button>
            </div>
          </form>
          {errorMessage ? (
            <p className="error-text" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {results.length === 0 ? (
            <p className="empty-note">
              No guidance loaded yet. Run a query to preview grounded chunks.
            </p>
          ) : (
            <ul className="guidance-list">
              {results.map((result) => (
                <li key={result.chunk_id} className="guidance-item">
                  <h4>{result.citation.title}</h4>
                  <p>
                    <strong>Heading:</strong>{" "}
                    {result.citation.heading_path.join(" > ") || "N/A"}
                  </p>
                  <p>
                    <strong>Source:</strong> {result.citation.source_path}
                  </p>
                  <p>{truncate(result.content, 220)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
