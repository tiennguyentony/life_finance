import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  subtractMoney,
  type MoneyCents,
} from "./domain/money";
import type { GameStateV2, GameplayStateV2 } from "./game-state-v2";
import { activeInsuranceCoveragesV2 } from "./insurance-selection-v2";

export type HealthClaimSettlement = Readonly<{
  grossBillCents: MoneyCents;
  covered: boolean;
  deductibleAppliedCents: MoneyCents;
  coinsuranceAppliedCents: MoneyCents;
  playerResponsibilityCents: MoneyCents;
  insurerResponsibilityCents: MoneyCents;
  nextInsurance: GameplayStateV2["insurance"];
}>;

export type CoverageClaimSettlement = Readonly<{
  coverageId: string;
  grossLossCents: MoneyCents;
  eligible: boolean;
  deductibleAppliedCents: MoneyCents;
  insurerResponsibilityCents: MoneyCents;
  playerResponsibilityCents: MoneyCents;
  nextInsurance: GameplayStateV2["insurance"];
}>;

export class InsuranceV2Error extends Error {
  readonly code:
    | "INVALID_CLAIM"
    | "LEGACY_POLICY_UNKNOWN"
    | "UNKNOWN_COVERAGE"
    | "INSURANCE_STATE_CORRUPT";

  constructor(code: InsuranceV2Error["code"], message: string) {
    super(message);
    this.name = "InsuranceV2Error";
    this.code = code;
  }
}

function assertClaimAmount(value: MoneyCents): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InsuranceV2Error(
      "INVALID_CLAIM",
      "claim amount must be positive safe integer cents",
    );
  }
}

export function adjudicateHealthClaim(
  state: GameStateV2,
  grossBillCents: MoneyCents,
  covered: boolean,
): HealthClaimSettlement {
  assertClaimAmount(grossBillCents);
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot || state.gameplay.insurance.policyYear === null) {
    throw new InsuranceV2Error(
      "LEGACY_POLICY_UNKNOWN",
      "health claim requires a resolved native benefit policy",
    );
  }
  if (!covered) {
    return Object.freeze({
      grossBillCents,
      covered,
      deductibleAppliedCents: moneyCents(0),
      coinsuranceAppliedCents: moneyCents(0),
      playerResponsibilityCents: grossBillCents,
      insurerResponsibilityCents: moneyCents(0),
      nextInsurance: state.gameplay.insurance,
    });
  }
  const family = snapshot.selected.household.healthCoverageTier === "family";
  const plan = snapshot.selected.healthPlan;
  if (plan === null) {
    return Object.freeze({
      grossBillCents,
      covered: false,
      deductibleAppliedCents: moneyCents(0),
      coinsuranceAppliedCents: moneyCents(0),
      playerResponsibilityCents: grossBillCents,
      insurerResponsibilityCents: moneyCents(0),
      nextInsurance: state.gameplay.insurance,
    });
  }
  const deductible = family
    ? plan.annualDeductibleFamilyCents
    : plan.annualDeductibleSelfCents;
  const outOfPocketMaximum = family
    ? plan.annualOutOfPocketMaximumFamilyCents
    : plan.annualOutOfPocketMaximumSelfCents;
  const paidDeductible = state.gameplay.insurance.healthDeductiblePaidCents;
  const paidOutOfPocket = state.gameplay.insurance.healthOutOfPocketPaidCents;
  if (paidDeductible > deductible || paidOutOfPocket > outOfPocketMaximum) {
    throw new InsuranceV2Error(
      "INSURANCE_STATE_CORRUPT",
      "health accumulators exceed the selected plan bounds",
    );
  }
  const remainingDeductible = subtractMoney(deductible, paidDeductible);
  const nominalDeductible = moneyCents(
    Math.min(grossBillCents, remainingDeductible),
  );
  const afterDeductible = subtractMoney(grossBillCents, nominalDeductible);
  const nominalCoinsurance = multiplyMoneyByRate(
    afterDeductible,
    plan.coinsurancePpm,
  );
  const remainingOutOfPocket = subtractMoney(
    outOfPocketMaximum,
    paidOutOfPocket,
  );
  const playerResponsibility = moneyCents(
    Math.min(
      addMoney(nominalDeductible, nominalCoinsurance),
      remainingOutOfPocket,
    ),
  );
  const deductibleApplied = moneyCents(
    Math.min(nominalDeductible, playerResponsibility),
  );
  const coinsuranceApplied = subtractMoney(
    playerResponsibility,
    deductibleApplied,
  );
  const nextInsurance = Object.freeze({
    ...state.gameplay.insurance,
    healthDeductiblePaidCents: addMoney(
      paidDeductible,
      deductibleApplied,
    ),
    healthOutOfPocketPaidCents: addMoney(
      paidOutOfPocket,
      playerResponsibility,
    ),
  });
  return Object.freeze({
    grossBillCents,
    covered,
    deductibleAppliedCents: deductibleApplied,
    coinsuranceAppliedCents: coinsuranceApplied,
    playerResponsibilityCents: playerResponsibility,
    insurerResponsibilityCents: subtractMoney(
      grossBillCents,
      playerResponsibility,
    ),
    nextInsurance,
  });
}

export function adjudicateCoverageClaim(
  state: GameStateV2,
  coverageId: string,
  grossLossCents: MoneyCents,
  eligible: boolean,
): CoverageClaimSettlement {
  assertClaimAmount(grossLossCents);
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot) {
    throw new InsuranceV2Error(
      "LEGACY_POLICY_UNKNOWN",
      "coverage claim requires resolved native benefits",
    );
  }
  const coverage = activeInsuranceCoveragesV2(state).find(
    ({ id }) => id === coverageId,
  );
  const usageIndex = state.gameplay.insurance.coverageUsage.findIndex(
    (usage) => usage.coverageId === coverageId,
  );
  if (!coverage || usageIndex < 0) {
    throw new InsuranceV2Error(
      "UNKNOWN_COVERAGE",
      "claim must reference selected coverage",
    );
  }
  const usage = state.gameplay.insurance.coverageUsage[usageIndex]!;
  if (usage.usedCents > coverage.coverageLimitCents) {
    throw new InsuranceV2Error(
      "INSURANCE_STATE_CORRUPT",
      "coverage usage exceeds its policy limit",
    );
  }
  const deductibleApplied = eligible
    ? moneyCents(Math.min(grossLossCents, coverage.deductibleCents))
    : moneyCents(0);
  const eligibleLoss = eligible
    ? subtractMoney(grossLossCents, deductibleApplied)
    : moneyCents(0);
  const remainingCoverage = subtractMoney(
    coverage.coverageLimitCents,
    usage.usedCents,
  );
  const insurerResponsibility = moneyCents(
    Math.min(eligibleLoss, remainingCoverage),
  );
  const playerResponsibility = subtractMoney(
    grossLossCents,
    insurerResponsibility,
  );
  const coverageUsage = [...state.gameplay.insurance.coverageUsage];
  coverageUsage[usageIndex] = {
    coverageId,
    usedCents: addMoney(usage.usedCents, insurerResponsibility),
  };
  return Object.freeze({
    coverageId,
    grossLossCents,
    eligible,
    deductibleAppliedCents: deductibleApplied,
    insurerResponsibilityCents: insurerResponsibility,
    playerResponsibilityCents: playerResponsibility,
    nextInsurance: Object.freeze({
      ...state.gameplay.insurance,
      coverageUsage: Object.freeze(coverageUsage),
    }),
  });
}
