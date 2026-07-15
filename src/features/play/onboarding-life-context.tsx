import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";

import {
  allowedHouseholds,
  cashRangeDollars,
  PLAYER_PRESETS,
  salaryRangeDollars,
  selectionForCareer,
  selectionForPreset,
  selectionForScenario,
} from "./onboarding-model";
import { calculateAgeYears } from "./play-model";
import type { OnboardingDraft } from "./play-types";

type Props = Readonly<{
  draft: OnboardingDraft;
  onChange: (next: OnboardingDraft) => void;
}>;

export function OnboardingLifeContext({ draft, onChange }: Props) {
  const selection = draft.selection;
  const choosePreset = (presetId: OnboardingDraft["presetId"]) => {
    const preset = PLAYER_PRESETS[presetId];
    const nextSelection = selectionForPreset(presetId);
    onChange({
      ...draft,
      presetId,
      selection: nextSelection,
      salary: preset.salaryDollars,
      cash: preset.defaultCashDollars,
      healthPlanId: nextSelection.healthPlanId,
      coverageIds: ["insurance.renters"],
    });
  };
  const chooseScenario = (scenarioId: string) => {
    const nextSelection = selectionForScenario(selection, scenarioId);
    const range = cashRangeDollars(scenarioId);
    onChange({
      ...draft,
      selection: nextSelection,
      cash: Math.max(range.minimum, Math.min(draft.cash, range.maximum)),
    });
  };
  const chooseCareer = (careerId: string) => {
    const nextSelection = selectionForCareer(selection, careerId);
    const selectedBenefits = US_2026_SCENARIO_CATALOG.benefitsPackages.find(
      ({ id }) => id === nextSelection.benefitsPackageId,
    );
    onChange({
      ...draft,
      selection: nextSelection,
      healthPlanId: nextSelection.healthPlanId,
      coverageIds: draft.coverageIds.filter((id) =>
        selectedBenefits?.insuranceCoverageIds.includes(id),
      ),
      salary: salaryRangeDollars(careerId, selection.locationId).recommended,
    });
  };
  const chooseLocation = (locationId: string) => {
    onChange({
      ...draft,
      selection: { ...selection, locationId },
      salary: salaryRangeDollars(selection.careerId, locationId).recommended,
    });
  };
  const chooseBirthMonth = (birthMonth: string) => {
    const startingAge = calculateAgeYears(birthMonth, "2026-07");
    onChange({
      ...draft,
      selection: { ...selection, birthMonth },
      targetAgeYears: Math.max(draft.targetAgeYears, startingAge + 1),
    });
  };

  return (
    <>
      <fieldset className="benefit-choices">
        <legend>Setup path</legend>
        <label>
          <input checked={draft.setupMode === "quick"} name="setup-mode" onChange={() => onChange({ ...draft, setupMode: "quick" })} type="radio" />
          <span><strong>Quick start</strong><small>Use a coherent pre-filled life, then adjust any money field.</small></span>
        </label>
        <label>
          <input checked={draft.setupMode === "custom"} name="setup-mode" onChange={() => onChange({ ...draft, setupMode: "custom" })} type="radio" />
          <span><strong>Custom life</strong><small>Choose age, city, career, household, and starting scenario.</small></span>
        </label>
      </fieldset>
      {draft.setupMode === "quick" ? (
        <label>
          Persona
          <select value={draft.presetId} onChange={(event) => choosePreset(event.target.value as OnboardingDraft["presetId"])}>
            {Object.entries(PLAYER_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
          </select>
        </label>
      ) : (
        <fieldset className="benefit-choices">
          <legend>Your life context</legend>
          <div className="play-inline-fields">
            <label>
              Starting scenario
              <select value={selection.scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
                {US_2026_SCENARIO_CATALOG.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
              </select>
            </label>
            <label>
              Birth month
              <input max="2008-07" min="1946-07" type="month" value={selection.birthMonth} onChange={(event) => chooseBirthMonth(event.target.value)} />
            </label>
          </div>
          <label>
            City and state
            <select value={selection.locationId} onChange={(event) => chooseLocation(event.target.value)}>
              {US_2026_SCENARIO_CATALOG.locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
            </select>
          </label>
          <label>
            Career
            <select value={selection.careerId} onChange={(event) => chooseCareer(event.target.value)}>
              {US_2026_SCENARIO_CATALOG.careers.map((career) => <option key={career.id} value={career.id}>{career.label}</option>)}
            </select>
          </label>
          <label>
            Household
            <select value={selection.householdId} onChange={(event) => onChange({ ...draft, selection: { ...selection, householdId: event.target.value } })}>
              {allowedHouseholds(selection.scenarioId).map((household) => <option key={household.id} value={household.id}>{household.label}</option>)}
            </select>
          </label>
        </fieldset>
      )}
    </>
  );
}
