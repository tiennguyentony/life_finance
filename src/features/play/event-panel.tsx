import type { GameStateV2 } from "@/core/game-state-v2";
import { getEventTemplate } from "@/data/event-templates";

import { formatMoney } from "./play-model";
import { titleFromId } from "./play-support";

type PendingEvent = NonNullable<
  GameStateV2["gameplay"]["eventLifecycle"]["pending"]
>;

export function EventPanel({
  pending,
  busy,
  onChoice,
}: Readonly<{
  pending: PendingEvent;
  busy: boolean;
  onChoice: (choiceId: string) => void;
}>) {
  let template: ReturnType<typeof getEventTemplate> | null = null;
  try {
    template = getEventTemplate(pending.templateId, pending.templateVersion);
  } catch {
    // Persisted events remain playable even if optional teaching copy is unavailable.
  }

  return (
    <section aria-live="polite" className="play-panel play-event">
      <div className="chip-row">
        <span className="chip chip-danger">Life happens</span>
        <span className="chip">{titleFromId(pending.tier)} event</span>
        <span className="chip">
          targets {pending.targetedWeakness.replaceAll("_", " ")}
        </span>
      </div>
      <h2>{titleFromId(pending.templateId)}</h2>
      <p>
        {template?.teachingPrinciple ??
          `This event targets ${pending.targetedWeakness.replaceAll("_", " ")}.`}
      </p>
      <div className="event-parameters">
        {Object.entries(pending.parameters).map(([key, value]) => (
          <div key={key}>
            <span>{key.replaceAll("_", " ").replace(/ cents$/, "")}</span>
            <strong>{key.endsWith("cents") ? formatMoney(value) : value}</strong>
          </div>
        ))}
      </div>
      <div className="event-choices">
        {pending.choiceIds.map((choiceId) => {
          const choice = template?.choices.find(({ id }) => id === choiceId);
          return (
            <button
              className="choice-card"
              disabled={busy}
              key={choiceId}
              onClick={() => onChoice(choiceId)}
              type="button"
            >
              <strong>{choiceId.replaceAll("_", " ")}</strong>
              <span>{choice?.principle ?? "Apply this engine-owned choice."}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
