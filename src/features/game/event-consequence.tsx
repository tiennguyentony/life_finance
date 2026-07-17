import { Sprout } from "@/components/sprout";
import type { EventConsequence } from "@/types/game";

import { formatChangeValue } from "./game-format";

export function EventConsequenceView({
  consequence,
  onContinue,
}: {
  readonly consequence: EventConsequence;
  readonly onContinue: () => void;
}) {
  return (
    <section className="consequence" aria-labelledby="consequence-title">
      <div className="consequence-copy">
        <span>The result</span>
        <h1 id="consequence-title">{consequence.title}</h1>
        <p>{consequence.summary}</p>
        <div className="consequence-changes">
          {consequence.changes.map((change) => (
            <article className={`consequence-change consequence-change-${change.meaning}`} key={change.id}>
              <span>{change.label}</span>
              <div>
                <s>{formatChangeValue(change.id, change.before)}</s>
                <strong>{formatChangeValue(change.id, change.after)}</strong>
              </div>
            </article>
          ))}
        </div>
        <blockquote>{consequence.explanation}</blockquote>
        <div className="consequence-persistent">
          <span>Long-term effect</span>
          <strong>{consequence.persistentEffect}</strong>
        </div>
        <button autoFocus className="button button-primary button-large" onClick={onContinue} type="button">
          Return to the city
        </button>
      </div>
      <aside className="consequence-sprout">
        <Sprout emotion={consequence.state.sprout.emotion} priority size="large" />
        <p>{consequence.state.sprout.line}</p>
      </aside>
    </section>
  );
}
