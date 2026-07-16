import type { GameStateV2 } from "@/core/game-state-v2";
import type { PauseReasonV2 } from "@/core/time-controller-v2";
import type { CreateRunV2Request } from "@/server/api/contracts-v2";

import { projectFinancialGoal } from "../../core/financial-goals-v2";
import {
  calculateInvestableAssets as calculateCanonicalInvestableAssets,
  calculateNetWorth as calculateCanonicalNetWorth,
} from "../../core/game-state";
import {
  selectionForPreset,
  type PlayerPresetId,
  type StartingSelection,
} from "./onboarding-model";

export { PLAYER_PRESETS } from "./onboarding-model";
export type { PlayerPresetId } from "./onboarding-model";

export type BuildCreateRequestOptions = Readonly<{
  studentDebtDollars?: number;
  studentDebtPaymentDollars?: number;
  healthPlanId?: string | null;
  insuranceCoverageIds?: readonly string[];
  selection?: StartingSelection;
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

export function describeTimePauseV2(pause: PauseReasonV2): string {
  switch (pause.kind) {
    case "requested_duration":
      return `Requested ${pause.requestedMonths}-month advance completed.`;
    case "periodic_checkpoint":
      return `Checkpoint reached at ${pause.checkpointMonth}.`;
    case "event_response":
      return "Progress paused for a required event response.";
    case "policy_decision":
      return "Progress paused for a required life milestone decision.";
    case "financial_warning":
      return "Progress paused for a monthly cash-flow warning.";
    case "financial_independence":
      return "Financial independence reached.";
    case "retirement":
      return "Configured retirement age reached.";
    case "bankruptcy":
      return "Progress stopped after liquidity was exhausted.";
    case "explicit_user_stop":
      return "Time advance stopped by the player.";
    case "bounded_limit":
      return `Safe ${pause.maxMonths}-month processing limit reached.`;
  }
}

export function calculateNetWorth(state: GameStateV2): number {
  return calculateCanonicalNetWorth(state.finances);
}

export function calculateInvestableAssets(state: GameStateV2): number {
  return calculateCanonicalInvestableAssets(state.finances);
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
  const selection = options.selection ?? selectionForPreset(presetId);
  const studentDebtDollars = options.studentDebtDollars ?? 0;
  const studentDebtPaymentDollars =
    options.studentDebtPaymentDollars ?? 250;
  return {
    schemaVersion: 2,
    startMonth: "2026-07",
    birthMonth: selection.birthMonth,
    randomSeed: seed,
    catalogVersion: "us-2026.2",
    locationId: selection.locationId,
    careerId: selection.careerId,
    householdId: selection.householdId,
    benefitsPackageId: selection.benefitsPackageId,
    healthPlanId:
      options.healthPlanId === undefined
        ? selection.healthPlanId
        : options.healthPlanId,
    retirementPlanId: selection.retirementPlanId,
    insuranceCoverageIds: [
      ...(options.insuranceCoverageIds ?? ["insurance.renters"]),
    ],
    scenarioId: selection.scenarioId,
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
