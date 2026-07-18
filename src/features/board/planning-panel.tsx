"use client";

import type { BoardDestinationId, BoardPlan } from "./plan-catalog";

type PlanningPanelProps = Readonly<{
  busy: boolean;
  commitVariant?: "plan" | "finish_month" | "refresh";
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
  commitVariant = "plan",
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
  const recovering = commitVariant !== "plan";
  const status = commitVariant === "finish_month"
    ? busy ? "Finishing this month..." : "Ready to finish this month."
    : commitVariant === "refresh"
      ? busy ? "Refreshing the board..." : "Refresh the board before trying this plan again."
      : busy ? "Saving your plan..." : "Ready to live this month.";
  const commitLabel = commitVariant === "finish_month"
    ? "Finish this month"
    : commitVariant === "refresh"
      ? "Refresh board"
      : busy ? "Saving..." : "Live this month";

  return (
    <section aria-labelledby="board-plan-title" className="board-planning-panel">
      <header className="board-planning-header">
        <div>
          <p>At {destinationLabels[destinationId]}</p>
          <h2 id="board-plan-title">Choose your plan</h2>
          <p>Preview what changes now and what may change later.</p>
        </div>
        {recovering ? null : (
          <button aria-label="Close plan chooser" onClick={onClose} type="button">
            Close
          </button>
        )}
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {commitVariant === "finish_month" ? (
        <p>This recovery will not submit a plan again. Finish this month before choosing another focus.</p>
      ) : commitVariant === "refresh" ? (
        <p>Refresh the authoritative run before choosing another focus or retrying the plan.</p>
      ) : null}

      <div aria-label="Available plans" className="board-plan-options" role="group">
        {plans.map((plan) => {
          const selected = plan.id === selectedPlanId;
          return (
            <div className="board-plan-option" key={plan.id}>
              <button
                aria-pressed={selected}
                className="board-plan-card"
                disabled={plan.disabledReason !== null || busy || recovering}
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
          {status}
        </p>
        <button disabled={!canCommit} onClick={onCommit} type="button">
          {commitLabel}
        </button>
      </footer>
    </section>
  );
}
