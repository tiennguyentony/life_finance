import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";

import { formatMoney } from "./play-model";
import type { OnboardingDraft } from "./play-types";

type Props = Readonly<{
  draft: OnboardingDraft;
  onChange: (next: OnboardingDraft) => void;
}>;

export function OnboardingBenefitFields({ draft, onChange }: Props) {
  const benefits = US_2026_SCENARIO_CATALOG.benefitsPackages.find(
    ({ id }) => id === draft.selection.benefitsPackageId,
  )!;
  const household = US_2026_SCENARIO_CATALOG.households.find(
    ({ id }) => id === draft.selection.householdId,
  )!;
  const healthPlans = benefits.healthPlanIds.map((id) =>
    US_2026_SCENARIO_CATALOG.healthPlans.find((plan) => plan.id === id)!,
  );
  const coverages = benefits.insuranceCoverageIds.map((id) =>
    US_2026_SCENARIO_CATALOG.insuranceCoverages.find((coverage) => coverage.id === id)!,
  );
  return (
    <>
      <fieldset className="benefit-choices">
        <legend>Choose health protection</legend>
        <label>
          <input checked={draft.healthPlanId === null} name="health-plan" onChange={() => onChange({ ...draft, healthPlanId: null })} type="radio" />
          <span><strong>Waive employer health coverage</strong><small>$0 premium · full medical-event cost · no HSA</small></span>
        </label>
        {healthPlans.map((plan) => {
          const family = household.healthCoverageTier === "family";
          const premium = family ? plan.monthlyEmployeePremiumFamilyCents : plan.monthlyEmployeePremiumSelfCents;
          const deductible = family ? plan.annualDeductibleFamilyCents : plan.annualDeductibleSelfCents;
          return (
            <label key={plan.id}>
              <input checked={draft.healthPlanId === plan.id} name="health-plan" onChange={() => onChange({ ...draft, healthPlanId: plan.id })} type="radio" />
              <span><strong>{plan.label}</strong><small>{formatMoney(premium)}/month · {formatMoney(deductible)} deductible{plan.hsaEligible ? " · HSA eligible" : ""}</small></span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="benefit-choices">
        <legend>Optional insurance</legend>
        {coverages.map((coverage) => (
          <label key={coverage.id}>
            <input checked={draft.coverageIds.includes(coverage.id)} onChange={(event) => onChange({ ...draft, coverageIds: event.target.checked ? [...draft.coverageIds, coverage.id] : draft.coverageIds.filter((id) => id !== coverage.id) })} type="checkbox" />
            <span><strong>{coverage.label}</strong><small>{formatMoney(coverage.monthlyPremiumCents)}/month · {formatMoney(coverage.coverageLimitCents)} limit</small></span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
