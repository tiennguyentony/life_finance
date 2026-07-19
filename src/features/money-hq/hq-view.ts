import type { RunViewWire } from "@/contracts/api/contracts";
import {
  annualToMonthlyCents,
  debtServiceRatioPpm,
  emergencyFundMonths,
  projectContributionBuckets,
  type ContributionBuckets,
} from "./hq-derivations";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return money.format(Math.round(cents) / 100);
}

export function formatPreciseCents(cents: number): string {
  return preciseMoney.format(cents / 100);
}

export function formatSignedPreciseCents(cents: number): string {
  const formatted = formatPreciseCents(Math.abs(cents));
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `−${formatted}`;
  return formatted;
}

/** Renders a change with an explicit sign, using a true minus glyph. */
export function formatSignedCents(cents: number): string {
  const formatted = formatCents(Math.abs(cents));
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `−${formatted}`;
  return formatted;
}

export function formatPpmPercent(ppm: number, fractionDigits = 0): string {
  return `${(ppm / 10_000).toFixed(fractionDigits)}%`;
}

export function formatMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return `${rounded} ${rounded === 1 ? "month" : "months"}`;
}

export function formatMonthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatShortMonthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
}

export type MoneyTone = "positive" | "negative" | "neutral";

export function toneForChange(cents: number): MoneyTone {
  if (cents > 0) return "positive";
  if (cents < 0) return "negative";
  return "neutral";
}

export type HqView = Readonly<{
  cashCents: number;
  netWorthCents: number;
  /** Non-credit liabilities plus drawn revolving credit, as a positive number. */
  debtCents: number;
  revolvingUsedCents: number;
  revolvingLimitCents: number;
  revolvingAvailableCents: number;
  monthlyRequiredCents: number;
  annualLivingCostCents: number;
  monthlyGrossSalaryCents: number | null;
  monthLabel: string;
  shortMonthLabel: string;
  /** 1-based month index within the run. */
  monthNumber: number;
  goalCurrentCents: number;
  goalTargetCents: number;
  goalProgressPpm: number;
  preparednessPpm: number;
  preparednessBand: RunViewWire["preparedness"]["band"];
  riskPpm: number;
  emergencyFundMonths: number | null;
  emergencyTargetMonths: number | null;
  debtServiceRatioPpm: number | null;
  buckets: ContributionBuckets;
  hasPendingEvent: boolean;
  /** Nav badge counts keyed by tab. */
  debtBadge: number;
  isComplete: boolean;
}>;

function monthIndex(startMonth: string, currentMonth: string): number {
  const [startYear = 0, startMonthPart = 1] = startMonth.split("-").map(Number);
  const [year = 0, month = 1] = currentMonth.split("-").map(Number);
  return (year - startYear) * 12 + (month - startMonthPart) + 1;
}

export function hqViewFromRun(run: RunViewWire): HqView {
  const debtCents =
    run.finances.nonCreditLiabilitiesCents + run.finances.creditUsedCents;
  const monthlyRequiredCents =
    run.finances.monthlyObligations.totalRequiredCashCents;
  const emergencyTargetMonthsPpm = run.strategy.emergencyFundTargetMonthsPpm;

  return Object.freeze({
    cashCents: run.finances.cashCents,
    netWorthCents: run.finances.netWorthCents,
    debtCents,
    revolvingUsedCents: run.finances.creditUsedCents,
    revolvingLimitCents: run.finances.creditLimitCents,
    revolvingAvailableCents: Math.max(
      0,
      run.finances.creditLimitCents - run.finances.creditUsedCents,
    ),
    monthlyRequiredCents,
    annualLivingCostCents: run.finances.annualLivingCostCents,
    monthlyGrossSalaryCents:
      run.income.annualGrossSalaryCents === null
        ? null
        : annualToMonthlyCents(run.income.annualGrossSalaryCents),
    monthLabel: formatMonthLabel(run.currentMonth),
    shortMonthLabel: formatShortMonthLabel(run.currentMonth),
    monthNumber: monthIndex(run.startMonth, run.currentMonth),
    // This is net of liabilities and is the exact numerator the backend goal
    // projection used for progressPpm.
    goalCurrentCents: run.goal.currentCents,
    goalTargetCents: run.goal.targetCents,
    goalProgressPpm: run.goal.progressPpm,
    preparednessPpm: run.preparedness.scorePpm,
    preparednessBand: run.preparedness.band,
    riskPpm: run.risk.aggregateSeverityPpm,
    emergencyFundMonths: emergencyFundMonths(
      run.finances.cashCents,
      monthlyRequiredCents,
    ),
    emergencyTargetMonths:
      emergencyTargetMonthsPpm === undefined
        ? null
        : emergencyTargetMonthsPpm / 1_000_000,
    debtServiceRatioPpm: debtServiceRatioPpm(
      run.finances.monthlyObligations.termDebtMinimumsCents +
        run.finances.monthlyObligations.revolvingCreditMinimumCents,
      run.income.annualGrossSalaryCents,
    ),
    buckets: projectContributionBuckets(
      run.income.annualGrossSalaryCents,
      run.strategy,
      run.benefits?.retirementPlan.employerMatchTiers ?? null,
    ),
    hasPendingEvent: run.pendingInteraction.kind === "event",
    debtBadge: run.finances.creditUsedCents > 0 ? 1 : 0,
    isComplete: run.status === "completed",
  });
}
