import { moneyCents } from "@/core/domain/money";
import {
  planRevolvingCreditMonthV2,
  REVOLVING_CREDIT_POLICY_V2,
} from "@/core/revolving-credit-v2";
import { UPSKILL_PROGRAMS, type UpskillProgram } from "@/data/upskill-programs";

/**
 * Money HQ teaches with numbers, and the screens claim those numbers are
 * ledger-backed. Everything here is therefore derived from wire state and the
 * engine's own policy constants — never from illustrative design values. When a
 * figure cannot be derived it is returned as null so the screen can omit the
 * panel rather than invent a total. Contribution buckets are explicitly
 * rendered as rate illustrations: their real after-tax base does not exist
 * until payroll, bills, and safety retention have run for the month.
 */

const MONTHS_PER_YEAR = 12;
const PPM = 1_000_000;

/** Stops a pathological amortisation loop if policy ever allows non-payoff. */
const MAX_PAYOFF_MONTHS = 600;

export function annualToMonthlyCents(annualCents: number): number {
  return Math.round(annualCents / MONTHS_PER_YEAR);
}

export function ppmOfCents(cents: number, ratePpm: number): number {
  return Math.round((cents * ratePpm) / PPM);
}

export type PayoffProjection = Readonly<{
  months: number;
  totalInterestCents: number;
  /** True when the balance never clears inside the guard rail. */
  truncated: boolean;
}>;

/**
 * Amortises a revolving balance using the engine's own monthly plan so the
 * "payoff race" matches what processing a month will actually do. Extra payment
 * is applied on top of the scheduled minimum.
 */
export function projectRevolvingPayoff(
  balanceCents: number,
  extraMonthlyPaymentCents: number,
): PayoffProjection | null {
  if (!Number.isFinite(balanceCents) || balanceCents <= 0) return null;
  if (extraMonthlyPaymentCents < 0) return null;

  let balance = Math.round(balanceCents);
  let totalInterest = 0;
  let months = 0;

  while (balance > 0 && months < MAX_PAYOFF_MONTHS) {
    const plan = planRevolvingCreditMonthV2(moneyCents(balance));
    const payment = plan.scheduledPaymentCents + extraMonthlyPaymentCents;
    const balanceWithInterest = balance + plan.interestCents;

    // A payment that cannot cover the interest never retires the principal.
    if (payment <= plan.interestCents) {
      return { months: MAX_PAYOFF_MONTHS, totalInterestCents: totalInterest, truncated: true };
    }

    totalInterest += plan.interestCents;
    balance = Math.max(0, balanceWithInterest - payment);
    months += 1;
  }

  return {
    months,
    totalInterestCents: totalInterest,
    truncated: balance > 0,
  };
}

export function revolvingAprPercent(): number {
  return REVOLVING_CREDIT_POLICY_V2.annualInterestRatePpm / 10_000;
}

/** This month's interest and scheduled minimum, straight from the policy. */
export function revolvingMonthAhead(
  balanceCents: number,
): Readonly<{ interestCents: number; minimumPaymentCents: number }> {
  if (balanceCents <= 0) return { interestCents: 0, minimumPaymentCents: 0 };
  const plan = planRevolvingCreditMonthV2(moneyCents(Math.round(balanceCents)));
  return {
    interestCents: plan.interestCents,
    minimumPaymentCents: plan.scheduledPaymentCents,
  };
}

/**
 * Required debt payments as a share of gross monthly income. Returns null with
 * no salary, because a ratio against zero income is not meaningful.
 */
export function debtServiceRatioPpm(
  monthlyDebtPaymentCents: number,
  annualGrossSalaryCents: number | null,
): number | null {
  if (annualGrossSalaryCents === null || annualGrossSalaryCents <= 0) return null;
  const monthlyGross = annualGrossSalaryCents / MONTHS_PER_YEAR;
  if (monthlyGross <= 0) return null;
  return Math.round((monthlyDebtPaymentCents / monthlyGross) * PPM);
}

export type CareerProgramProjection = Readonly<{
  program: UpskillProgram;
  /** Months of the raise needed to repay the upfront cost. */
  paybackMonths: number;
  /** Raise sustained across a ten-year horizon. */
  tenYearUpsideCents: number;
}>;

const CAREER_UPSIDE_YEARS = 10;

export function projectCareerPrograms(): readonly CareerProgramProjection[] {
  return UPSKILL_PROGRAMS.map((program) => {
    const monthlyRaise = program.annualSalaryIncreaseCents / MONTHS_PER_YEAR;
    return Object.freeze({
      program,
      paybackMonths:
        monthlyRaise > 0 ? Math.ceil(program.costCents / monthlyRaise) : 0,
      tenYearUpsideCents: program.annualSalaryIncreaseCents * CAREER_UPSIDE_YEARS,
    });
  });
}

export type ContributionBuckets = Readonly<{
  /** Locked until retirement age: 401(k) + employer match + HSA + IRA. */
  lockedMonthlyCents: number;
  preTax401kMonthlyCents: number;
  employerMatchMonthlyCents: number;
  hsaMonthlyCents: number;
  iraMonthlyCents: number;
  /** Sellable any month. */
  taxableMonthlyCents: number;
  broadIndexMonthlyCents: number;
  sectorMonthlyCents: number;
  speculativeMonthlyCents: number;
  /** Extra payment beyond the revolving minimum. */
  extraDebtMonthlyCents: number;
}>;

export type StrategyRates = Readonly<{
  preTax401kSalaryRatePpm: number;
  preTaxHsaSalaryRatePpm: number;
  afterTaxBroadIndexRatePpm: number;
  afterTaxSectorRatePpm: number;
  afterTaxSpeculativeRatePpm: number;
  afterTaxIraRatePpm: number;
  afterTaxExtraDebtRatePpm: number;
}>;

export type EmployerMatchTier = Readonly<{
  employeeContributionRateUpToPpm: number;
  employerMatchRatePpm: number;
}>;

/**
 * Tiered employer match on a monthly salary basis. Mirrors
 * `calculateEmployerMatchV2`'s tier walk; annual contribution and addition
 * limits are enforced by the engine at processing time, so this is a monthly
 * projection rather than an authoritative contribution.
 */
export function projectEmployerMatchMonthlyCents(
  monthlySalaryCents: number,
  employeeRatePpm: number,
  tiers: readonly EmployerMatchTier[],
): number {
  if (monthlySalaryCents <= 0 || employeeRatePpm <= 0) return 0;
  let priorThresholdPpm = 0;
  let matched = 0;

  for (const tier of tiers) {
    const tierWidthPpm = tier.employeeContributionRateUpToPpm - priorThresholdPpm;
    if (tierWidthPpm > 0) {
      const employeeInTierPpm = Math.max(
        0,
        Math.min(tierWidthPpm, employeeRatePpm - priorThresholdPpm),
      );
      matched += ppmOfCents(
        ppmOfCents(monthlySalaryCents, employeeInTierPpm),
        tier.employerMatchRatePpm,
      );
    }
    priorThresholdPpm = tier.employeeContributionRateUpToPpm;
  }

  return matched;
}

export function projectContributionBuckets(
  annualGrossSalaryCents: number | null,
  strategy: StrategyRates,
  employerMatchTiers: readonly EmployerMatchTier[] | null,
): ContributionBuckets {
  const monthlySalary =
    annualGrossSalaryCents === null || annualGrossSalaryCents <= 0
      ? 0
      : annualToMonthlyCents(annualGrossSalaryCents);

  const preTax401k = ppmOfCents(monthlySalary, strategy.preTax401kSalaryRatePpm);
  const hsa = ppmOfCents(monthlySalary, strategy.preTaxHsaSalaryRatePpm);
  const ira = ppmOfCents(monthlySalary, strategy.afterTaxIraRatePpm);
  const broadIndex = ppmOfCents(monthlySalary, strategy.afterTaxBroadIndexRatePpm);
  const sector = ppmOfCents(monthlySalary, strategy.afterTaxSectorRatePpm);
  const speculative = ppmOfCents(monthlySalary, strategy.afterTaxSpeculativeRatePpm);
  const extraDebt = ppmOfCents(monthlySalary, strategy.afterTaxExtraDebtRatePpm);
  // Null tiers mean the run predates the catalog snapshot: report no match
  // rather than guessing a policy the engine may not apply.
  const employerMatch =
    employerMatchTiers === null
      ? 0
      : projectEmployerMatchMonthlyCents(
          monthlySalary,
          strategy.preTax401kSalaryRatePpm,
          employerMatchTiers,
        );

  return Object.freeze({
    lockedMonthlyCents: preTax401k + employerMatch + hsa + ira,
    preTax401kMonthlyCents: preTax401k,
    employerMatchMonthlyCents: employerMatch,
    hsaMonthlyCents: hsa,
    iraMonthlyCents: ira,
    taxableMonthlyCents: broadIndex + sector + speculative,
    broadIndexMonthlyCents: broadIndex,
    sectorMonthlyCents: sector,
    speculativeMonthlyCents: speculative,
    extraDebtMonthlyCents: extraDebt,
  });
}

/**
 * Months of required spending the current cash balance covers. Null when
 * required spending is zero, since dividing by it says nothing about safety.
 */
export function emergencyFundMonths(
  cashCents: number,
  monthlyRequiredSpendingCents: number,
): number | null {
  if (monthlyRequiredSpendingCents <= 0) return null;
  return cashCents / monthlyRequiredSpendingCents;
}

export function emergencyFundTargetCents(
  monthlyRequiredSpendingCents: number,
  targetMonths: number,
): number {
  return Math.round(monthlyRequiredSpendingCents * targetMonths);
}

/**
 * Worst modelled year under the health plan: the out-of-pocket maximum plus a
 * full year of premiums.
 */
export function worstCaseHealthYearCents(
  annualOutOfPocketMaximumCents: number,
  monthlyPremiumCents: number,
): number {
  return annualOutOfPocketMaximumCents + monthlyPremiumCents * MONTHS_PER_YEAR;
}
