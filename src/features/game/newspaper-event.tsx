"use client";

import type { ScenarioEvent, ScenarioEventDecisionId } from "@/types/game";

export function NewspaperEvent({
  event,
  selectedDecisionId,
  isResolving,
  error,
  onChoose,
}: {
  readonly event: ScenarioEvent;
  readonly selectedDecisionId: ScenarioEventDecisionId | null;
  readonly isResolving: boolean;
  readonly error: string | null;
  readonly onChoose: (decisionId: ScenarioEventDecisionId) => void;
}) {
  return (
    <article className="newspaper" aria-labelledby="event-headline">
      <header className="newspaper-masthead">
        <div><span>Breaking</span><small>Month 2</small></div>
        <strong>{event.newspaperName}</strong>
        <div className="newspaper-byline"><span>Dispatch</span><small>GM Pengo</small></div>
      </header>
      <div className="newspaper-rule" />
      <section className="newspaper-story">
        <p>{event.title}</p>
        <h1 id="event-headline">{event.headline}</h1>
        <div className="newspaper-story-copy">
          <strong>${event.amount}</strong>
          <p>{event.description}</p>
        </div>
        <aside><span>Pressure point</span>{event.weaknessTested}</aside>
      </section>
      <section className="newspaper-decisions" aria-label="Choose your response">
        <header>
          <span>Your call</span>
          <h2>How do you respond?</h2>
        </header>
        <div className="newspaper-decision-list">
          {event.decisions.map((decision, index) => {
            const selected = selectedDecisionId === decision.id;
            return (
              <button
                aria-pressed={selected}
                className={`newspaper-choice newspaper-choice-${decision.tone}${selected ? " newspaper-choice-selected" : ""}`}
                disabled={isResolving}
                key={decision.id}
                onClick={() => onChoose(decision.id)}
                type="button"
              >
                <span>0{index + 1}</span>
                <strong>{decision.title}</strong>
                <p>{decision.description}</p>
                <div><b>{decision.immediateTradeoff}</b><small>{decision.futureEffect}</small></div>
              </button>
            );
          })}
        </div>
        {isResolving ? <p className="newspaper-resolving" role="status">GM Pengo is calculating the damage...</p> : null}
        {error ? <p className="newspaper-error" role="alert">{error} Choose again.</p> : null}
      </section>
    </article>
  );
}
