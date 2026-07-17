import type { OnboardingReviewV1 } from "../../core/onboarding-v1-contracts";
import { presentOnboardingReviewV1 } from "../../data/onboarding-localization-v1";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function OnboardingReviewPanelV1({
  review,
  current,
  busy,
  onConfirm,
}: Readonly<{
  review: OnboardingReviewV1;
  current: boolean;
  busy: boolean;
  onConfirm: () => void;
}>) {
  const presentation = presentOnboardingReviewV1(review);
  const normalized = review.normalized;
  return (
    <section className="play-panel" aria-label="Onboarding review">
      <div>
        <p className="hero-kicker">Review before starting</p>
        <h2>{review.status === "ready" ? "Confirm your starting position" : "Review the highlighted inputs"}</h2>
        <p>
          Onboarding {review.version} · defaults {review.defaultsVersion} · location fallback {review.locationDefaultsVersion}
        </p>
      </div>
      {normalized ? (
        <>
          <div className="cashflow-grid">
            <div><span>Source mode</span><strong>{normalized.sourceMode.replaceAll("_", " ")}</strong></div>
            <div><span>Persona</span><strong>{normalized.persona?.id ?? "Custom typed input"}</strong></div>
            <div><span>Start month</span><strong>{normalized.startMonth}</strong></div>
            <div><span>Birth month</span><strong>{normalized.birthMonth}</strong></div>
            <div><span>Annual gross income</span><strong>{money(normalized.annualGrossSalaryCents)}</strong></div>
            <div><span>Annual take-home evidence</span><strong>{normalized.annualTakeHomeEvidenceCents === null ? "Not provided" : money(normalized.annualTakeHomeEvidenceCents)}</strong></div>
            <div><span>Starting cash</span><strong>{money(normalized.finances.cashCents)}</strong></div>
            <div><span>Location</span><strong>{normalized.selection.locationId}</strong></div>
            <div><span>Career</span><strong>{normalized.selection.careerId}</strong></div>
            <div><span>Difficulty</span><strong>{normalized.runtimeDifficulty}</strong></div>
          </div>
          <p><strong>Simulation seed:</strong> {normalized.randomSeed}</p>
          <h3>Catalog selection</h3>
          <div className="cashflow-grid">
            <div><span>Household</span><strong>{normalized.selection.householdId}</strong></div>
            <div><span>Benefits package</span><strong>{normalized.selection.benefitsPackageId}</strong></div>
            <div><span>Health plan</span><strong>{normalized.selection.healthPlanId ?? "Waived"}</strong></div>
            <div><span>Retirement plan / employer match</span><strong>{normalized.selection.retirementPlanId}</strong></div>
            <div><span>Starting scenario</span><strong>{normalized.selection.scenarioId}</strong></div>
            <div><span>Insurance coverage</span><strong>{normalized.selection.insuranceCoverageIds.length === 0 ? "None" : normalized.selection.insuranceCoverageIds.join(", ")}</strong></div>
          </div>
          {review.preview ? (
            <div>
              <h4>Employer match tiers</h4>
              {review.preview.employerMatchTiers.length === 0 ? <p>No employer match.</p> : (
                <ul>
                  {review.preview.employerMatchTiers.map((tier) => (
                    <li key={`${tier.employeeContributionRateUpToPpm}:${tier.employerMatchRatePpm}`}>
                      Up to {(tier.employeeContributionRateUpToPpm / 10_000).toFixed(1)}% employee contribution · {(tier.employerMatchRatePpm / 10_000).toFixed(1)}% employer match rate
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <h3>Normalized expenses</h3>
          {normalized.declaredExpenses === null ? (
            <p>Essential and discretionary expenses use the catalog baseline shown below.</p>
          ) : (
            <div className="cashflow-grid">
              <div><span>Essential annual expenses</span><strong>{money(normalized.declaredExpenses.essentialAnnualCents)}</strong></div>
              <div><span>Discretionary annual expenses</span><strong>{money(normalized.declaredExpenses.discretionaryAnnualCents)}</strong></div>
              <div><span>Total annual expenses</span><strong>{money(normalized.declaredExpenses.totalAnnualCents)}</strong></div>
            </div>
          )}
          <h3>Normalized assets, retirement, and credit</h3>
          <div className="cashflow-grid">
            <div><span>Cash</span><strong>{money(normalized.finances.cashCents)}</strong></div>
            <div><span>Taxable broad index</span><strong>{money(normalized.finances.taxableBroadIndexCents)}</strong></div>
            <div><span>Taxable sector</span><strong>{money(normalized.finances.taxableSectorCents)}</strong></div>
            <div><span>Taxable speculative</span><strong>{money(normalized.finances.taxableSpeculativeCents)}</strong></div>
            <div><span>401(k)</span><strong>{money(normalized.finances.retirement401kCents)}</strong></div>
            <div><span>IRA</span><strong>{money(normalized.finances.retirementIraCents)}</strong></div>
            <div><span>HSA</span><strong>{money(normalized.finances.hsaCents)}</strong></div>
            <div><span>Home value</span><strong>{money(normalized.finances.homeValueCents)}</strong></div>
            <div><span>Other assets</span><strong>{money(normalized.finances.otherAssetsCents)}</strong></div>
            <div><span>Revolving credit limit</span><strong>{money(normalized.finances.revolvingCreditLimitCents)}</strong></div>
            <div><span>Revolving credit used</span><strong>{money(normalized.finances.revolvingCreditUsedCents)}</strong></div>
          </div>
          <h3>Term debts</h3>
          {normalized.finances.termDebts.length === 0 ? <p>No term debts.</p> : (
            <ul>
              {normalized.finances.termDebts.map((debt) => (
                <li key={debt.id}>
                  <strong>{debt.id}</strong>: {debt.kind.replaceAll("_", " ")} · {money(debt.principalCents)} principal · {(debt.annualInterestRatePpm / 10_000).toFixed(2)}% APR · {money(debt.minimumPaymentCents)} monthly · {debt.remainingTermMonths} months
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {review.preview ? (
        <div className="cashflow-grid">
          <div><span>Catalog living-cost baseline</span><strong>{money(review.preview.catalogAnnualLivingCostCents)}</strong></div>
          <div><span>Confirmed annual expenses</span><strong>{review.preview.declaredAnnualExpensesCents === null ? "Catalog default" : money(review.preview.declaredAnnualExpensesCents)}</strong></div>
          <div><span>Required monthly obligations</span><strong>{money(review.preview.requiredMonthlyObligationsCents)}</strong></div>
          <div><span>Goal annual spending</span><strong>{money(review.preview.financialGoal.desiredAnnualSpendingCents)}</strong></div>
          <div><span>Goal safe-withdrawal rate</span><strong>{(review.preview.financialGoal.safeWithdrawalRatePpm / 10_000).toFixed(1)}%</strong></div>
          <div><span>Goal target age</span><strong>{review.preview.financialGoal.targetAgeYears}</strong></div>
          <div><span>Goal source</span><strong>{review.preview.financialGoal.source.replaceAll("_", " ")}</strong></div>
          <div><span>FI target</span><strong>{money(review.preview.financialGoalTargetCents)}</strong></div>
          <div><span>FI progress</span><strong>{(review.preview.financialGoalProgressPpm / 10_000).toFixed(1)}%</strong></div>
          <div><span>Initial Risk v1 severity</span><strong>{(review.preview.aggregateRiskSeverityPpm / 10_000).toFixed(1)}%</strong></div>
          <div><span>Initial risk weaknesses</span><strong>{review.preview.riskWeaknessTags.length === 0 ? "None" : review.preview.riskWeaknessTags.join(", ")}</strong></div>
        </div>
      ) : null}
      {review.preview ? (
        <details>
          <summary>Owner versions</summary>
          <ul>
            <li>{review.preview.owners.stateAndObligations} · {review.preview.ownerVersions.stateAndObligations} · schema {review.preview.ownerVersions.stateSchema}</li>
            <li>{review.preview.owners.financialGoal} · {review.preview.ownerVersions.financialGoal}</li>
            <li>{review.preview.owners.risk} · {review.preview.ownerVersions.risk}</li>
          </ul>
        </details>
      ) : null}
      {presentation.issues.length > 0 ? (
        <div>
          <h3>Needs attention</h3>
          <ul>{presentation.issues.map((item) => <li key={`${item.path}:${item.code}`}><strong>{item.path}</strong>: {item.message}</li>)}</ul>
        </div>
      ) : null}
      <div>
        <h3>Assumptions</h3>
        {presentation.assumptions.length === 0 ? <p>No product defaults were needed.</p> : (
          <ul>{presentation.assumptions.map((item) => <li key={`${item.path}:${item.code}`}><strong>{item.path}</strong>: {item.message}</li>)}</ul>
        )}
      </div>
      <details>
        <summary>Field sources and versions</summary>
        <ul>{review.provenance.map((item) => <li key={item.path}><strong>{item.path}</strong>: {item.source.replaceAll("_", " ")} · {item.sourceId} · {item.sourceVersion}</li>)}</ul>
      </details>
      {!current ? <p role="alert">The inputs changed. Review again before starting.</p> : null}
      <button
        className="play-primary"
        disabled={busy || !current || review.status !== "ready"}
        onClick={onConfirm}
        type="button"
      >
        {busy ? "Starting…" : "Confirm and start"}
      </button>
      <p className="play-note">Review checksum {review.reviewChecksum}</p>
    </section>
  );
}
