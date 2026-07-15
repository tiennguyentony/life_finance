import type { GameStateV2 } from "../../core/game-state-v2";
import { dueLifeMilestones, lifeMilestoneState } from "../../core/life-milestones-v2";

import { formatMoney } from "./play-model";
import type { MilestoneDraft } from "./play-types";

type Resolution = "pay_cash" | "postpone_6_months" | "cancel";

export function MilestonePanel({
  state,
  draft,
  busy,
  onChange,
  onSchedule,
  onResolve,
}: Readonly<{
  state: GameStateV2;
  draft: MilestoneDraft;
  busy: boolean;
  onChange: (patch: Partial<MilestoneDraft>) => void;
  onSchedule: () => void;
  onResolve: (milestoneId: string, resolution: Resolution) => void;
}>) {
  const milestones = lifeMilestoneState(state);
  const dueIds = new Set(dueLifeMilestones(state).map(({ milestoneId }) => milestoneId));
  const commandBlocked = busy || Boolean(state.outcome || state.gameplay.eventLifecycle.pending);
  return (
    <section className="play-panel play-form">
      <div>
        <p className="hero-kicker">Planned life spending</p>
        <h2>Put real life on the calendar</h2>
      </div>
      <p className="play-note">
        A goal becomes a decision when its month arrives. Paying reduces cash through the ledger; postponing preserves liquidity but moves the life plan.
      </p>
      <div className="play-inline-fields">
        <label>
          Milestone
          <select value={draft.kind} onChange={(event) => onChange({ kind: event.target.value as MilestoneDraft["kind"] })}>
            <option value="move">Move home</option>
            <option value="vehicle">Buy or replace vehicle</option>
            <option value="wedding">Wedding</option>
            <option value="child">Welcome a child</option>
            <option value="education">Education</option>
            <option value="travel">Major travel</option>
            <option value="caregiving">Family caregiving</option>
            <option value="custom">Other life goal</option>
          </select>
        </label>
        <label>
          Target month
          <input min={state.currentMonth} type="month" value={draft.targetMonth} onChange={(event) => onChange({ targetMonth: event.target.value })} />
        </label>
      </div>
      <label>
        Name
        <input maxLength={80} value={draft.label} onChange={(event) => onChange({ label: event.target.value })} />
      </label>
      <label>
        Estimated cost (USD)
        <input min="1" step="100" type="number" value={draft.estimatedCost} onChange={(event) => onChange({ estimatedCost: event.target.valueAsNumber })} />
      </label>
      <button disabled={commandBlocked || !draft.label.trim() || draft.targetMonth < state.currentMonth} onClick={onSchedule} type="button">Schedule milestone</button>
      {milestones.scheduled.length > 0 ? (
        <div className="milestone-list">
          {milestones.scheduled.map((milestone) => {
            const due = dueIds.has(milestone.milestoneId);
            return (
              <article className={due ? "macro-item milestone-due" : "macro-item"} key={milestone.milestoneId}>
                <strong>{milestone.label}</strong>
                <span>{milestone.targetMonth} · {formatMoney(milestone.estimatedCostCents)}{milestone.postponementCount ? ` · postponed ${milestone.postponementCount}×` : ""}</span>
                {due ? (
                  <div className="event-actions">
                    <button disabled={commandBlocked || milestone.estimatedCostCents > state.finances.cashCents} onClick={() => onResolve(milestone.milestoneId, "pay_cash")} type="button">Pay from cash</button>
                    <button disabled={commandBlocked} onClick={() => onResolve(milestone.milestoneId, "postpone_6_months")} type="button">Postpone 6 months</button>
                    <button disabled={commandBlocked} onClick={() => onResolve(milestone.milestoneId, "cancel")} type="button">Cancel goal</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <p className="play-note">No planned milestones yet.</p>}
    </section>
  );
}
