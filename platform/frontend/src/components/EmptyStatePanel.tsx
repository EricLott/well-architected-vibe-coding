import { Link } from "react-router-dom";

export function EmptyStatePanel() {
  return (
    <section className="empty-state-panel">
      <h3>Project not initialized yet</h3>
      <p>
        Start with your app idea to begin guided pillar decisions in the
        architecture workspace.
      </p>
      <Link className="primary-button" to="/">
        Start with idea
      </Link>
    </section>
  );
}
