"use client";

import type { BoardDestinationId, BoardPlan } from "./plan-catalog";

type PlanningPanelProps = Readonly<{
  busy: boolean;
  destinationId: BoardDestinationId;
  errorMessage: string | null;
  onClose: () => void;
  onCommit: () => void;
  onSelectPlan: (planId: string) => void;
  plans: readonly BoardPlan[];
  selectedPlanId: string | null;
}>;

const destinationLabels: Readonly<Record<BoardDestinationId, string>> = {
  home: "Home",
  bank: "Bank",
  financial: "Financial district",
  startup: "Startup studio",
  hospital: "Hospital",
};

export function PlanningPanel({
  busy,
  destinationId,
  errorMessage,
  onClose,
  onCommit,
  onSelectPlan,
  plans,
  selectedPlanId,
}: PlanningPanelProps) {
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const canCommit = selectedPlan !== null && selectedPlan.disabledReason === null && !busy;

  return (
    <section aria-labelledby="board-plan-title" className="board-planning-panel">
      <header className="board-planning-header">
        <div>
          <p>At {destinationLabels[destinationId]}</p>
          <h2 id="board-plan-title">Choose your plan</h2>
          <p>Preview what changes now and what may change later.</p>
        </div>
        <button aria-label="Close plan chooser" onClick={onClose} type="button">
          Close
        </button>
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <div aria-label="Available plans" className="board-plan-options" role="group">
        {plans.map((plan) => {
          const selected = plan.id === selectedPlanId;
          return (
            <div className="board-plan-option" key={plan.id}>
              <button
                aria-pressed={selected}
                className="board-plan-card"
                disabled={plan.disabledReason !== null || busy}
                onClick={() => onSelectPlan(plan.id)}
                type="button"
              >
                <strong>{plan.label}</strong>
                <span>{plan.description}</span>
                {plan.effects.map((effect) => (
                  <span data-tone={effect.tone} key={`${effect.label}.${effect.value}`}>
                    <b>{effect.label}</b> {effect.value}
                    <small>{effect.certainty === "exact" ? "Exact" : "Directional"}</small>
                  </span>
                ))}
              </button>
              {plan.disabledReason ? (
                <p className="board-plan-disabled-reason">{plan.disabledReason}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="board-planning-actions">
        <p aria-live="polite" className="board-commit-status">
          {busy ? "Saving your plan..." : "Ready to live this month."}
        </p>
        <button disabled={!canCommit} onClick={onCommit} type="button">
          {busy ? "Saving..." : "Live this month"}
        </button>
      </footer>
    </section>
  );
}
