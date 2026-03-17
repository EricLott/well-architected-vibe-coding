import { Link } from "react-router-dom";

export function EmptyStatePanel() {
  return (
    <section className="empty-state-panel">
      <h3>Project not initialized yet</h3>
      <p>
        Start on the intake page to capture your app idea before entering the
        architecture workspace.
      </p>
      <Link className="primary-button" to="/intake">
        Go to intake
      </Link>
    </section>
  );
}
