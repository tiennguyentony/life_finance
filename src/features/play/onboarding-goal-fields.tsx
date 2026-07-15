import { calculateAgeYears, formatMoney } from "./play-model";
import type { OnboardingDraft } from "./play-types";

type Props = Readonly<{
  draft: OnboardingDraft;
  onChange: (next: OnboardingDraft) => void;
}>;

export function OnboardingGoalFields({ draft, onChange }: Props) {
  const startingAge = calculateAgeYears(draft.selection.birthMonth, "2026-07");
  const targetDollars = draft.safeWithdrawalRate > 0
    ? Math.ceil(draft.desiredAnnualFiSpending / (draft.safeWithdrawalRate / 100))
    : 0;
  return (
    <fieldset className="benefit-choices">
      <legend>Define your financial independence goal</legend>
      <div className="play-inline-fields">
        <label>
          Desired annual spending after FI (USD)
          <input min="10000" step="1000" type="number" value={draft.desiredAnnualFiSpending} onChange={(event) => onChange({ ...draft, desiredAnnualFiSpending: event.target.valueAsNumber })} />
        </label>
        <label>
          Target age
          <input min={startingAge + 1} max="80" step="1" type="number" value={draft.targetAgeYears} onChange={(event) => onChange({ ...draft, targetAgeYears: event.target.valueAsNumber })} />
        </label>
      </div>
      <label>
        Safe withdrawal rate
        <select value={draft.safeWithdrawalRate} onChange={(event) => onChange({ ...draft, safeWithdrawalRate: Number(event.target.value) })}>
          <option value="4">4% · standard learning mode</option>
          <option value="3.5">3.5% · conservative</option>
          <option value="3">3% · hard mode</option>
        </select>
      </label>
      <p className="play-note">
        Your finish line is {formatMoney(targetDollars * 100)} by age {draft.targetAgeYears}. The engine derives it from desired spending and withdrawal rate; home equity remains excluded.
      </p>
    </fieldset>
  );
}
