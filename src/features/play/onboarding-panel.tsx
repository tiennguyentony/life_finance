import { US_2026_SCENARIO_CATALOG } from "@/data/scenario-catalog";

import { formatMoney, PLAYER_PRESETS } from "./play-model";
import type { OnboardingDraft } from "./play-types";

type Props = Readonly<{
  draft: OnboardingDraft;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onChange: (next: OnboardingDraft) => void;
  onCreate: () => void;
}>;

export function OnboardingPanel({
  draft,
  busy,
  busyLabel,
  error,
  onChange,
  onCreate,
}: Props) {
  const preset = PLAYER_PRESETS[draft.presetId];
  const benefitsPackage = US_2026_SCENARIO_CATALOG.benefitsPackages.find(
    ({ id }) => id === preset.benefitsPackageId,
  )!;
  const household = US_2026_SCENARIO_CATALOG.households.find(
    ({ id }) => id === preset.householdId,
  )!;
  const healthPlans = benefitsPackage.healthPlanIds.map(
    (planId) =>
      US_2026_SCENARIO_CATALOG.healthPlans.find(({ id }) => id === planId)!,
  );
  const coverageOptions = benefitsPackage.insuranceCoverageIds.map(
    (coverageId) =>
      US_2026_SCENARIO_CATALOG.insuranceCoverages.find(
        ({ id }) => id === coverageId,
      )!,
  );
  const fiTargetDollars =
    draft.safeWithdrawalRate > 0
      ? Math.ceil(
          draft.desiredAnnualFiSpending /
            (draft.safeWithdrawalRate / 100),
        )
      : 0;

  return (
    <section className="play-start">
      <div>
        <p className="hero-kicker">Life Finance · learning simulation</p>
        <h1>Build a life, then stress-test it.</h1>
        <p className="lede">
          Choose a persona or adjust the numbers. The engine localizes salary,
          living cost, tax, benefits, risk, and the FI finish line.
        </p>
        <ul className="play-learning-list">
          <li>Build liquidity without giving up long-term compounding.</li>
          <li>
            See gross salary become tax, benefits, obligations, and take-home
            cash.
          </li>
          <li>
            Learn why diversification, insurance, and employer match matter.
          </li>
        </ul>
      </div>
      <div className="play-panel play-form">
        <h2>Create your starting position</h2>
        <label>
          Persona
          <select
            value={draft.presetId}
            onChange={(event) => {
              const presetId = event.target.value as OnboardingDraft["presetId"];
              const nextPreset = PLAYER_PRESETS[presetId];
              onChange({
                ...draft,
                presetId,
                salary: nextPreset.salaryDollars,
                cash: nextPreset.defaultCashDollars,
                healthPlanId: nextPreset.healthPlanId,
                coverageIds: ["insurance.renters"],
              });
            }}
          >
            {Object.entries(PLAYER_PRESETS).map(([id, option]) => (
              <option key={id} value={id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="play-inline-fields">
          <label>
            Annual salary (USD)
            <input
              min="1"
              step="1000"
              type="number"
              value={draft.salary}
              onChange={(event) =>
                onChange({ ...draft, salary: event.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Starting cash (USD)
            <input
              min="1000"
              max={
                preset.scenarioId === "scenario.fresh_start" ? 25000 : 100000
              }
              step="500"
              type="number"
              value={draft.cash}
              onChange={(event) =>
                onChange({ ...draft, cash: event.target.valueAsNumber })
              }
            />
          </label>
        </div>
        <div className="play-inline-fields">
          <label>
            Student debt (USD, optional)
            <input
              min="0"
              step="1000"
              type="number"
              value={draft.studentDebt}
              onChange={(event) =>
                onChange({ ...draft, studentDebt: event.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Monthly debt payment (USD)
            <input
              min="1"
              step="25"
              type="number"
              value={draft.studentDebtPayment}
              onChange={(event) =>
                onChange({
                  ...draft,
                  studentDebtPayment: event.target.valueAsNumber,
                })
              }
            />
          </label>
        </div>
        <fieldset className="benefit-choices">
          <legend>Define your financial independence goal</legend>
          <div className="play-inline-fields">
            <label>
              Desired annual spending after FI (USD)
              <input
                min="10000"
                step="1000"
                type="number"
                value={draft.desiredAnnualFiSpending}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    desiredAnnualFiSpending: event.target.valueAsNumber,
                  })
                }
              />
            </label>
            <label>
              Target age
              <input
                min="32"
                max="80"
                step="1"
                type="number"
                value={draft.targetAgeYears}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    targetAgeYears: event.target.valueAsNumber,
                  })
                }
              />
            </label>
          </div>
          <label>
            Safe withdrawal rate
            <select
              value={draft.safeWithdrawalRate}
              onChange={(event) =>
                onChange({
                  ...draft,
                  safeWithdrawalRate: Number(event.target.value),
                })
              }
            >
              <option value="4">4% · standard learning mode</option>
              <option value="3.5">3.5% · conservative</option>
              <option value="3">3% · hard mode</option>
            </select>
          </label>
          <p className="play-note">
            Your finish line is {formatMoney(fiTargetDollars * 100)} by age{" "}
            {draft.targetAgeYears}. The engine derives it from your desired
            spending and withdrawal rate; home equity remains excluded.
          </p>
        </fieldset>
        <fieldset className="benefit-choices">
          <legend>Choose health protection</legend>
          {healthPlans.map((plan) => {
            const family = household.healthCoverageTier !== "self";
            const premium = family
              ? plan.monthlyEmployeePremiumFamilyCents
              : plan.monthlyEmployeePremiumSelfCents;
            const deductible = family
              ? plan.annualDeductibleFamilyCents
              : plan.annualDeductibleSelfCents;
            return (
              <label key={plan.id}>
                <input
                  checked={draft.healthPlanId === plan.id}
                  name="health-plan"
                  onChange={() =>
                    onChange({ ...draft, healthPlanId: plan.id })
                  }
                  type="radio"
                />
                <span>
                  <strong>{plan.label}</strong>
                  <small>
                    {formatMoney(premium)}/month · {formatMoney(deductible)}
                    {" deductible"}
                    {plan.hsaEligible ? " · HSA eligible" : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="benefit-choices">
          <legend>Optional insurance</legend>
          {coverageOptions.map((coverage) => (
            <label key={coverage.id}>
              <input
                checked={draft.coverageIds.includes(coverage.id)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    coverageIds: event.target.checked
                      ? [...draft.coverageIds, coverage.id]
                      : draft.coverageIds.filter((id) => id !== coverage.id),
                  })
                }
                type="checkbox"
              />
              <span>
                <strong>{coverage.label}</strong>
                <small>
                  {formatMoney(coverage.monthlyPremiumCents)}/month ·{" "}
                  {formatMoney(coverage.coverageLimitCents)} limit
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="preset-summary">
          <span>
            {preset.householdId.replace("household.", "").replaceAll("_", " ")}
          </span>
          <span>
            {draft.healthPlanId.replace("health.", "").replaceAll("_", " ")}
          </span>
          <span>
            {preset.retirementPlanId
              .replace("retirement.", "")
              .replaceAll("_", " ")}
          </span>
        </div>
        {error ? (
          <p className="play-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="play-primary"
          disabled={busy}
          onClick={onCreate}
          type="button"
        >
          {busy ? busyLabel : "Create balance sheet"}
        </button>
        <p className="play-note">
          The anonymous run credential stays only in this browser tab.
        </p>
      </div>
    </section>
  );
}
