import type { GameStateV2 } from "@/core/game-state-v2";
import { getEventTemplate } from "@/data/event-templates";
import { getPersonalEventExperience } from "@/data/event-experience";

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
  const experience = getPersonalEventExperience(pending.templateId);

  return (
    <section className="play-panel play-event">
      <p className="hero-kicker">Surprise life event · {pending.tier}</p>
      <h2>{pending.aiNarrative?.headline ?? experience?.title ?? titleFromId(pending.templateId)}</h2>
      {pending.aiNarrative ? (
        <>
          <p>{pending.aiNarrative.narrative}</p>
          <p className="play-note">Why this event: {pending.aiNarrative.rationale}</p>
        </>
      ) : experience ? <p>{experience.situation}</p> : null}
      <p>
        {template?.teachingPrinciple ??
          `This event targets ${pending.targetedWeakness.replaceAll("_", " ")}.`}
      </p>
      <div className="event-parameters">
        {Object.entries(pending.parameters).map(([key, value]) => (
          <div key={key}>
            <span>{experience?.parameterLabels[key] ?? key.replaceAll("_", " ")}</span>
            <strong>{key.endsWith("cents") ? formatMoney(value) : value}</strong>
          </div>
        ))}
      </div>
      <div className="event-choices">
        {pending.choiceIds.map((choiceId) => {
          const choice = template?.choices.find(({ id }) => id === choiceId);
          return (
            <button
              disabled={busy}
              key={choiceId}
              onClick={() => onChoice(choiceId)}
              type="button"
            >
              <strong>{experience?.choiceLabels[choiceId] ?? choiceId.replaceAll("_", " ")}</strong>
              <span>{choice?.principle ?? "Apply this engine-owned choice."}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
