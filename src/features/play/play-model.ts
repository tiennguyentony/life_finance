import type { GameStateV2 } from "@/core/game-state-v2";
import type { CreateRunV2Request } from "@/server/api/contracts-v2";

import { projectFinancialGoal } from "../../core/financial-goals-v2";

export const PLAYER_PRESETS = {
  software: {
    label: "Software developer · Seattle",
    locationId: "location.seattle",
    careerId: "career.software",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    salaryDollars: 120_000,
    defaultCashDollars: 25_000,
    householdId: "household.single",
    scenarioId: "scenario.fresh_start",
  },
  nurse: {
    label: "Registered nurse · Austin",
    locationId: "location.austin",
    careerId: "career.nurse",
    benefitsPackageId: "benefits.essential_worker",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_essential",
    salaryDollars: 85_000,
    defaultCashDollars: 20_000,
    householdId: "household.single",
    scenarioId: "scenario.fresh_start",
  },
  teacher: {
    label: "Teacher · Chicago",
    locationId: "location.chicago",
    careerId: "career.teacher",
    benefitsPackageId: "benefits.public_service",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.403b_public",
    salaryDollars: 70_000,
    defaultCashDollars: 15_000,
    householdId: "household.single",
    scenarioId: "scenario.fresh_start",
  },
  established: {
    label: "Established software household · Austin",
    locationId: "location.austin",
    careerId: "career.software",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    salaryDollars: 125_000,
    defaultCashDollars: 75_000,
    householdId: "household.married",
    scenarioId: "scenario.established_household",
  },
} as const;

export type PlayerPresetId = keyof typeof PLAYER_PRESETS;

export type BuildCreateRequestOptions = Readonly<{
  studentDebtDollars?: number;
  studentDebtPaymentDollars?: number;
  healthPlanId?: string | null;
  insuranceCoverageIds?: readonly string[];
  financialGoal?: Readonly<{
    desiredAnnualSpendingDollars: number;
    safeWithdrawalRatePercent: number;
    targetAgeYears: number;
  }>;
}>;

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function percentToPpm(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(percent * 10_000);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function calculateNetWorth(state: GameStateV2): number {
  const finances = state.finances;
  return (
    finances.cashCents +
    finances.taxableInvestmentsCents +
    finances.retirementCents +
    finances.homeValueCents +
    finances.otherInvestableAssetsCents +
    finances.otherAssetsCents -
    finances.nonCreditLiabilitiesCents -
    finances.creditUsedCents
  );
}

export function calculateInvestableAssets(state: GameStateV2): number {
  return (
    state.finances.cashCents +
    state.finances.taxableInvestmentsCents +
    state.finances.retirementCents +
    state.finances.otherInvestableAssetsCents
  );
}

export function calculateFinancialIndependence(state: GameStateV2): Readonly<{
  investableAssetsCents: number;
  targetCents: number;
  progressPpm: number;
}> {
  const projection = projectFinancialGoal(
    state.finances,
    state.gameplay.financialGoal,
  );
  return {
    investableAssetsCents: projection.investableAssetsCents,
    targetCents: projection.targetCents,
    progressPpm: projection.progressPpm,
  };
}

export function calculateAgeYears(birthMonth: string, currentMonth: string): number {
  const [birthYear, birthMonthNumber] = birthMonth.split("-").map(Number);
  const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
  return (
    currentYear! -
    birthYear! -
    (currentMonthNumber! < birthMonthNumber! ? 1 : 0)
  );
}

export function buildCreateRequest(
  presetId: PlayerPresetId,
  salaryDollars: number,
  cashDollars: number,
  seed: string,
  options: BuildCreateRequestOptions = {},
): CreateRunV2Request {
  const preset = PLAYER_PRESETS[presetId];
  const studentDebtDollars = options.studentDebtDollars ?? 0;
  const studentDebtPaymentDollars =
    options.studentDebtPaymentDollars ?? 250;
  return {
    schemaVersion: 2,
    startMonth: "2026-07",
    birthMonth: "1995-01",
    randomSeed: seed,
    catalogVersion: "us-2026.2",
    locationId: preset.locationId,
    careerId: preset.careerId,
    householdId: preset.householdId,
    benefitsPackageId: preset.benefitsPackageId,
    healthPlanId:
      options.healthPlanId === undefined
        ? preset.healthPlanId
        : options.healthPlanId,
    retirementPlanId: preset.retirementPlanId,
    insuranceCoverageIds: [
      ...(options.insuranceCoverageIds ?? ["insurance.renters"]),
    ],
    scenarioId: preset.scenarioId,
    annualGrossSalaryCents: dollarsToCents(salaryDollars),
    ...(options.financialGoal
      ? {
          financialGoal: {
            version: "financial-goal-v1",
            desiredAnnualSpendingCents: dollarsToCents(
              options.financialGoal.desiredAnnualSpendingDollars,
            ),
            safeWithdrawalRatePpm: percentToPpm(
              options.financialGoal.safeWithdrawalRatePercent,
            ),
            targetAgeYears: options.financialGoal.targetAgeYears,
            source: "player_selected",
          },
        }
      : {}),
    finances: {
      cashCents: dollarsToCents(cashDollars),
      taxableBroadIndexCents: 0,
      taxableSectorCents: 0,
      taxableSpeculativeCents: 0,
      retirement401kCents: 0,
      retirementIraCents: 0,
      hsaCents: 0,
      homeValueCents: 0,
      otherAssetsCents: 0,
      termDebts:
        studentDebtDollars > 0
          ? [
              {
                id: "debt.student-loan",
                kind: "student_loan",
                principalCents: dollarsToCents(studentDebtDollars),
                annualInterestRatePpm: 55_000,
                minimumPaymentCents: Math.min(
                  dollarsToCents(studentDebtDollars),
                  dollarsToCents(studentDebtPaymentDollars),
                ),
                remainingTermMonths: 120,
              },
            ]
          : [],
      revolvingCreditLimitCents: 1_000_000,
      revolvingCreditUsedCents: 0,
    },
    wellbeing: { burnoutPpm: 100_000, happinessPpm: 800_000 },
  };
}
