"use client";

import { formatMoney } from "@/features/play/play-model";

import { locationById } from "./locations";
import type { ChoiceId, Decision } from "./model";

const OPTION_LETTERS: Record<ChoiceId, string> = { a: "A", b: "B", c: "C" };

/**
 * The Frostpunk beat, softened: the world dims, one situation card takes the
 * table, and three deed-style options carry their costs on their face.
 */
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
    <div
      aria-labelledby="decision-title"
      className={`game-overlay decision-overlay${
        decision.id === "crisis" ? " is-crisis" : ""
      }`}
      role="dialog"
    >
      <article className="game-card decision-card">
        <div className="chip-row">
          <span className="chip chip-accent">Decision {decision.index + 1} of 5</span>
          <span className="chip">{location.name}</span>
          <span className="chip tnum">Cash {formatMoney(cash * 100)}</span>
        </div>
        <h2 id="decision-title">{decision.title}</h2>
        <p className="decision-prompt">{decision.prompt}</p>
        <div className="deed-row">
          {decision.options.map((option, index) => (
            <button
              autoFocus={index === 0}
              className="deed-card"
              key={option.id}
              onClick={() => onChoose(option.id)}
              type="button"
            >
              <span className="deed-band">
                <span className="deed-letter">{OPTION_LETTERS[option.id]}</span>
                {option.label}
              </span>
              <span className="deed-flavor">{option.flavor}</span>
              <span className="chip-row deed-chips">
                {option.effectChips.map((chip) => (
                  <span className="chip tnum" key={chip}>
                    {chip}
                  </span>
                ))}
              </span>
              <span className="deed-cta">Choose</span>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}
