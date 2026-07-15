import type { AiDebriefApiResponse } from "../../server/ai/debrief-contracts";

export function DebriefPanel({
  busy,
  consented,
  result,
  onConsentChange,
  onCreate,
}: Readonly<{
  busy: boolean;
  consented: boolean;
  result: AiDebriefApiResponse | null;
  onConsentChange: (accepted: boolean) => void;
  onCreate: () => void;
}>) {
  return (
    <section className="play-panel play-form">
      <p className="hero-kicker">Evidence-based final debrief</p>
      <h2>Understand the grade, then replay one variable</h2>
      {!result ? (
        <>
          <label>
            <input checked={consented} onChange={(event) => onConsentChange(event.target.checked)} type="checkbox" />
            I agree to send minimized final evidence and recorded decisions for this debrief.
          </label>
          <button disabled={busy || !consented} onClick={onCreate} type="button">Generate final learning debrief</button>
        </>
      ) : (
        <div className="concept-card">
          <p className="hero-kicker">{result.source.replaceAll("_", " ")}</p>
          <h3>{result.debrief.title}</h3>
          <p>{result.debrief.summary}</p>
          {result.debrief.decisiveMoments.map((moment) => (
            <article key={moment.decisionId}>
              <strong>{moment.decisionId.replaceAll("_", " ")}</strong>
              <p>{moment.lesson}</p>
            </article>
          ))}
          <h3>Try next</h3>
          <ul>{result.debrief.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
