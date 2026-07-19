import type { BoardPlan, RecurringStrategyRates } from "@/features/board/plan-catalog";

/** The contribution rates the Invest screen can edit. */
export type EditableRate = keyof Omit<
  RecurringStrategyRates,
  "emergencyFundTargetMonthsPpm"
>;

export type InvestDraft = Readonly<Record<EditableRate, number>>;

export type InvestStrategyConstraints = Readonly<{
  hsaEligible: boolean;
  hasActiveTermDebt: boolean;
}>;

const FULL_ALLOCATION_PPM = 1_000_000;

export function allocationTotals(draft: InvestDraft): Readonly<{
  preTaxPpm: number;
  afterTaxPpm: number;
}> {
  return Object.freeze({
    preTaxPpm:
      draft.preTax401kSalaryRatePpm + draft.preTaxHsaSalaryRatePpm,
    afterTaxPpm:
      draft.afterTaxBroadIndexRatePpm +
      draft.afterTaxSectorRatePpm +
      draft.afterTaxSpeculativeRatePpm +
      draft.afterTaxIraRatePpm +
      draft.afterTaxExtraDebtRatePpm,
  });
}

export type Dial = Readonly<{
  key: EditableRate;
  label: string;
  hint: string;
  /** Step in ppm of salary. 10,000 ppm is 1% of salary. */
  stepPpm: number;
  maxPpm: number;
}>;

export const DIALS: readonly Dial[] = Object.freeze([
  {
    key: "preTax401kSalaryRatePpm",
    label: "401(k) — pre-tax",
    hint: "% of salary, before taxes hit",
    stepPpm: 10_000,
    maxPpm: 300_000,
  },
  {
    key: "preTaxHsaSalaryRatePpm",
    label: "HSA — pre-tax",
    hint: "health savings, triple tax win",
    stepPpm: 5_000,
    maxPpm: 150_000,
  },
  {
    key: "afterTaxIraRatePpm",
    label: "Roth IRA — after-tax",
    hint: "tax-free later",
    stepPpm: 5_000,
    maxPpm: 200_000,
  },
  {
    key: "afterTaxBroadIndexRatePpm",
    label: "Broad index — taxable",
    hint: "thousands of companies in one fund",
    stepPpm: 5_000,
    maxPpm: 300_000,
  },
  {
    key: "afterTaxSectorRatePpm",
    label: "Sector — taxable",
    hint: "one industry, concentrated risk",
    stepPpm: 5_000,
    maxPpm: 200_000,
  },
  {
    key: "afterTaxSpeculativeRatePpm",
    label: "Speculative — taxable",
    hint: "big maybe; keep it small",
    stepPpm: 2_500,
    maxPpm: 100_000,
  },
  {
    key: "afterTaxExtraDebtRatePpm",
    label: "Extra debt payment",
    hint: "beyond the minimum",
    stepPpm: 5_000,
    maxPpm: 200_000,
  },
]);

type StrategySource = Readonly<Record<EditableRate, number>>;

export function draftFromStrategy(strategy: StrategySource): InvestDraft {
  return Object.freeze({
    preTax401kSalaryRatePpm: strategy.preTax401kSalaryRatePpm,
    preTaxHsaSalaryRatePpm: strategy.preTaxHsaSalaryRatePpm,
    afterTaxIraRatePpm: strategy.afterTaxIraRatePpm,
    afterTaxBroadIndexRatePpm: strategy.afterTaxBroadIndexRatePpm,
    afterTaxSectorRatePpm: strategy.afterTaxSectorRatePpm,
    afterTaxSpeculativeRatePpm: strategy.afterTaxSpeculativeRatePpm,
    afterTaxExtraDebtRatePpm: strategy.afterTaxExtraDebtRatePpm,
  });
}

export function draftDiffersFromStrategy(
  draft: InvestDraft,
  strategy: StrategySource,
): boolean {
  return DIALS.some(({ key }) => draft[key] !== strategy[key]);
}

export function adjustDraft(
  draft: InvestDraft,
  key: EditableRate,
  deltaPpm: number,
  maxPpm: number,
): InvestDraft {
  return Object.freeze({
    ...draft,
    [key]: Math.max(0, Math.min(maxPpm, draft[key] + deltaPpm)),
  });
}

/**
 * A synthetic board plan carrying the edited rates. Routing it through the
 * normal plan commit means the Invest screen inherits the same optimistic
 * concurrency and partial-failure recovery as every other move.
 */
export function investPlanFromDraft(
  draft: InvestDraft,
  constraints: InvestStrategyConstraints = {
    hsaEligible: true,
    hasActiveTermDebt: true,
  },
): BoardPlan {
  const totals = allocationTotals(draft);
  const disabledReason =
    totals.preTaxPpm > FULL_ALLOCATION_PPM
      ? "Pre-tax 401(k) and HSA rates cannot exceed 100% in total."
      : totals.afterTaxPpm > FULL_ALLOCATION_PPM
        ? "After-tax investing and extra debt rates cannot exceed 100% in total."
    : draft.preTaxHsaSalaryRatePpm > 0 && !constraints.hsaEligible
      ? "Choose an HSA-eligible health plan before contributing to an HSA."
      : draft.afterTaxExtraDebtRatePpm > 0 && !constraints.hasActiveTermDebt
        ? "Set extra debt payments to 0% because no active term debt remains."
        : null;
  return Object.freeze({
    id: "hq.invest.strategy",
    destinationId: "financial" as const,
    label: "Update contribution plan",
    description: "Save these contribution rates as your recurring strategy.",
    effects: Object.freeze([]),
    disabledReason,
    command: Object.freeze({
      type: "set_recurring_strategy_patch" as const,
      patch: Object.freeze({ ...draft }),
    }),
  });
}
