import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { IntakePage } from "./pages/IntakePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate replace to="/intake" />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route path="/project" element={<ProjectWorkspacePage />} />
        <Route
          path="/pillars"
          element={
            <PlaceholderPage
              title="Pillars workspace"
              description="This area will host pillar-by-pillar exploration and tradeoff guidance."
            />
          }
        />
        <Route
          path="/decisions"
          element={
            <PlaceholderPage
              title="Decision register"
              description="This area will track architecture decisions, status, rationale, and linked risks."
            />
          }
        />
        <Route
          path="/risks"
          element={
            <PlaceholderPage
              title="Risk register"
              description="This area will centralize unresolved risks and mitigation plans."
            />
          }
        />
        <Route
          path="/outputs"
          element={
            <PlaceholderPage
              title="Outputs"
              description="This area will package architecture summaries and implementation-ready prompts."
            />
          }
        />
        <Route
          path="/settings"
          element={
            <PlaceholderPage
              title="Settings"
              description="This area will hold environment, provider, and project preferences."
            />
          }
        />
        <Route path="*" element={<Navigate replace to="/intake" />} />
      </Routes>
    </AppShell>
  );
}
