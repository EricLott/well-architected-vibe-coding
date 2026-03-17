interface HeaderBarProps {
  phaseLabel: string;
  focusLabel: string;
}

export function HeaderBar({ phaseLabel, focusLabel }: HeaderBarProps) {
  return (
    <header className="header-bar">
      <div>
        <p className="header-kicker">Well-Architected Vibe Coding</p>
        <h2>Architecture workspace</h2>
      </div>
      <div className="header-status" aria-label="Current phase status">
        <p className="phase-chip">{phaseLabel}</p>
        <p className="focus-label">{focusLabel}</p>
      </div>
    </header>
  );
}
