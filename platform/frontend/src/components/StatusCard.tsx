import type { ReactNode } from "react";

type CardTone = "default" | "warning" | "accent";

interface StatusCardProps {
  title: string;
  tone?: CardTone;
  children: ReactNode;
}

export function StatusCard({ title, tone = "default", children }: StatusCardProps) {
  return (
    <section className={`status-card tone-${tone}`}>
      <h3>{title}</h3>
      <div className="status-card-content">{children}</div>
    </section>
  );
}
