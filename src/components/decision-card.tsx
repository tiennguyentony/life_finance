import type { DecisionView } from "@/types/game";

type DecisionCardProps = {
  readonly decision: DecisionView;
  readonly disabled?: boolean;
  readonly onChoose: (decision: DecisionView) => void;
};

export function DecisionCard({ decision, disabled, onChoose }: DecisionCardProps) {
  return (
    <button
      className={`decision-card decision-card-${decision.tone}`}
      disabled={disabled}
      onClick={() => onChoose(decision)}
      type="button"
    >
      <span className="decision-mark" aria-hidden="true" />
      <span className="decision-copy">
        <strong>{decision.title}</strong>
        <small>{decision.description}</small>
      </span>
      <span className="decision-meta">
        <b>{decision.cost}</b>
        <em>{decision.impact}</em>
      </span>
    </button>
  );
}
