import type { ReactNode } from "react";
import { SidebarNav } from "../components/SidebarNav";

const navItems = [
  { label: "Guided workspace", path: "/workspace" },
  { label: "Decision graph", path: "/decisions" },
  { label: "Risk analysis", path: "/risks" },
  { label: "Output pack", path: "/outputs" },
  { label: "Settings", path: "/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <p className="brand-kicker">Architecture-first</p>
          <h1>Vibe Architecting</h1>
          <p className="brand-copy">
            Agentic pillar guidance for modern systems.
          </p>
        </div>
        <SidebarNav items={navItems} />
      </aside>
      <div className="shell-main">
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
