import Image from "next/image";

import { US_2026_SCENARIO_CATALOG } from "@/data/scenario-catalog";

import { MASCOT, personaCharacter } from "./persona-art";
import {
  formatMoney,
  PLAYER_PRESETS,
  type PlayerPresetId,
} from "./play-model";
import type { OnboardingDraft } from "./play-types";

type Props = Readonly<{
  draft: OnboardingDraft;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onChange: (next: OnboardingDraft) => void;
  onCreate: () => void;
}>;

const PERSONA_ORDER: readonly PlayerPresetId[] = [
  "software",
  "nurse",
  "teacher",
  "established",
];

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

  const selectPersona = (presetId: PlayerPresetId) => {
    const nextPreset = PLAYER_PRESETS[presetId];
    onChange({
      ...draft,
      presetId,
      salary: nextPreset.salaryDollars,
      cash: nextPreset.defaultCashDollars,
      healthPlanId: nextPreset.healthPlanId,
      coverageIds: ["insurance.renters"],
    });
  };

  return (
    <section className="play-start">
      <div>
        <h1>Build a life, then stress-test it.</h1>
        <p className="lede">
          Choose a player or adjust the numbers. The engine localizes salary,
          living cost, tax, benefits, risk, and the finish line.
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
        <Image
          alt={MASCOT.alt}
          className="start-mascot"
          height={MASCOT.height}
          sizes="148px"
          src={MASCOT.src}
          width={MASCOT.width}
        />
      </div>
      <div className="play-panel play-form">
        <h2>Create your starting position</h2>
        <fieldset className="persona-grid">
          <legend>Choose your player</legend>
          {PERSONA_ORDER.map((presetId) => {
            const option = PLAYER_PRESETS[presetId];
            const character = personaCharacter(presetId);
            return (
              <label className="persona-card" key={presetId}>
                <input
                  checked={draft.presetId === presetId}
                  className="sr-only"
                  name="persona"
                  onChange={() => selectPersona(presetId)}
                  type="radio"
                  value={presetId}
                />
                <Image
                  alt=""
                  className="persona-portrait"
                  height={character.height}
                  sizes="56px"
                  src={character.src}
                  width={character.width}
                />
                <span className="persona-name">{character.name}</span>
                <span className="persona-role">{option.label}</span>
              </label>
            );
          })}
        </fieldset>
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
                    {formatMoney(premium)}/month, {formatMoney(deductible)}
                    {" deductible"}
                    {plan.hsaEligible ? ", HSA eligible" : ""}
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
                  {formatMoney(coverage.monthlyPremiumCents)}/month,{" "}
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
          className="btn btn-primary btn-lg"
          disabled={busy}
          onClick={onCreate}
          type="button"
        >
          {busy ? (
            <>
              <span aria-hidden="true" className="working-dots">
                <span />
                <span />
                <span />
              </span>
              {busyLabel}
            </>
          ) : (
            "Create balance sheet"
          )}
        </button>
        <p className="play-note">
          The anonymous run credential stays only in this browser tab.
        </p>
      </div>
    </section>
  );
}
