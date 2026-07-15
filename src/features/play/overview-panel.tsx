import type { GameStateV2 } from "@/core/game-state-v2";
import { getEventTemplate } from "@/data/event-templates";

import {
  calculateFinancialIndependence,
  formatMoney,
} from "./play-model";
import {
  ConceptButton,
  formatOutflow,
  formatRate,
  formatRunway,
  titleFromId,
} from "./play-support";
import type { MonthlyRecap } from "./play-types";

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

  return (
    <>
      <section className="play-panel fi-panel">
        <div className="section-heading">
          <div>
            <p className="hero-kicker">The finish line</p>
            <h2>Financial independence</h2>
          </div>
          <ConceptButton
            conceptId="financial_independence"
            onSelect={onSelectConcept}
          />
        </div>
        <div className="fi-numbers">
          <strong>{formatMoney(fi.investableAssetsCents)}</strong>
          <span>of {formatMoney(fi.targetCents)} target</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${fi.progressPpm / 10_000}%` }} />
        </div>
        <p className="play-note">
          {formatRate(fi.progressPpm)} complete ·{" "}
          {state.gameplay.financialGoal ? (
            <>
              target supports{" "}
              {formatMoney(
                state.gameplay.financialGoal.desiredAnnualSpendingCents,
              )}
              /year at{" "}
              {formatRate(
                state.gameplay.financialGoal.safeWithdrawalRatePpm,
              )}
              , by age {state.gameplay.financialGoal.targetAgeYears}
            </>
          ) : (
            <>target = 25 × current annual living cost</>
          )}
          {" "}· home equity excluded.
        </p>
      </section>

      <div className="play-stats" aria-label="Current financial state">
        <div><span>Cash</span><strong>{formatMoney(state.finances.cashCents)}</strong></div>
        <div><span>Taxable investments</span><strong>{formatMoney(state.finances.taxableInvestmentsCents)}</strong></div>
        <div><span>Retirement</span><strong>{formatMoney(state.finances.retirementCents)}</strong></div>
        <div><span>Home value</span><strong>{formatMoney(state.finances.homeValueCents)}</strong></div>
        <div><span>Total liabilities</span><strong>{formatMoney(state.finances.nonCreditLiabilitiesCents + state.finances.creditUsedCents)}</strong></div>
        <div><span>Required each month</span><strong>{formatMoney(state.finances.requiredObligationsCents)}</strong></div>
      </div>

      {latestTurn ? (
        <section className="play-panel">
          <div className="section-heading">
            <div>
              <p className="hero-kicker">Exact turn evidence · {latestTurn.processedMonth}</p>
              <h2>Where the paycheck went</h2>
            </div>
            <ConceptButton conceptId="tax_estimate" onSelect={onSelectConcept} />
          </div>
          <div className="cashflow-grid">
            <div><span>Gross salary</span><strong>{formatMoney(latestTurn.grossIncomeCents)}</strong></div>
            <div><span>401(k)</span><strong>−{formatMoney(latestTurn.recurringAllocations?.preTax.employee401kCents ?? 0)}</strong></div>
            <div><span>HSA</span><strong>−{formatMoney(latestTurn.recurringAllocations?.preTax.hsaCents ?? 0)}</strong></div>
            <div><span>Modeled tax</span><strong>{formatOutflow(latestTurn.totalTaxCents)}</strong></div>
            <div><span>Take-home payroll</span><strong>{formatMoney(latestTurn.afterTaxCashIncomeCents)}</strong></div>
            <div><span>Required obligations</span><strong>−{formatMoney(latestTurn.requiredCashCents)}</strong></div>
            <div><span>Employer match</span><strong>+{formatMoney(latestTurn.recurringAllocations?.preTax.employer401kMatchCents ?? 0)}</strong></div>
            <div><span>Debt interest</span><strong>{formatMoney(latestTurn.debtService.totalInterestCents)}</strong></div>
            <div><span>Market movement</span><strong>{formatMoney(latestTurn.marketValueChangeCents)}</strong></div>
            <div><span>Broad-equity return</span><strong>{formatRate(latestTurn.market.equityReturnPpm)}</strong></div>
            <div><span>Inflation this month</span><strong>{formatRate(latestTurn.market.inflationPpm)}</strong></div>
            <div><span>Index allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.broadIndexCents ?? 0)}</strong></div>
            <div><span>Sector allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.sectorCents ?? 0)}</strong></div>
            <div><span>Speculative allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.speculativeCents ?? 0)}</strong></div>
            <div><span>IRA allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.iraCents ?? 0)}</strong></div>
            <div><span>Forced asset sale</span><strong>{formatMoney(latestTurn.funding?.grossLiquidationCents ?? 0)}</strong></div>
            <div><span>Emergency credit draw</span><strong>{formatMoney(latestTurn.funding?.creditDrawnCents ?? 0)}</strong></div>
          </div>
          <p className="play-note">
            Educational estimate · pinned 2026 tax policy · trace {latestTurn.taxTraceId}
          </p>
        </section>
      ) : (
        <section className="play-panel empty-recap">
          <h2>Run a month to reveal tax and cash flow</h2>
          <p>
            Gross salary will be split into pre-tax saving, modeled federal/state
            tax, take-home income, required costs, debt, and your chosen investments.
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
              <div><dt>Emergency runway</dt><dd>{formatRunway(exposure.emergencyFundMonthsPpm)}</dd></div>
              <div><dt>Debt to income</dt><dd>{formatRate(exposure.debtToIncomePpm)}</dd></div>
              <div><dt>Credit utilization</dt><dd>{formatRate(exposure.revolvingDebtPpm)}</dd></div>
              <div><dt>Insurance gap</dt><dd>{formatRate(exposure.insuranceGapPpm)}</dd></div>
              <div><dt>Portfolio concentration</dt><dd>{formatRate(exposure.portfolioConcentrationPpm)}</dd></div>
              <div><dt>Job/investment correlation</dt><dd>{formatRate(exposure.jobInvestmentCorrelationPpm)}</dd></div>
            </dl>
          ) : (
            <p className="play-note">Exposure is measured after the first processed month.</p>
          )}
        </section>

        <section className="play-panel">
          <h2>Benefits & protection</h2>
          {snapshot ? (
            <dl className="metric-list">
              <div><dt>Health plan</dt><dd>{snapshot.healthPlan?.label ?? "Coverage waived"}</dd></div>
              <div><dt>Monthly premium</dt><dd>{formatMoney(snapshot.healthPlan ? (snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.monthlyEmployeePremiumSelfCents : snapshot.healthPlan.monthlyEmployeePremiumFamilyCents) : 0)}</dd></div>
              <div><dt>Annual deductible</dt><dd>{snapshot.healthPlan ? formatMoney(snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.annualDeductibleSelfCents : snapshot.healthPlan.annualDeductibleFamilyCents) : "Not applicable"}</dd></div>
              <div><dt>Out-of-pocket max</dt><dd>{snapshot.healthPlan ? formatMoney(snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.annualOutOfPocketMaximumSelfCents : snapshot.healthPlan.annualOutOfPocketMaximumFamilyCents) : "None — full bill is yours"}</dd></div>
              <div><dt>Retirement plan</dt><dd>{snapshot.retirementPlan.label}</dd></div>
              <div><dt>Other coverage</dt><dd>{snapshot.insuranceCoverages.map(({ label }) => label).join(", ") || "None"}</dd></div>
            </dl>
          ) : null}
        </section>
      </div>

      <section className="play-panel">
        <h2>Macro feed</h2>
        {state.gameplay.eventLifecycle.macroStories.length ? (
          state.gameplay.eventLifecycle.macroStories.map((story) => {
            const template = getEventTemplate(story.templateId, story.templateVersion);
            return (
              <article className="macro-item" key={story.storyId}>
                <strong>{titleFromId(story.templateId)}</strong>
                <span>{template.teachingPrinciple}</span>
                <small>{story.startedMonth} → {story.expiresMonth}</small>
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
            <p className="hero-kicker">Decision consequence · {latestEvent.resolvedMonth}</p>
            <h2>{titleFromId(latestEvent.templateId)}</h2>
          </div>
          <p>{getEventTemplate(latestEvent.templateId, latestEvent.templateVersion).teachingPrinciple}</p>
          <div className="cashflow-grid">
            <div><span>Your choice</span><strong>{latestEvent.choiceId.replaceAll("_", " ")}</strong></div>
            <div><span>Your cost</span><strong>{formatMoney(latestEvent.playerCostCents)}</strong></div>
            <div><span>Insurer paid</span><strong>{formatMoney(latestEvent.insurerCostCents)}</strong></div>
          </div>
          <p className="play-note">
            Alternatives available at the time:{" "}
            {latestEvent.availableChoiceIds.map((id) => id.replaceAll("_", " ")).join(" · ")}
          </p>
        </section>
      ) : null}
    </>
  );
}
