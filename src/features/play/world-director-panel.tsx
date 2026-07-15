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
  const ready = state.gameplay.exposure.current !== null;
  return (
    <section className="play-panel play-form">
      <div className="section-heading">
        <div>
          <p className="hero-kicker">AI World Director</p>
          <h2>Stress-test what your decisions exposed</h2>
        </div>
      </div>
      <p className="play-note">
        The model may choose only from currently eligible engine templates,
        demonstrated weaknesses, and fixed parameter bounds. It cannot invent
        money effects or mutate your balance sheet.
      </p>
      <label>
        <input checked={consented} onChange={(event) => onConsentChange(event.target.checked)} type="checkbox" />
        I agree to send the minimized, redacted exposure context for this event.
      </label>
      <button disabled={busy || !consented || !ready} onClick={onCreateEvent} type="button">
        {ready ? "Generate a fair personalized stress test" : "Process one month to measure exposure"}
      </button>
    </section>
  );
}
