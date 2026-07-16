import { sha256Canonical } from "./canonical";
import { calculateTotalMinimumDebtPaymentV2 } from "./debt-service-v2";
import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  allocateMoney,
  moneyCents,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { monthsBetween, type SimulationMonth } from "./domain/month";
import { createInitialGameState, type MarketRegime } from "./game-state";
import {
  ENGINE_V2_VERSION,
  finalizeGameStateV2,
  GAME_STATE_V2_SCHEMA_VERSION,
  type DebtBreakdown,
  type GameStateV2,
} from "./game-state-v2";
import type { ResolvedScenario } from "./scenario-catalog";
import { emptyLifeMilestoneState } from "./life-milestones-v2";
import { emptyAiLearningMemory } from "./ai-learning-memory-v2";
import {
  defaultFinancialGoal,
  validateFinancialGoal,
  type FinancialGoalV1,
} from "./financial-goals-v2";
import { createInitialRuntimeBalanceStateV1 } from "./runtime-balance-state-v1";

export type NativeGameStateV2Input = Readonly<{
  runId: string;
  playerId: string;
  birthMonth: SimulationMonth;
  startMonth: SimulationMonth;
  randomSeed: string;
  resolvedScenario: ResolvedScenario;
  annualGrossSalaryCents: MoneyCents;
  financialGoal?: FinancialGoalV1;
  finances: Readonly<{
    cashCents: MoneyCents;
    taxableBroadIndexCents: MoneyCents;
    taxableSectorCents: MoneyCents;
    taxableSpeculativeCents: MoneyCents;
    retirement401kCents: MoneyCents;
    retirementIraCents: MoneyCents;
    hsaCents: MoneyCents;
    homeValueCents: MoneyCents;
    otherAssetsCents: MoneyCents;
    termDebts: DebtBreakdown["termDebts"];
    revolvingCreditLimitCents: MoneyCents;
    revolvingCreditUsedCents: MoneyCents;
  }>;
  wellbeing: Readonly<{
    burnoutPpm: RatePpm;
    happinessPpm: RatePpm;
  }>;
  marketRegime?: MarketRegime;
}>;

export class NativeGameStateV2Error extends Error {
  readonly code:
    | "CATALOG_CHECKSUM_MISMATCH"
    | "SALARY_OUT_OF_RANGE"
    | "STARTING_CASH_OUT_OF_RANGE"
    | "HSA_INELIGIBLE"
    | "SCENARIO_CONSTRAINT"
    | "INVALID_OPENING_DEBT"
    | "INVALID_FINANCIAL_GOAL";

  constructor(code: NativeGameStateV2Error["code"], message: string) {
    super(message);
    this.name = "NativeGameStateV2Error";
    this.code = code;
  }
}

function sumMoney(values: readonly MoneyCents[], label: string): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      values.reduce((total, value) => total + BigInt(value), BigInt(0)),
      label,
    ),
  );
}

function assertNativeInput(input: NativeGameStateV2Input): void {
  const { snapshot, snapshotChecksum } = input.resolvedScenario;
  if (input.financialGoal) {
    try {
      validateFinancialGoal(input.financialGoal);
    } catch (error) {
      throw new NativeGameStateV2Error(
        "INVALID_FINANCIAL_GOAL",
        error instanceof Error ? error.message : "financial goal is invalid",
      );
    }
    const startingAgeYears = Math.floor(
      monthsBetween(input.birthMonth, input.startMonth) / 12,
    );
    if (input.financialGoal.targetAgeYears <= startingAgeYears) {
      throw new NativeGameStateV2Error(
        "INVALID_FINANCIAL_GOAL",
        "FI target age must be later than the player's starting age",
      );
    }
  }
  if (sha256Canonical(snapshot) !== snapshotChecksum) {
    throw new NativeGameStateV2Error(
      "CATALOG_CHECKSUM_MISMATCH",
      "resolved scenario checksum does not match its immutable snapshot",
    );
  }
  if (
    input.annualGrossSalaryCents < snapshot.derived.annualSalaryMinimumCents ||
    input.annualGrossSalaryCents > snapshot.derived.annualSalaryMaximumCents
  ) {
    throw new NativeGameStateV2Error(
      "SALARY_OUT_OF_RANGE",
      "starting salary must remain inside the resolved career and location range",
    );
  }
  if (
    input.finances.cashCents < snapshot.selected.scenario.minimumStartingCashCents ||
    input.finances.cashCents > snapshot.selected.scenario.maximumStartingCashCents
  ) {
    throw new NativeGameStateV2Error(
      "STARTING_CASH_OUT_OF_RANGE",
      "starting cash must remain inside the selected scenario bounds",
    );
  }
  if (input.finances.hsaCents > 0 && snapshot.selected.healthPlan?.hsaEligible !== true) {
    throw new NativeGameStateV2Error(
      "HSA_INELIGIBLE",
      "opening HSA balance requires an HSA-eligible health plan",
    );
  }
  if (
    input.finances.homeValueCents > 0 &&
    !snapshot.selected.scenario.allowsHomeOwnership
  ) {
    throw new NativeGameStateV2Error(
      "SCENARIO_CONSTRAINT",
      "selected scenario does not permit opening home ownership",
    );
  }
  if (
    input.finances.termDebts.length > 0 &&
    !snapshot.selected.scenario.allowsStartingTermDebt
  ) {
    throw new NativeGameStateV2Error(
      "SCENARIO_CONSTRAINT",
      "selected scenario does not permit opening term debt",
    );
  }
  if (
    input.finances.termDebts.some(
      (debt) =>
        debt.principalCents <= 0 ||
        debt.minimumPaymentCents <= 0 ||
        debt.remainingTermMonths <= 0 ||
        (debt.kind === "mortgage" && input.finances.homeValueCents <= 0),
    )
  ) {
    throw new NativeGameStateV2Error(
      "INVALID_OPENING_DEBT",
      "opening debts require positive principal, payment, term, and mortgage collateral",
    );
  }
}

export function createNativeGameStateV2(
  input: NativeGameStateV2Input,
): GameStateV2 {
  assertNativeInput(input);
  const { snapshot, snapshotChecksum } = input.resolvedScenario;
  const selectedInsurancePremiums = snapshot.selected.insuranceCoverages.map(
    ({ monthlyPremiumCents }) => monthlyPremiumCents,
  );
  const monthlyLivingCost = allocateMoney(
    snapshot.derived.annualLivingCostCents,
    1,
    12,
  );
  const minimumDebtPayments = calculateTotalMinimumDebtPaymentV2(
    input.finances.termDebts,
  );
  const monthlyInsurancePremiums = sumMoney(
    selectedInsurancePremiums,
    "opening insurance premiums",
  );
  const requiredObligationsCents = addMoney(
    addMoney(monthlyLivingCost, snapshot.derived.monthlyHealthPremiumCents),
    addMoney(minimumDebtPayments, monthlyInsurancePremiums),
  );
  const taxableInvestmentsCents = sumMoney(
    [
      input.finances.taxableBroadIndexCents,
      input.finances.taxableSectorCents,
      input.finances.taxableSpeculativeCents,
    ],
    "opening taxable portfolio",
  );
  const retirementCents = sumMoney(
    [input.finances.retirement401kCents, input.finances.retirementIraCents],
    "opening retirement portfolio",
  );
  const nonCreditLiabilitiesCents = sumMoney(
    input.finances.termDebts.map(({ principalCents }) => principalCents),
    "opening term debt principal",
  );

  const base = createInitialGameState({
    runId: input.runId,
    startMonth: input.startMonth,
    randomSeed: input.randomSeed,
    player: {
      playerId: input.playerId,
      birthMonth: input.birthMonth,
      locationId: snapshot.selected.location.id,
      careerTrackId: snapshot.selected.career.id,
      filingStatus: snapshot.derived.filingStatus,
    },
    finances: {
      cashCents: input.finances.cashCents,
      taxableInvestmentsCents,
      retirementCents,
      homeValueCents: input.finances.homeValueCents,
      otherInvestableAssetsCents: input.finances.hsaCents,
      otherAssetsCents: input.finances.otherAssetsCents,
      nonCreditLiabilitiesCents,
      creditLimitCents: input.finances.revolvingCreditLimitCents,
      creditUsedCents: input.finances.revolvingCreditUsedCents,
      annualLivingCostCents: snapshot.derived.annualLivingCostCents,
      requiredObligationsCents,
    },
    wellbeing: input.wellbeing,
    ...(input.marketRegime ? { marketRegime: input.marketRegime } : {}),
  });

  return finalizeGameStateV2({
    ...base,
    schemaVersion: GAME_STATE_V2_SCHEMA_VERSION,
    engineVersion: ENGINE_V2_VERSION,
    migration: null,
    gameplay: {
      runtimeBalance: createInitialRuntimeBalanceStateV1(),
      aiLearningMemory: emptyAiLearningMemory(),
      lifeMilestones: emptyLifeMilestoneState(),
      financialGoal:
        input.financialGoal ??
        defaultFinancialGoal(snapshot.derived.annualLivingCostCents),
      catalogs: {
        location: {
          id: snapshot.selected.location.id,
          version: snapshot.catalog.version,
        },
        career: {
          id: snapshot.selected.career.id,
          version: snapshot.catalog.version,
        },
        household: {
          id: snapshot.selected.household.id,
          version: snapshot.catalog.version,
        },
        benefits: {
          id: snapshot.selected.benefitsPackage.id,
          version: snapshot.catalog.version,
        },
        scenario: {
          id: snapshot.selected.scenario.id,
          version: snapshot.catalog.version,
        },
      },
      catalogSnapshot: snapshot,
      catalogSnapshotChecksum: snapshotChecksum,
      employment: {
        status: "employed",
        annualGrossSalaryCents: input.annualGrossSalaryCents,
        careerId: snapshot.selected.career.id,
        sectorId: snapshot.selected.sector.id,
      },
      portfolio: {
        taxableBroadIndexCents: input.finances.taxableBroadIndexCents,
        taxableSectorCents: input.finances.taxableSectorCents,
        taxableSpeculativeCents: input.finances.taxableSpeculativeCents,
        taxableLegacyUnclassifiedCents: moneyCents(0),
        retirement401kCents: input.finances.retirement401kCents,
        retirementIraCents: input.finances.retirementIraCents,
        retirementLegacyUnclassifiedCents: moneyCents(0),
        hsaCents: input.finances.hsaCents,
        otherInvestableLegacyUnclassifiedCents: moneyCents(0),
      },
      debts: {
        termDebts: input.finances.termDebts,
        legacyUnclassifiedPrincipalCents: moneyCents(0),
        revolvingCreditLimitCents: input.finances.revolvingCreditLimitCents,
        revolvingCreditUsedCents: input.finances.revolvingCreditUsedCents,
      },
      benefits: {
        status: "selected",
        healthPlanId: snapshot.selected.healthPlan?.id ?? null,
        hsaEligible: snapshot.selected.healthPlan?.hsaEligible ?? false,
        employerRetirementPlanId: snapshot.selected.retirementPlan.id,
        insuranceCoverageIds: snapshot.selected.insuranceCoverages.map(
          ({ id }) => id,
        ),
      },
      contributions: {
        policyYear: snapshot.selected.benefitPolicy.policyYear,
        employee401kCents: moneyCents(0),
        employer401kCents: moneyCents(0),
        iraCents: moneyCents(0),
        hsaCents: moneyCents(0),
      },
      insurance: {
        policyYear: snapshot.selected.benefitPolicy.policyYear,
        healthDeductiblePaidCents: moneyCents(0),
        healthOutOfPocketPaidCents: moneyCents(0),
        coverageUsage: snapshot.selected.insuranceCoverages.map(({ id }) => ({
          coverageId: id,
          usedCents: moneyCents(0),
        })),
      },
      market: {
        modelVersion: "regime-v1",
        monthsInRegime: 0,
        cumulativePriceIndexPpm: 1_000_000,
      },
      recurringStrategy: {
        effectiveMonth: input.startMonth,
        preTax401kSalaryRatePpm: 0 as RatePpm,
        preTaxHsaSalaryRatePpm: 0 as RatePpm,
        afterTaxBroadIndexRatePpm: 0 as RatePpm,
        afterTaxSectorRatePpm: 0 as RatePpm,
        afterTaxSpeculativeRatePpm: 0 as RatePpm,
        afterTaxIraRatePpm: 0 as RatePpm,
        afterTaxExtraDebtRatePpm: 0 as RatePpm,
      },
      exposure: { current: null, history: [] },
      eventLifecycle: {
        pending: null,
        history: [],
        activeStoryIds: [],
        macroStories: [],
        cooldowns: [],
      },
      careerDevelopment: { pending: [], history: [] },
    },
  });
}
