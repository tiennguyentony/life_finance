import type { GameOutcome } from "../../core/game-state";
import type { AiDebriefApiResponse } from "../../server/ai/debrief-contracts";

import { formatMoney } from "./play-model";

function formatProgress(ppm: number): string {
  return `${(ppm / 10_000).toFixed(1)}%`;
}

export function DebriefPanel({
  busy,
  consented,
  outcome,
  result,
  onConsentChange,
  onCreate,
}: Readonly<{
  busy: boolean;
  consented: boolean;
  outcome: GameOutcome;
  result: AiDebriefApiResponse | null;
  onConsentChange: (accepted: boolean) => void;
  onCreate: () => void;
}>) {
  const richOutcome =
    "outcomePolicyVersion" in outcome ? outcome : null;

  return (
    <section className="play-panel play-form">
      <p className="hero-kicker">Evidence-based final debrief</p>
      <h2>Understand the grade, then replay one variable</h2>
      <section aria-label="Deterministic final result" className="concept-card">
        <p className="hero-kicker">Deterministic final result</p>
        <h3>Grade {outcome.grade}</h3>
        <p>
          {outcome.kind.replaceAll("_", " ")} · {outcome.reasonCode.replaceAll("_", " ")}
        </p>
        {richOutcome ? (
          <>
            <div className="cashflow-grid">
              <div>
                <span>FI assets</span>
                <strong>{formatMoney(richOutcome.financialIndependence.investableAssetsCents)}</strong>
              </div>
              <div>
                <span>FI target</span>
                <strong>{formatMoney(richOutcome.financialIndependence.targetCents)}</strong>
              </div>
              <div>
                <span>FI progress</span>
                <strong>{formatProgress(richOutcome.financialIndependence.progressPpm)}</strong>
              </div>
              <div>
                <span>Displayed net worth</span>
                <strong>{formatMoney(richOutcome.displayedNetWorthCents)}</strong>
              </div>
              <div>
                <span>Automatic liquidity</span>
                <strong>{formatMoney(richOutcome.automaticLiquidSolvency.automaticLiquidityCents)}</strong>
              </div>
              <div>
                <span>Required cash</span>
                <strong>{formatMoney(richOutcome.automaticLiquidSolvency.requiredCashCents)}</strong>
              </div>
              <div>
                <span>Remaining shortfall</span>
                <strong>{formatMoney(richOutcome.automaticLiquidSolvency.residualShortfallCents)}</strong>
              </div>
              <div>
                <span>Retirement readiness</span>
                <strong>
                  Age {richOutcome.retirementReadiness.currentAgeYears} of {richOutcome.retirementReadiness.retirementAgeYears} · grade {richOutcome.retirementReadiness.gradeIfRetiredNow}
                </strong>
              </div>
            </div>
            <p className="play-note">
              {richOutcome.financialIndependence.goalSource === "player_selected"
                ? "Player-selected target"
                : "Current lifestyle default"}
              {" · policy "}{richOutcome.outcomePolicyVersion}{" · "}
              {richOutcome.reasonCodes.map((reason) => reason.replaceAll("_", " ")).join(" · ")}
            </p>
          </>
        ) : (
          <p className="play-note">
            Historical outcome retained under its original grading semantics.
          </p>
        )}
      </section>
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
