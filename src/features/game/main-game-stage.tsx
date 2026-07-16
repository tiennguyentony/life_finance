"use client";

import { useState } from "react";

import { Sprout } from "@/components/sprout";
import type { BigCityScenarioState } from "@/types/game";

import { FinancialDrawer } from "./financial-drawer";
import { formatMoney, formatSignedMoney } from "./game-format";
import { NetWorthTrend } from "./net-worth-trend";

type DrawerView = "position" | "cash-flow" | null;

export function MainGameStage({
  scenario,
  isFastForwarding,
  error,
  onFastForward,
  onReplay,
  onDismissError,
}: {
  readonly scenario: BigCityScenarioState;
  readonly isFastForwarding: boolean;
  readonly error: string | null;
  readonly onFastForward: () => void;
  readonly onReplay: () => void;
  readonly onDismissError: () => void;
}) {
  const [drawer, setDrawer] = useState<DrawerView>(null);
  const { financial } = scenario;
  const progress = (scenario.currentMonth / scenario.totalMonths) * 100;

  return (
    <>
      <div className={`sim-stage${isFastForwarding ? " sim-stage-processing" : ""}`}>
        <header className="sim-stage-header">
          <div>
            <span className="sim-kicker">Attempt {scenario.attemptNumber} of {scenario.maximumAttempts}</span>
            <h1>{scenario.scenarioTitle}</h1>
            <p>{scenario.player.career} in {scenario.player.location}</p>
          </div>
          <div className="sim-month-marker">
            <span>{scenario.calendarLabel}</span>
            <strong>Month {scenario.currentMonth}</strong>
            <small>of {scenario.totalMonths}</small>
          </div>
        </header>

        <div className="sim-progress" aria-label={`Scenario progress: month ${scenario.currentMonth} of ${scenario.totalMonths}`}>
          <span style={{ width: `${progress}%` }} />
        </div>

        <main className="sim-playfield">
          <section className="sim-condition" aria-labelledby="condition-title">
            <div className="sim-condition-lead">
              <span>Your position</span>
              <h2 id="condition-title">
                {financial.vulnerability.tone === "danger" ? "City pressure is rising." : "Safe for now. Not comfortable."}
              </h2>
              <p>{financial.vulnerability.reasons.join(". ")}.</p>
            </div>

            <div className="sim-essential-stats">
              <article className="sim-cash-stat">
                <span>Available cash</span>
                <strong>{formatMoney(financial.cash)}</strong>
                <small>Ready for surprises</small>
              </article>
              <article>
                <span>Monthly surplus</span>
                <strong>{formatSignedMoney(financial.monthlySurplus)}</strong>
                <small>After automatic allocations</small>
              </article>
              <article>
                <span>Cash runway</span>
                <strong>{financial.cashRunwayMonths.toFixed(1)} months</strong>
                <small>Below the 6 month safety target</small>
              </article>
            </div>

            <div className="sim-context-actions" aria-label="Financial details">
              <button onClick={() => setDrawer("position")} type="button">
                View financial position
                <span>Assets, debt, banking, investments</span>
              </button>
              <button onClick={() => setDrawer("cash-flow")} type="button">
                Inspect monthly plan
                <span>Income, bills, and allocations</span>
              </button>
            </div>
          </section>

          <aside className="sim-sprout-panel">
            <div className={`sim-vulnerability sim-vulnerability-${financial.vulnerability.tone}`}>
              <span>Vulnerability</span>
              <strong>{financial.vulnerability.score}</strong>
              <small>{financial.vulnerability.label}</small>
            </div>
            <Sprout emotion={isFastForwarding ? "thinking" : scenario.sprout.emotion} priority size="large" />
            <blockquote>{isFastForwarding ? "Processing rent. Emotionally, I object." : scenario.sprout.line}</blockquote>
          </aside>
        </main>

        <section className="sim-lower-deck">
          <NetWorthTrend points={scenario.netWorthHistory} />
          <article className={`sim-update sim-update-${scenario.recentUpdate?.tone ?? "news"}`}>
            <span>{scenario.recentUpdate?.eyebrow ?? "No new reports"}</span>
            <h2>{scenario.recentUpdate?.title ?? "The city is quiet"}</h2>
            <p>{scenario.recentUpdate?.summary ?? "Advance time when you are ready."}</p>
          </article>
          <div className="sim-next-move">
            <span>{scenario.sliceComplete ? "Vertical slice complete" : "Your next move"}</span>
            {scenario.sliceComplete ? (
              <button disabled={isFastForwarding} onClick={onReplay} type="button">
                Replay Month 1
                <small>Try another decision</small>
              </button>
            ) : (
              <button disabled={isFastForwarding} onClick={onFastForward} type="button">
                {isFastForwarding ? "Advancing..." : "Fast-forward one month"}
                <small>{isFastForwarding ? "Running the automatic plan" : "Process August 2026"}</small>
              </button>
            )}
          </div>
        </section>

        {error ? (
          <div className="sim-inline-error" role="alert">
            <span>{error}</span>
            <button onClick={onDismissError} type="button">Dismiss</button>
          </div>
        ) : null}
      </div>
      {drawer ? <FinancialDrawer financial={financial} onClose={() => setDrawer(null)} view={drawer} /> : null}
    </>
  );
}
