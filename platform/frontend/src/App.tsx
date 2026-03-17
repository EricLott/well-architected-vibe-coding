import { Navigate, Route, Routes } from "react-router-dom";
import { useProjectBootstrap } from "./hooks/useProjectBootstrap";
import { AppShell } from "./layouts/AppShell";
import { DecisionsPage } from "./pages/DecisionsPage";
import { GuidedWorkspacePage } from "./pages/GuidedWorkspacePage";
import { LandingIdeaPage } from "./pages/LandingIdeaPage";
import { OutputsPage } from "./pages/OutputsPage";
import { PillarsPage } from "./pages/PillarsPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { RisksPage } from "./pages/RisksPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useAppState } from "./state/AppContext";

export function App() {
  useProjectBootstrap();
  const state = useAppState();

  return (
    <>
      {state.appLoading ? (
        <p className="inline-info-banner">Loading persisted project state...</p>
      ) : null}
      {state.appError ? (
        <p className="inline-error-banner" role="alert">
          {state.appError}
        </p>
      ) : null}

      <Routes>
        <Route path="/" element={<LandingIdeaPage />} />
        <Route
          path="/workspace"
          element={
            <AppShell>
              <GuidedWorkspacePage />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell>
              <SettingsPage />
            </AppShell>
          }
        />
        <Route
          path="/project"
          element={
            <AppShell>
              <ProjectWorkspacePage />
            </AppShell>
          }
        />
        <Route
          path="/pillars"
          element={
            <AppShell>
              <PillarsPage />
            </AppShell>
          }
        />
        <Route
          path="/decisions"
          element={
            <AppShell>
              <DecisionsPage />
            </AppShell>
          }
        />
        <Route
          path="/risks"
          element={
            <AppShell>
              <RisksPage />
            </AppShell>
          }
        />
        <Route
          path="/outputs"
          element={
            <AppShell>
              <OutputsPage />
            </AppShell>
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </>
  );
}
