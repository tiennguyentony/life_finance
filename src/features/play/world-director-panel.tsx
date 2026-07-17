import type { GameStateV2 } from "../../core/game-state-v2";

export function WorldDirectorPanel({
  state,
  busy,
  consented,
  onConsentChange,
  onCreateEvent,
}: Readonly<{
  state: GameStateV2;
  busy: boolean;
  consented: boolean;
  onConsentChange: (accepted: boolean) => void;
  onCreateEvent: () => void;
}>) {
  if (state.outcome || state.gameplay.eventLifecycle.pending) return null;
  return (
    <section className="play-panel play-form">
      <div className="section-heading">
        <div>
          <p className="hero-kicker">Optional Hostile Fed AI preview</p>
          <h2>Ask the Hostile Fed to rank eligible scenarios</h2>
        </div>
      </div>
      <p className="play-note">
        Normal surprise events already appear automatically when you advance a month.
        This optional preview gives the Hostile Fed personality influence over the order
        of eligible, engine-owned templates using minimized risk bands. It never queues or
        approves an event, supplies amounts or effects, or mutates your balance sheet.
        Runtime Balance remains the sole approval authority during normal monthly play.
      </p>
      <label>
        <input checked={consented} onChange={(event) => onConsentChange(event.target.checked)} type="checkbox" />
        I agree to send minimized ranking metadata and redacted risk bands.
      </label>
      <button disabled={busy || !consented} onClick={onCreateEvent} type="button">
        Preview Hostile Fed ranking
      </button>
    </section>
  );
}
