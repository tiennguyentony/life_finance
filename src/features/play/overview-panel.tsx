import Image from "next/image";

import type { GameStateV2 } from "@/core/game-state-v2";
import { getEventTemplate } from "@/data/event-templates";

import { MASCOT } from "./persona-art";
import {
  calculateFinancialIndependence,
  formatMoney,
} from "./play-model";
import {
  AnimatedMoney,
  ConceptButton,
  formatMonthLabel,
  formatOutflow,
  formatRate,
  formatRunway,
  signedMoney,
  titleFromId,
} from "./play-support";
import type { MonthlyRecap } from "./play-types";

function CashCell({
  label,
  value,
  tone,
}: Readonly<{
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}>) {
  const toneClass =
    tone === "positive"
      ? " money-positive"
      : tone === "negative"
        ? " money-negative"
        : "";
  return (
    <div>
      <span>{label}</span>
      <strong className={`tnum${toneClass}`}>{value}</strong>
    </div>
  );
}

export function OverviewPanel({
  state,
  latestTurn,
  onSelectConcept,
}: Readonly<{
  state: GameStateV2;
  latestTurn: MonthlyRecap | null;
  onSelectConcept: (conceptId: string) => void;
}>) {
  const fi = calculateFinancialIndependence(state);
  const exposure = state.gameplay.exposure.current;
  const snapshot = state.gameplay.catalogSnapshot?.selected;
  const latestEvent = state.gameplay.eventLifecycle.history.at(-1) ?? null;
  const fiPercent = fi.progressPpm / 10_000;
  const marketDelta = latestTurn
    ? signedMoney(latestTurn.marketValueChangeCents)
    : null;

  return (
    <>
      <section className="play-panel fi-panel">
        <div className="section-heading">
          <div>
            <h2>Financial independence</h2>
            <p className="panel-sub">
              The finish line: 25 years of living costs, invested.
            </p>
          </div>
          <ConceptButton
            conceptId="financial_independence"
            onSelect={onSelectConcept}
          />
        </div>
        <div className="fi-numbers">
          <strong>
            <AnimatedMoney cents={fi.investableAssetsCents} />
          </strong>
          <span>of {formatMoney(fi.targetCents)} target</span>
        </div>
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(fiPercent)}
          aria-valuetext={`${formatRate(fi.progressPpm)} of the financial independence target`}
          className="progress-track"
          role="progressbar"
        >
          <span aria-hidden="true" className="progress-tick" style={{ left: "25%" }} />
          <span aria-hidden="true" className="progress-tick" style={{ left: "50%" }} />
          <span aria-hidden="true" className="progress-tick" style={{ left: "75%" }} />
          <span className="progress-fill" style={{ width: `${fiPercent}%` }} />
        </div>
        <p className="play-note">
          {formatRate(fi.progressPpm)} complete. Target = 25 x{" "}
          {formatMoney(state.finances.annualLivingCostCents)} annual living
          cost; home equity excluded.
        </p>
      </section>

      <div className="play-stats" aria-label="Current financial state">
        <div>
          <span>Cash</span>
          <strong>
            <AnimatedMoney cents={state.finances.cashCents} />
          </strong>
        </div>
        <div>
          <span>Taxable investments</span>
          <strong>
            <AnimatedMoney cents={state.finances.taxableInvestmentsCents} />
          </strong>
        </div>
        <div>
          <span>Retirement</span>
          <strong>
            <AnimatedMoney cents={state.finances.retirementCents} />
          </strong>
        </div>
        <div>
          <span>Home value</span>
          <strong>
            <AnimatedMoney cents={state.finances.homeValueCents} />
          </strong>
        </div>
        <div>
          <span>Total liabilities</span>
          <strong>
            <AnimatedMoney
              cents={
                state.finances.nonCreditLiabilitiesCents +
                state.finances.creditUsedCents
              }
            />
          </strong>
        </div>
        <div>
          <span>Required each month</span>
          <strong>
            <AnimatedMoney cents={state.finances.requiredObligationsCents} />
          </strong>
        </div>
      </div>

      {latestTurn ? (
        <section className="play-panel">
          <div className="section-heading">
            <div>
              <div className="chip-row">
                <span className="chip chip-accent">Turn receipt</span>
                <span className="chip">
                  {formatMonthLabel(latestTurn.processedMonth)}
                </span>
              </div>
              <h2>Where the paycheck went</h2>
            </div>
            <ConceptButton conceptId="tax_estimate" onSelect={onSelectConcept} />
          </div>
          <div className="cashflow-grid">
            <CashCell
              label="Gross salary"
              value={formatMoney(latestTurn.grossIncomeCents)}
            />
            <CashCell
              label="401(k)"
              tone="negative"
              value={formatOutflow(
                latestTurn.recurringAllocations?.preTax.employee401kCents ?? 0,
              )}
            />
            <CashCell
              label="HSA"
              tone="negative"
              value={formatOutflow(
                latestTurn.recurringAllocations?.preTax.hsaCents ?? 0,
              )}
            />
            <CashCell
              label="Modeled tax"
              tone="negative"
              value={formatOutflow(latestTurn.totalTaxCents)}
            />
            <CashCell
              label="Take-home payroll"
              value={formatMoney(latestTurn.afterTaxCashIncomeCents)}
            />
            <CashCell
              label="Required obligations"
              tone="negative"
              value={formatOutflow(latestTurn.requiredCashCents)}
            />
            <CashCell
              label="Employer match"
              tone="positive"
              value={
                signedMoney(
                  latestTurn.recurringAllocations?.preTax
                    .employer401kMatchCents ?? 0,
                ).label
              }
            />
            <CashCell
              label="Debt interest"
              tone="negative"
              value={formatOutflow(latestTurn.debtService.totalInterestCents)}
            />
            <CashCell
              label="Market movement"
              tone={marketDelta?.tone}
              value={marketDelta?.label ?? formatMoney(0)}
            />
            <CashCell
              label="Broad-equity return"
              value={formatRate(latestTurn.market.equityReturnPpm)}
            />
            <CashCell
              label="Inflation this month"
              value={formatRate(latestTurn.market.inflationPpm)}
            />
            <CashCell
              label="Index allocation"
              value={formatMoney(
                latestTurn.recurringAllocations?.afterTax.broadIndexCents ?? 0,
              )}
            />
            <CashCell
              label="Sector allocation"
              value={formatMoney(
                latestTurn.recurringAllocations?.afterTax.sectorCents ?? 0,
              )}
            />
            <CashCell
              label="Speculative allocation"
              value={formatMoney(
                latestTurn.recurringAllocations?.afterTax.speculativeCents ?? 0,
              )}
            />
            <CashCell
              label="IRA allocation"
              value={formatMoney(
                latestTurn.recurringAllocations?.afterTax.iraCents ?? 0,
              )}
            />
            <CashCell
              label="Forced asset sale"
              value={formatMoney(latestTurn.funding?.grossLiquidationCents ?? 0)}
            />
            <CashCell
              label="Emergency credit draw"
              value={formatMoney(latestTurn.funding?.creditDrawnCents ?? 0)}
            />
          </div>
          <p className="play-note">
            Educational estimate, pinned 2026 tax policy. Trace{" "}
            {latestTurn.taxTraceId}
          </p>
        </section>
      ) : (
        <section className="play-panel empty-state">
          <Image
            alt=""
            className="empty-mascot"
            height={MASCOT.height}
            sizes="84px"
            src={MASCOT.src}
            width={MASCOT.width}
          />
          <h2>Run a month to reveal tax and cash flow</h2>
          <p className="play-note">
            Gross salary will be split into pre-tax saving, modeled
            federal/state tax, take-home income, required costs, debt, and your
            chosen investments. Sprout keeps every receipt.
          </p>
        </section>
      )}

      <div className="play-grid">
        <section className="play-panel">
          <div className="section-heading">
            <h2>Exposure</h2>
            <ConceptButton conceptId="exposure" onSelect={onSelectConcept} />
          </div>
          {exposure ? (
            <dl className="metric-list">
              <div>
                <dt>Emergency runway</dt>
                <dd>{formatRunway(exposure.emergencyFundMonthsPpm)}</dd>
              </div>
              <div>
                <dt>Debt to income</dt>
                <dd>{formatRate(exposure.debtToIncomePpm)}</dd>
              </div>
              <div>
                <dt>Credit utilization</dt>
                <dd>{formatRate(exposure.revolvingDebtPpm)}</dd>
              </div>
              <div>
                <dt>Insurance gap</dt>
                <dd>{formatRate(exposure.insuranceGapPpm)}</dd>
              </div>
              <div>
                <dt>Portfolio concentration</dt>
                <dd>{formatRate(exposure.portfolioConcentrationPpm)}</dd>
              </div>
              <div>
                <dt>Job/investment correlation</dt>
                <dd>{formatRate(exposure.jobInvestmentCorrelationPpm)}</dd>
              </div>
            </dl>
          ) : (
            <p className="play-note">
              Exposure is measured after the first processed month.
            </p>
          )}
        </section>

        <section className="play-panel">
          <h2>Benefits & protection</h2>
          {snapshot ? (
            <dl className="metric-list">
              <div>
                <dt>Health plan</dt>
                <dd>{snapshot.healthPlan.label}</dd>
              </div>
              <div>
                <dt>Monthly premium</dt>
                <dd>
                  {formatMoney(
                    snapshot.household.healthCoverageTier === "self"
                      ? snapshot.healthPlan.monthlyEmployeePremiumSelfCents
                      : snapshot.healthPlan.monthlyEmployeePremiumFamilyCents,
                  )}
                </dd>
              </div>
              <div>
                <dt>Annual deductible</dt>
                <dd>
                  {formatMoney(
                    snapshot.household.healthCoverageTier === "self"
                      ? snapshot.healthPlan.annualDeductibleSelfCents
                      : snapshot.healthPlan.annualDeductibleFamilyCents,
                  )}
                </dd>
              </div>
              <div>
                <dt>Out-of-pocket max</dt>
                <dd>
                  {formatMoney(
                    snapshot.household.healthCoverageTier === "self"
                      ? snapshot.healthPlan.annualOutOfPocketMaximumSelfCents
                      : snapshot.healthPlan.annualOutOfPocketMaximumFamilyCents,
                  )}
                </dd>
              </div>
              <div>
                <dt>Retirement plan</dt>
                <dd>{snapshot.retirementPlan.label}</dd>
              </div>
              <div>
                <dt>Other coverage</dt>
                <dd>
                  {snapshot.insuranceCoverages
                    .map(({ label }) => label)
                    .join(", ") || "None"}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>
      </div>

      <section className="play-panel">
        <h2>Macro feed</h2>
        {state.gameplay.eventLifecycle.macroStories.length ? (
          state.gameplay.eventLifecycle.macroStories.map((story) => {
            const template = getEventTemplate(
              story.templateId,
              story.templateVersion,
            );
            return (
              <article className="macro-item" key={story.storyId}>
                <strong>{titleFromId(story.templateId)}</strong>
                <span>{template.teachingPrinciple}</span>
                <small>
                  {formatMonthLabel(story.startedMonth)} to{" "}
                  {formatMonthLabel(story.expiresMonth)}
                </small>
              </article>
            );
          })
        ) : (
          <p className="play-note">
            No active macro story. The market still moves each month under the
            current {state.marketRegime} regime.
          </p>
        )}
      </section>

      {latestEvent ? (
        <section className="play-panel resolved-event">
          <div>
            <div className="chip-row">
              <span className="chip chip-accent">Decision consequence</span>
              <span className="chip">
                {formatMonthLabel(latestEvent.resolvedMonth)}
              </span>
            </div>
            <h2>{titleFromId(latestEvent.templateId)}</h2>
          </div>
          <p>
            {
              getEventTemplate(
                latestEvent.templateId,
                latestEvent.templateVersion,
              ).teachingPrinciple
            }
          </p>
          <div className="cashflow-grid">
            <CashCell
              label="Your choice"
              value={latestEvent.choiceId.replaceAll("_", " ")}
            />
            <CashCell
              label="Your cost"
              tone={latestEvent.playerCostCents > 0 ? "negative" : "neutral"}
              value={formatOutflow(latestEvent.playerCostCents)}
            />
            <CashCell
              label="Insurer paid"
              tone={latestEvent.insurerCostCents > 0 ? "positive" : "neutral"}
              value={formatMoney(latestEvent.insurerCostCents)}
            />
          </div>
          <p className="play-note">
            Alternatives available at the time:{" "}
            {latestEvent.availableChoiceIds
              .map((id) => id.replaceAll("_", " "))
              .join(", ")}
          </p>
        </section>
      ) : null}
    </>
  );
}
