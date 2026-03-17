interface InfoTooltipProps {
  label: string;
  content: string;
  tone?: "neutral" | "accent" | "warning";
}

export function InfoTooltip({
  label,
  content,
  tone = "neutral",
}: InfoTooltipProps) {
  return (
    <span className={`info-tooltip info-tooltip-${tone}`}>
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label={`${label}. Hover or focus for details.`}
        title={label}
      >
        <span aria-hidden="true">i</span>
        <span className="sr-only">{label}</span>
      </button>
      <span className="info-tooltip-popup" role="tooltip">
        <strong>{label}</strong>
        <span>{content}</span>
      </span>
    </span>
  );
}
