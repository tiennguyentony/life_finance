import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents, type RatePpm } from "./domain/money";
import {
  calculateInvestableAssets,
  type FinancialSnapshot,
} from "./game-state";

export { calculateInvestableAssets as calculateGoalInvestableAssets } from "./game-state";

export const FINANCIAL_GOAL_VERSION = "financial-goal-v1" as const;
export const DEFAULT_SAFE_WITHDRAWAL_RATE_PPM = 40_000 as RatePpm;

export type FinancialGoalV1 = Readonly<{
  version: typeof FINANCIAL_GOAL_VERSION;
  desiredAnnualSpendingCents: MoneyCents;
  safeWithdrawalRatePpm: RatePpm;
  targetAgeYears: number;
  source: "player_selected" | "current_lifestyle_default";
}>;

export type FinancialGoalProjection = Readonly<{
  goal: FinancialGoalV1;
  investableAssetsCents: MoneyCents;
  targetCents: MoneyCents;
  progressPpm: RatePpm;
  remainingCents: MoneyCents;
}>;

export function defaultFinancialGoal(
  annualLivingCostCents: MoneyCents,
): FinancialGoalV1 {
  return Object.freeze({
    version: FINANCIAL_GOAL_VERSION,
    desiredAnnualSpendingCents: annualLivingCostCents,
    safeWithdrawalRatePpm: DEFAULT_SAFE_WITHDRAWAL_RATE_PPM,
    targetAgeYears: 65,
    source: "current_lifestyle_default",
  });
}

export function validateFinancialGoal(goal: FinancialGoalV1): void {
  if (
    goal.version !== FINANCIAL_GOAL_VERSION ||
    !Number.isSafeInteger(goal.desiredAnnualSpendingCents) ||
    goal.desiredAnnualSpendingCents <= 0
  ) {
    throw new RangeError("FI goal requires positive annual spending in cents");
  }
  if (
    !Number.isSafeInteger(goal.safeWithdrawalRatePpm) ||
    goal.safeWithdrawalRatePpm < 20_000 ||
    goal.safeWithdrawalRatePpm > 60_000
  ) {
    throw new RangeError("safe withdrawal rate must be between 2% and 6%");
  }
  if (
    !Number.isSafeInteger(goal.targetAgeYears) ||
    goal.targetAgeYears < 18 ||
    goal.targetAgeYears > 80
  ) {
    throw new RangeError("FI target age must be between 18 and 80");
  }
  if (
    goal.source !== "player_selected" &&
    goal.source !== "current_lifestyle_default"
  ) {
    throw new RangeError("FI goal source is unsupported");
  }
}

export function financialGoalTargetCents(goal: FinancialGoalV1): MoneyCents {
  validateFinancialGoal(goal);
  const numerator =
    BigInt(goal.desiredAnnualSpendingCents) * BigInt(1_000_000);
  const denominator = BigInt(goal.safeWithdrawalRatePpm);
  return moneyCents(
    safeBigIntToNumber(
      (numerator + denominator - BigInt(1)) / denominator,
      "financial independence goal",
    ),
  );
}

export function projectFinancialGoal(
  finances: FinancialSnapshot,
  configuredGoal?: FinancialGoalV1,
): FinancialGoalProjection {
  const goal = configuredGoal ?? defaultFinancialGoal(finances.annualLivingCostCents);
  const targetCents = financialGoalTargetCents(goal);
  const investableAssetsCents = calculateInvestableAssets(finances);
  const progressPpm = Math.min(
    1_000_000,
    Number(
      (BigInt(investableAssetsCents) * BigInt(1_000_000)) /
        BigInt(targetCents),
    ),
  ) as RatePpm;
  return Object.freeze({
    goal,
    investableAssetsCents,
    targetCents,
    progressPpm,
    remainingCents: moneyCents(
      Math.max(0, targetCents - investableAssetsCents),
    ),
  });
}
