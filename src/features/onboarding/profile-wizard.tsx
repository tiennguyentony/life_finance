"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LoadingState } from "@/components/async-state";
import { useOnboarding } from "./onboarding-provider";
import { Sprout } from "@/components/sprout";
import {
  getPersonas,
  PROFILE_INSURANCE_COVERAGES,
  PROFILE_LOCATIONS,
  profileHealthPlans,
} from "@/services/player.service";
import type { Persona, ProfileInput } from "@/types/game";

const STEP_LABELS = ["You", "Where", "Protection", "Goal"] as const;
const PERSONA_LOCATION_ID: Readonly<Record<Persona["id"], string>> = {
  "junior-developer": "location.seattle",
  educator: "location.chicago",
  "city-survivor": "location.seattle",
};

export function ProfileWizard() {
  const router = useRouter();
  const { selectedPersonaId, choosePersona, queueProfile } = useOnboarding();
  const [personas, setPersonas] = useState<readonly Persona[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Omit<ProfileInput, "personaId">>({
    age: "",
    locationId: "",
    healthPlanId: "health.hdhp_hsa",
    insuranceCoverageIds: ["insurance.renters"],
    desiredAnnualSpendingDollars: "60000",
    targetAgeYears: "50",
  });

  useEffect(() => {
    let active = true;
    getPersonas().then((result) => {
      if (active) setPersonas(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const persona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? personas[0],
    [personas, selectedPersonaId],
  );

  if (!persona) {
    return <LoadingState label="Loading your character sheet..." />;
  }

  function updateField<K extends keyof typeof form>(
    field: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleCoverage(coverageId: string) {
    setForm((current) => ({
      ...current,
      insuranceCoverageIds: current.insuranceCoverageIds.includes(coverageId)
        ? current.insuranceCoverageIds.filter((id) => id !== coverageId)
        : [...current.insuranceCoverageIds, coverageId],
    }));
  }

  function handleContinue() {
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }

    choosePersona(persona.id);
    queueProfile({
      ...form,
      locationId: form.locationId || PERSONA_LOCATION_ID[persona.id],
      personaId: persona.id,
    });
    router.push("/generating");
  }

  const parsedAge = form.age === "" ? persona.age : Number(form.age);
  const effectiveLocationId =
    form.locationId || PERSONA_LOCATION_ID[persona.id];
  const availableHealthPlans = profileHealthPlans(persona.id);
  const protectionIsValid =
    (form.healthPlanId === null ||
      availableHealthPlans.some(({ id }) => id === form.healthPlanId)) &&
    form.insuranceCoverageIds.every((id) =>
      PROFILE_INSURANCE_COVERAGES.some((coverage) => coverage.id === id),
    );
  const canContinue =
    step === 0
      ? Number.isInteger(parsedAge) && parsedAge >= 18 && parsedAge <= 80
      : step === 1
        ? PROFILE_LOCATIONS.some(({ id }) => id === effectiveLocationId)
        : step === 2
          ? protectionIsValid
          : Number.isSafeInteger(Number(form.desiredAnnualSpendingDollars)) &&
          Number(form.desiredAnnualSpendingDollars) > 0 &&
          Number.isSafeInteger(Number(form.targetAgeYears)) &&
          Number(form.targetAgeYears) >= 18 &&
          Number(form.targetAgeYears) <= 80;

  return (
    <div className="screen wizard-screen">
      <section className="wizard-panel">
        <div className="wizard-progress" aria-label={`Profile step ${step + 1} of 4`}>
          {STEP_LABELS.map((label, index) => (
            <div className={index <= step ? "wizard-step wizard-step-active" : "wizard-step"} key={label}>
              <i />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <form onSubmit={(event) => { event.preventDefault(); handleContinue(); }}>
          {step === 0 ? (
            <fieldset className="wizard-fieldset" key="identity">
              <legend>When does Sprout start this financial life?</legend>
              <label>
                Age
                <input
                  autoFocus
                  inputMode="numeric"
                  max={80}
                  min={18}
                  onChange={(event) => updateField("age", event.target.value)}
                  placeholder={String(persona.age)}
                  type="number"
                  value={form.age}
                />
              </label>
              <p className="hq-note">
                Leave it blank to use this life&rsquo;s suggested age of {persona.age}.
              </p>
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset className="wizard-fieldset" key="location">
              <legend>Where does your money disappear?</legend>
              <label className="field-wide">
                Metro area
                <select
                  autoFocus
                  onChange={(event) => updateField("locationId", event.target.value)}
                  value={effectiveLocationId}
                >
                  {PROFILE_LOCATIONS.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hq-note">
                This changes state taxes and the catalog-owned cost of living.
              </p>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <fieldset className="wizard-fieldset" key="protection">
              <legend>Choose what protects you</legend>
              <label className="field-wide">
                Health plan
                <select
                  autoFocus
                  onChange={(event) =>
                    updateField("healthPlanId", event.target.value || null)
                  }
                  value={form.healthPlanId ?? ""}
                >
                  <option value="">No health plan</option>
                  {availableHealthPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-wide" style={{ display: "grid", gap: "0.5rem" }}>
                <span className="hq-eyebrow">Optional insurance</span>
                {PROFILE_INSURANCE_COVERAGES.map((coverage) => (
                  <label
                    key={coverage.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    <input
                      checked={form.insuranceCoverageIds.includes(coverage.id)}
                      onChange={() => toggleCoverage(coverage.id)}
                      style={{ height: 20, width: 20 }}
                      type="checkbox"
                    />
                    {coverage.label}
                  </label>
                ))}
              </div>
              <p className="hq-note">
                Choosing no plan or no optional coverage is allowed. Premiums
                become required monthly spending and coverage can mitigate
                matching life events.
              </p>
            </fieldset>
          ) : null}

          {step === 3 ? (
            <fieldset className="wizard-fieldset" key="goal">
              <legend>Define financial independence</legend>
              <label className="field-wide">
                Desired annual spending in retirement (USD)
                <input
                  autoFocus
                  inputMode="numeric"
                  min={1}
                  onChange={(event) =>
                    updateField("desiredAnnualSpendingDollars", event.target.value)
                  }
                  step={1000}
                  type="number"
                  value={form.desiredAnnualSpendingDollars}
                />
              </label>
              <label>
                Target age
                <input
                  inputMode="numeric"
                  max={80}
                  min={18}
                  onChange={(event) => updateField("targetAgeYears", event.target.value)}
                  type="number"
                  value={form.targetAgeYears}
                />
              </label>
              <p className="hq-note">
                The game uses a 4% safe-withdrawal assumption, so this goal sets
                the exact FI target shown in Money HQ.
              </p>
            </fieldset>
          ) : null}

          <div className="wizard-actions">
            {step > 0 ? (
              <button className="button button-ghost" onClick={() => setStep((current) => current - 1)} type="button">
                Back
              </button>
            ) : <span />}
            <button className="button button-primary" disabled={!canContinue} type="submit">
              {step === 3 ? "Generate my life" : "Continue"}
            </button>
          </div>
        </form>
      </section>
      <aside className={`wizard-persona wizard-persona-${persona.tone}`}>
        <span>Selected life</span>
        <h2>{persona.name}</h2>
        <p>{persona.career}</p>
        <Sprout emotion={step === 3 ? "thinking" : "idle"} size="medium" />
      </aside>
    </div>
  );
}
