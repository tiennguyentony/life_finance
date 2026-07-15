import type { GameStateV2 } from "@/core/game-state-v2";
import type { CreateRunV2Request } from "@/server/api/contracts-v2";

export const PLAYER_PRESETS = {
  software: {
    label: "Software developer · Seattle",
    locationId: "location.seattle",
    careerId: "career.software",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    salaryDollars: 120_000,
  },
  nurse: {
    label: "Registered nurse · Austin",
    locationId: "location.austin",
    careerId: "career.nurse",
    benefitsPackageId: "benefits.essential_worker",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_essential",
    salaryDollars: 85_000,
  },
  teacher: {
    label: "Teacher · Chicago",
    locationId: "location.chicago",
    careerId: "career.teacher",
    benefitsPackageId: "benefits.public_service",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.403b_public",
    salaryDollars: 70_000,
  },
} as const;

export type PlayerPresetId = keyof typeof PLAYER_PRESETS;

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

export function buildCreateRequest(
  presetId: PlayerPresetId,
  salaryDollars: number,
  cashDollars: number,
  seed: string,
): CreateRunV2Request {
  const preset = PLAYER_PRESETS[presetId];
  return {
    schemaVersion: 2,
    startMonth: "2026-07",
    birthMonth: "1995-01",
    randomSeed: seed,
    catalogVersion: "us-2026.2",
    locationId: preset.locationId,
    careerId: preset.careerId,
    householdId: "household.single",
    benefitsPackageId: preset.benefitsPackageId,
    healthPlanId: preset.healthPlanId,
    retirementPlanId: preset.retirementPlanId,
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId: "scenario.fresh_start",
    annualGrossSalaryCents: dollarsToCents(salaryDollars),
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
      termDebts: [],
      revolvingCreditLimitCents: 1_000_000,
      revolvingCreditUsedCents: 0,
    },
    wellbeing: { burnoutPpm: 100_000, happinessPpm: 800_000 },
  };
}
