import { cashRangeDollars, salaryRangeDollars } from "./onboarding-model";
import { OnboardingBenefitFields } from "./onboarding-benefit-fields";
import { OnboardingGoalFields } from "./onboarding-goal-fields";
import { OnboardingLifeContext } from "./onboarding-life-context";
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
  const selection = draft.selection;
  const salaryRange = salaryRangeDollars(
    selection.careerId,
    selection.locationId,
  );
  const cashRange = cashRangeDollars(selection.scenarioId);

  return (
    <section className="play-start">
      <div>
        <p className="hero-kicker">Life Finance · learning simulation</p>
        <h1>Build a life, then stress-test it.</h1>
        <p className="lede">
          Start instantly or shape your own life. The engine localizes salary,
          living cost, tax, benefits, risk, and your FI finish line.
        </p>
        <ul className="play-learning-list">
          <li>Build liquidity without giving up long-term compounding.</li>
          <li>See gross salary become tax, benefits, obligations, and take-home cash.</li>
          <li>Learn why diversification, insurance, and employer match matter.</li>
        </ul>
      </div>
      <div className="play-panel play-form">
        <h2>Create your starting position</h2>
        <OnboardingLifeContext draft={draft} onChange={onChange} />
        <div className="play-inline-fields">
          <label>
            Annual salary (USD)
            <input
              min={salaryRange.minimum}
              max={salaryRange.maximum}
              step="1000"
              type="number"
              value={draft.salary}
              onChange={(event) => onChange({ ...draft, salary: event.target.valueAsNumber })}
            />
            <small>{salaryRange.minimum.toLocaleString()}–{salaryRange.maximum.toLocaleString()} localized range</small>
          </label>
          <label>
            Starting cash (USD)
            <input
              min={cashRange.minimum}
              max={cashRange.maximum}
              step="500"
              type="number"
              value={draft.cash}
              onChange={(event) => onChange({ ...draft, cash: event.target.valueAsNumber })}
            />
          </label>
        </div>
        <div className="play-inline-fields">
          <label>
            Student debt (USD, optional)
            <input min="0" step="1000" type="number" value={draft.studentDebt} onChange={(event) => onChange({ ...draft, studentDebt: event.target.valueAsNumber })} />
          </label>
          <label>
            Monthly debt payment (USD)
            <input min="1" step="25" type="number" value={draft.studentDebtPayment} onChange={(event) => onChange({ ...draft, studentDebtPayment: event.target.valueAsNumber })} />
          </label>
        </div>
        <OnboardingGoalFields draft={draft} onChange={onChange} />
        <OnboardingBenefitFields draft={draft} onChange={onChange} />
        <div className="preset-summary">
          <span>{selection.householdId.replace("household.", "").replaceAll("_", " ")}</span>
          <span>{draft.healthPlanId ? draft.healthPlanId.replace("health.", "").replaceAll("_", " ") : "coverage waived"}</span>
          <span>{selection.retirementPlanId.replace("retirement.", "").replaceAll("_", " ")}</span>
        </div>
        {error ? <p className="play-error" role="alert">{error}</p> : null}
        <button className="play-primary" disabled={busy} onClick={onCreate} type="button">
          {busy ? busyLabel : "Create balance sheet"}
        </button>
        <p className="play-note">The anonymous run credential stays only in this browser tab.</p>
      </div>
    </section>
  );
}
