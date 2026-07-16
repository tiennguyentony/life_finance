"use client";

import { formatMoney } from "./format";
import { locationById } from "./locations";
import type { ChoiceId, Decision } from "./model";

const CARD_VARIANTS: Record<ChoiceId, string> = {
  a: "decision-card-blue",
  b: "decision-card-gold",
  c: "decision-card-coral",
};

export function DecisionModal({
  decision,
  cash,
  onChoose,
}: Readonly<{
  decision: Decision;
  cash: number;
  onChoose: (choiceId: ChoiceId) => void;
}>) {
  const location = locationById(decision.locationId);
  return (
    <div aria-labelledby="decision-title" className="modal-backdrop" role="dialog">
      <article className="modal-panel">
        <div className="modal-header">
          <div>
            <p>
              Decision {decision.index + 1} of 5 &middot; {location.name} &middot; Cash{" "}
              {formatMoney(cash)}
            </p>
            <h2 id="decision-title">{decision.title}</h2>
          </div>
        </div>
        <p className="event-description">{decision.prompt}</p>
        <div className="decision-list">
          {decision.options.map((option) => (
            <button
              className={`decision-card ${CARD_VARIANTS[option.id]}`}
              key={option.id}
              onClick={() => onChoose(option.id)}
              type="button"
            >
              <span className="decision-mark" />
              <span className="decision-copy">
                <strong>{option.label}</strong>
                <small>{option.flavor}</small>
              </span>
              <span className="decision-meta">
                {option.effectChips.map((chip) => (
                  <b key={chip}>{chip}</b>
                ))}
              </span>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}
