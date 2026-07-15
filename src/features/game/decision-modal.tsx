"use client";

import { useEffect, useState } from "react";

import { DecisionCard } from "@/components/decision-card";
import { useGame } from "@/components/game-provider";
import { Sprout } from "@/components/sprout";
import { getDecisionOptions } from "@/services/event.service";
import type { DecisionView } from "@/types/game";

type DecisionModalProps = {
  readonly onClose: () => void;
};

export function DecisionModal({ onClose }: DecisionModalProps) {
  const { makeDecision } = useGame();
  const [decisions, setDecisions] = useState<readonly DecisionView[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDecisionOptions({ delayMs: 450 })
      .then((result) => {
        if (active) setDecisions(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Moves unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleChoose(decision: DecisionView) {
    setSubmittingId(decision.id);
    setError(null);
    try {
      await makeDecision(decision.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Move failed.");
      setSubmittingId(null);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="decision-title"
        aria-modal="true"
        className="modal-panel decision-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p>One move this month</p>
            <h2 id="decision-title">What is the play?</h2>
          </div>
          <button aria-label="Close decision menu" className="modal-close" onClick={onClose} type="button">X</button>
        </header>
        <div className="decision-layout">
          <div className="decision-list">
            {decisions.length === 0 && !error ? (
              Array.from({ length: 4 }, (_, index) => <div className="decision-skeleton" key={index} />)
            ) : null}
            {decisions.map((decision) => (
              <DecisionCard
                decision={decision}
                disabled={submittingId !== null}
                key={decision.id}
                onChoose={handleChoose}
              />
            ))}
            {error ? <p className="inline-error">{error}</p> : null}
          </div>
          <aside className="decision-sprout">
            <Sprout emotion={submittingId ? "thinking" : "idle"} size="medium" />
            <p>{submittingId ? "Committing to the bit..." : "Choose wisely. Or choose funny."}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
