import type { ReactNode } from "react";
import { HeaderBar } from "../components/HeaderBar";
import { SidebarNav } from "../components/SidebarNav";
import { useAppState } from "../state/AppContext";

const navItems = [
  { label: "Guided workspace", path: "/workspace" },
  { label: "Decision graph", path: "/decisions" },
  { label: "Risk analysis", path: "/risks" },
  { label: "Output pack", path: "/outputs" },
  { label: "Settings", path: "/settings" },
];

function getPhaseLabel(phase: string): string {
  return phase === "project-initialized"
    ? "Phase 1 initialized"
    : "Phase 1 intake";
}

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <p className="brand-kicker">Architecture-first</p>
          <h1>Well-Architected Vibe Coding</h1>
          <p className="brand-copy">
            Guided pillar decisions before implementation.
          </p>
        </div>
        <SidebarNav items={navItems} />
      </aside>
      <div className="shell-main">
        <HeaderBar
          phaseLabel={getPhaseLabel(state.currentPhase)}
          focusLabel={state.pillarFocus}
        />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
