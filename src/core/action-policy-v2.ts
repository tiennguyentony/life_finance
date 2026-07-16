import { ratePpm, type RatePpm } from "./domain/money";

export const ACTION_POLICY_V1_VERSION = "1.0.0" as const;

export type ActionPolicyVersionV2 = typeof ACTION_POLICY_V1_VERSION;

export type ActionPolicyV2 = Readonly<{
  version: ActionPolicyVersionV2;
  taxableLiquidationCostRatePpm: RatePpm;
  retirementWithholdingRatePpm: RatePpm;
  earlyRetirementPenaltyRatePpm: RatePpm;
  earlyRetirementAgeMonths: number;
  homePurchaseClosingCostRatePpm: RatePpm;
  homeSaleCostRatePpm: RatePpm;
  homeRefinanceCostRatePpm: RatePpm;
  newMortgageSpreadPpm: RatePpm;
}>;

export type ResolvedDetailedActionPolicyV2 = Readonly<{
  actionPolicyVersion: ActionPolicyVersionV2 | null;
  taxableLiquidationCostRatePpm: RatePpm;
  retirementWithholdingRatePpm: RatePpm;
  earlyRetirementPenaltyRatePpm: RatePpm;
  earlyRetirementAgeMonths: number;
  homePurchaseClosingCostRatePpm: RatePpm;
  homeSaleCostRatePpm: RatePpm;
  homeRefinanceCostRatePpm: RatePpm;
  newMortgageSpreadPpm: RatePpm;
}>;

const ACTION_POLICY_V1 = Object.freeze({
  version: ACTION_POLICY_V1_VERSION,
  taxableLiquidationCostRatePpm: ratePpm(10_000),
  retirementWithholdingRatePpm: ratePpm(200_000),
  earlyRetirementPenaltyRatePpm: ratePpm(100_000),
  earlyRetirementAgeMonths: 714,
  homePurchaseClosingCostRatePpm: ratePpm(30_000),
  homeSaleCostRatePpm: ratePpm(60_000),
  homeRefinanceCostRatePpm: ratePpm(20_000),
  newMortgageSpreadPpm: ratePpm(20_000),
}) satisfies ActionPolicyV2;

const ACTION_POLICY_REGISTRY_V2 = Object.freeze({
  [ACTION_POLICY_V1_VERSION]: ACTION_POLICY_V1,
}) satisfies Readonly<Record<ActionPolicyVersionV2, ActionPolicyV2>>;

export function actionPolicyForVersionV2(
  version: ActionPolicyVersionV2,
): ActionPolicyV2 {
  const policy = ACTION_POLICY_REGISTRY_V2[version];
  if (policy === undefined) {
    throw new RangeError("action policy version is unsupported");
  }
  return policy;
}

/**
 * An absent version is the frozen historical branch. Historical taxable-sale
 * commands owned their persisted sale-cost rate, while all other rates were
 * the constants now frozen as policy 1.0.0.
 */
export function resolveDetailedActionPolicyV2(
  version: ActionPolicyVersionV2 | undefined,
  persistedLiquidationCostRatePpm?: RatePpm,
): ResolvedDetailedActionPolicyV2 {
  if (version === undefined) {
    return Object.freeze({
      actionPolicyVersion: null,
      taxableLiquidationCostRatePpm:
        persistedLiquidationCostRatePpm ??
        ACTION_POLICY_V1.taxableLiquidationCostRatePpm,
      retirementWithholdingRatePpm:
        ACTION_POLICY_V1.retirementWithholdingRatePpm,
      earlyRetirementPenaltyRatePpm:
        ACTION_POLICY_V1.earlyRetirementPenaltyRatePpm,
      earlyRetirementAgeMonths: ACTION_POLICY_V1.earlyRetirementAgeMonths,
      homePurchaseClosingCostRatePpm:
        ACTION_POLICY_V1.homePurchaseClosingCostRatePpm,
      homeSaleCostRatePpm: ACTION_POLICY_V1.homeSaleCostRatePpm,
      homeRefinanceCostRatePpm:
        ACTION_POLICY_V1.homeRefinanceCostRatePpm,
      newMortgageSpreadPpm: ACTION_POLICY_V1.newMortgageSpreadPpm,
    });
  }

  const policy = actionPolicyForVersionV2(version);
  if (
    persistedLiquidationCostRatePpm !== undefined &&
    persistedLiquidationCostRatePpm !== policy.taxableLiquidationCostRatePpm
  ) {
    throw new RangeError(
      "persisted liquidation cost must equal the versioned action policy",
    );
  }
  return Object.freeze({
    actionPolicyVersion: policy.version,
    taxableLiquidationCostRatePpm: policy.taxableLiquidationCostRatePpm,
    retirementWithholdingRatePpm: policy.retirementWithholdingRatePpm,
    earlyRetirementPenaltyRatePpm: policy.earlyRetirementPenaltyRatePpm,
    earlyRetirementAgeMonths: policy.earlyRetirementAgeMonths,
    homePurchaseClosingCostRatePpm: policy.homePurchaseClosingCostRatePpm,
    homeSaleCostRatePpm: policy.homeSaleCostRatePpm,
    homeRefinanceCostRatePpm: policy.homeRefinanceCostRatePpm,
    newMortgageSpreadPpm: policy.newMortgageSpreadPpm,
  });
}
