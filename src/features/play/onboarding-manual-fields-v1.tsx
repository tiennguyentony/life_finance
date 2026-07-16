import { moneyCents, ratePpm } from "../../core/domain/money";
import type {
  OnboardingDraftV1,
  OnboardingFinancesDraftV1,
  OnboardingTermDebtDraftV1,
  PeriodizedMoneyV1,
} from "../../core/onboarding-v1-contracts";
import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";

function dollars(cents: number | undefined): number | "" {
  return cents === undefined ? "" : cents / 100;
}

function centsFromInput(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function DollarField({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: number | undefined;
  onChange: (cents: number) => void;
}>) {
  return (
    <label>
      {label} (USD)
      <input
        min="0"
        step="100"
        type="number"
        value={dollars(value)}
        onChange={(event) => onChange(centsFromInput(event.target.valueAsNumber))}
      />
    </label>
  );
}

function PeriodizedField({
  label,
  value,
  optional = false,
  onChange,
}: Readonly<{
  label: string;
  value: PeriodizedMoneyV1 | undefined;
  optional?: boolean;
  onChange: (value: PeriodizedMoneyV1 | undefined) => void;
}>) {
  return (
    <div className="play-inline-fields">
      <DollarField
        label={label}
        value={value?.amountCents}
        onChange={(amountCents) =>
          onChange({ amountCents, period: value?.period ?? "annual" })
        }
      />
      <label>
        Period
        <select
          value={value?.period ?? (optional ? "" : "annual")}
          onChange={(event) => {
            if (event.target.value === "") return onChange(undefined);
            onChange({
              amountCents: value?.amountCents ?? 0,
              period: event.target.value as PeriodizedMoneyV1["period"],
            });
          }}
        >
          {optional ? <option value="">Not provided</option> : null}
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
    </div>
  );
}

export function OnboardingManualFieldsV1({
  draft,
  onChange,
}: Readonly<{
  draft: OnboardingDraftV1;
  onChange: (draft: OnboardingDraftV1) => void;
}>) {
  const finances = draft.finances ?? {};
  const updateFinances = (patch: Partial<OnboardingFinancesDraftV1>) =>
    onChange({ ...draft, finances: { ...finances, ...patch } });
  const debts = finances.termDebts ?? [];
  const updateDebt = (index: number, patch: Partial<OnboardingTermDebtDraftV1>) =>
    updateFinances({
      termDebts: debts.map((debt, debtIndex) =>
        debtIndex === index ? { ...debt, ...patch } : debt,
      ),
    });
  const goal = draft.financialGoal;
  return (
    <section className="play-panel play-form" aria-label="Manual onboarding fields">
      <h2>Describe your starting position</h2>
      <div className="play-inline-fields">
        <label>
          Start month
          <input type="month" value={draft.startMonth ?? ""} onChange={(event) => onChange({ ...draft, startMonth: event.target.value })} />
        </label>
        <label>
          Birth month
          <input type="month" value={draft.birthMonth ?? ""} onChange={(event) => onChange({ ...draft, birthMonth: event.target.value })} />
        </label>
        <label>
          Simulation seed
          <input value={draft.randomSeed ?? ""} onChange={(event) => onChange({ ...draft, randomSeed: event.target.value })} />
        </label>
      </div>
      <div className="play-inline-fields">
        <label>
          Location
          <select value={draft.locationId ?? ""} onChange={(event) => onChange({ ...draft, locationId: event.target.value })}>
            {US_2026_SCENARIO_CATALOG.locations.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          Employment / industry
          <select value={draft.careerId ?? ""} onChange={(event) => onChange({ ...draft, careerId: event.target.value })}>
            {US_2026_SCENARIO_CATALOG.careers.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          Household / dependents
          <select value={draft.householdId ?? ""} onChange={(event) => onChange({ ...draft, householdId: event.target.value })}>
            {US_2026_SCENARIO_CATALOG.households.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <PeriodizedField
        label="Gross income"
        value={draft.grossIncome}
        onChange={(value) => onChange({
          ...draft,
          grossIncome: value === undefined ? undefined : { ...value, basis: "gross" },
        })}
      />
      <PeriodizedField
        label="Take-home income evidence"
        optional
        value={draft.takeHomeIncome}
        onChange={(value) => onChange({
          ...draft,
          takeHomeIncome: value === undefined ? undefined : { ...value, basis: "take_home" },
        })}
      />
      <PeriodizedField label="Essential expenses" optional value={draft.essentialExpenses} onChange={(value) => onChange({ ...draft, essentialExpenses: value })} />
      <PeriodizedField label="Discretionary expenses / lifestyle" optional value={draft.discretionaryExpenses} onChange={(value) => onChange({ ...draft, discretionaryExpenses: value })} />
      <h3>Assets and credit</h3>
      <div className="play-inline-fields">
        <DollarField label="Cash" value={finances.cashCents} onChange={(cashCents) => updateFinances({ cashCents })} />
        <DollarField label="Broad-index investments" value={finances.taxableBroadIndexCents} onChange={(taxableBroadIndexCents) => updateFinances({ taxableBroadIndexCents })} />
        <DollarField label="Sector investments" value={finances.taxableSectorCents} onChange={(taxableSectorCents) => updateFinances({ taxableSectorCents })} />
        <DollarField label="Speculative investments" value={finances.taxableSpeculativeCents} onChange={(taxableSpeculativeCents) => updateFinances({ taxableSpeculativeCents })} />
        <DollarField label="401(k)" value={finances.retirement401kCents} onChange={(retirement401kCents) => updateFinances({ retirement401kCents })} />
        <DollarField label="IRA" value={finances.retirementIraCents} onChange={(retirementIraCents) => updateFinances({ retirementIraCents })} />
        <DollarField label="HSA" value={finances.hsaCents} onChange={(hsaCents) => updateFinances({ hsaCents })} />
        <DollarField label="Home value" value={finances.homeValueCents} onChange={(homeValueCents) => updateFinances({ homeValueCents })} />
        <DollarField label="Other assets" value={finances.otherAssetsCents} onChange={(otherAssetsCents) => updateFinances({ otherAssetsCents })} />
        <DollarField label="Credit limit" value={finances.revolvingCreditLimitCents} onChange={(revolvingCreditLimitCents) => updateFinances({ revolvingCreditLimitCents })} />
        <DollarField label="Credit used" value={finances.revolvingCreditUsedCents} onChange={(revolvingCreditUsedCents) => updateFinances({ revolvingCreditUsedCents })} />
      </div>
      <h3>Debts and rates</h3>
      {debts.map((debt, index) => (
        <fieldset key={debt.id}>
          <legend>{debt.id}</legend>
          <label>Debt type<select value={debt.kind} onChange={(event) => updateDebt(index, { kind: event.target.value as OnboardingTermDebtDraftV1["kind"] })}><option value="student_loan">Student loan</option><option value="mortgage">Mortgage</option><option value="auto_loan">Auto loan</option><option value="personal_loan">Personal loan</option></select></label>
          <DollarField label="Principal" value={debt.principalCents} onChange={(principalCents) => updateDebt(index, { principalCents })} />
          <label>Annual interest rate (%)<input min="0" max="100" step="0.1" type="number" value={debt.annualInterestRatePpm / 10_000} onChange={(event) => updateDebt(index, { annualInterestRatePpm: Math.round(event.target.valueAsNumber * 10_000) })} /></label>
          <DollarField label="Minimum monthly payment" value={debt.minimumPaymentCents} onChange={(minimumPaymentCents) => updateDebt(index, { minimumPaymentCents })} />
          <label>Remaining months<input min="1" max="1200" type="number" value={debt.remainingTermMonths} onChange={(event) => updateDebt(index, { remainingTermMonths: event.target.valueAsNumber })} /></label>
          <button type="button" onClick={() => updateFinances({ termDebts: debts.filter((_item, debtIndex) => debtIndex !== index) })}>Remove debt</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => updateFinances({ termDebts: [...debts, { id: `debt.manual.${debts.length + 1}`, kind: "student_loan", principalCents: 0, annualInterestRatePpm: 0, minimumPaymentCents: 0, remainingTermMonths: 120 }] })}>Add debt</button>
      <h3>Benefits and insurance</h3>
      <div className="play-inline-fields">
        <label>Benefits package<select value={draft.benefitsPackageId ?? ""} onChange={(event) => onChange({ ...draft, benefitsPackageId: event.target.value })}>{US_2026_SCENARIO_CATALOG.benefitsPackages.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Health plan<select value={draft.healthPlanId ?? ""} onChange={(event) => onChange({ ...draft, healthPlanId: event.target.value === "" ? null : event.target.value })}><option value="">Waive employer coverage</option>{US_2026_SCENARIO_CATALOG.healthPlans.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Retirement plan / employer match<select value={draft.retirementPlanId ?? ""} onChange={(event) => onChange({ ...draft, retirementPlanId: event.target.value })}>{US_2026_SCENARIO_CATALOG.retirementPlans.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Starting scenario / lifestyle<select value={draft.scenarioId ?? ""} onChange={(event) => onChange({ ...draft, scenarioId: event.target.value })}>{US_2026_SCENARIO_CATALOG.scenarios.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>
      <fieldset>
        <legend>Insurance coverage</legend>
        {US_2026_SCENARIO_CATALOG.insuranceCoverages.map(({ id, label }) => {
          const selected = draft.insuranceCoverageIds ?? [];
          return <label key={id}><input checked={selected.includes(id)} type="checkbox" onChange={(event) => onChange({ ...draft, insuranceCoverageIds: event.target.checked ? [...selected, id] : selected.filter((selectedId) => selectedId !== id) })} />{label}</label>;
        })}
      </fieldset>
      <h3>Financial-independence goal</h3>
      <div className="play-inline-fields">
        <DollarField label="Desired annual spending" value={goal?.desiredAnnualSpendingCents} onChange={(desiredAnnualSpendingCents) => onChange({ ...draft, financialGoal: { version: "financial-goal-v1", desiredAnnualSpendingCents: moneyCents(desiredAnnualSpendingCents), safeWithdrawalRatePpm: goal?.safeWithdrawalRatePpm ?? ratePpm(40_000), targetAgeYears: goal?.targetAgeYears ?? 65, source: "player_selected" } })} />
        <label>Safe withdrawal rate (%)<input min="2" max="6" step="0.1" type="number" value={(goal?.safeWithdrawalRatePpm ?? 40_000) / 10_000} onChange={(event) => onChange({ ...draft, financialGoal: { version: "financial-goal-v1", desiredAnnualSpendingCents: goal?.desiredAnnualSpendingCents ?? moneyCents(3_600_000), safeWithdrawalRatePpm: ratePpm(Math.round(event.target.valueAsNumber * 10_000)), targetAgeYears: goal?.targetAgeYears ?? 65, source: "player_selected" } })} /></label>
        <label>Target age<input min="18" max="80" type="number" value={goal?.targetAgeYears ?? 65} onChange={(event) => onChange({ ...draft, financialGoal: { version: "financial-goal-v1", desiredAnnualSpendingCents: goal?.desiredAnnualSpendingCents ?? moneyCents(3_600_000), safeWithdrawalRatePpm: goal?.safeWithdrawalRatePpm ?? ratePpm(40_000), targetAgeYears: event.target.valueAsNumber, source: "player_selected" } })} /></label>
        <label>Difficulty<select value={draft.runtimeDifficulty ?? "normal"} onChange={(event) => onChange({ ...draft, runtimeDifficulty: event.target.value as NonNullable<OnboardingDraftV1["runtimeDifficulty"]> })}><option value="guided">Guided</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
      </div>
    </section>
  );
}
