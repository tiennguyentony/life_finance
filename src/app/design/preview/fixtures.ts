/**
 * Deterministic UI fixtures built with the real engine factories, so the
 * design preview shows honest state shapes without a database or tax service.
 * Opening balances go through createNativeGameStateV2 so every derived total
 * satisfies the engine's invariants; only display-only snapshots (exposure,
 * macro stories) are patched afterwards. Never imported by production
 * surfaces; the route 404s outside development.
 */

import { moneyCents, ratePpm } from "@/core/domain/money";
import { simulationMonth } from "@/core/domain/month";
import { queueScheduledPersonalEventV2 } from "@/core/event-lifecycle-v2";
import type { GameStateV2 } from "@/core/game-state-v2";
import { createNativeGameStateV2 } from "@/core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "@/core/scenario-catalog";
import { getEventTemplate } from "@/data/event-templates";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "@/data/scenario-catalog";
import type { MonthlyRecap } from "@/features/play/play-types";

/** A valid run with two years of savings shaped into its opening balances. */
function richBaseState(): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.design-preview",
    playerId: "player.design-preview",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "design-preview",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_842_000),
      taxableBroadIndexCents: moneyCents(3_264_000),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(1_918_000),
      retirementIraCents: moneyCents(300_000),
      hsaCents: moneyCents(84_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.student-loan",
          kind: "student_loan",
          principalCents: moneyCents(1_186_000),
          annualInterestRatePpm: ratePpm(55_000),
          minimumPaymentCents: moneyCents(25_000),
          remainingTermMonths: 96,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

/** Display-only extras: an exposure snapshot and one active macro story. */
function withDisplaySnapshots(state: GameStateV2): GameStateV2 {
  return {
    ...state,
    gameplay: {
      ...state.gameplay,
      exposure: {
        ...state.gameplay.exposure,
        current: {
          month: simulationMonth("2026-07"),
          scorePpm: ratePpm(1_450_000),
          emergencyFundMonthsPpm: ratePpm(3_400_000),
          debtToIncomePpm: ratePpm(99_000),
          revolvingDebtPpm: ratePpm(0),
          insuranceGapPpm: ratePpm(120_000),
          portfolioConcentrationPpm: ratePpm(180_000),
          jobInvestmentCorrelationPpm: ratePpm(140_000),
        },
      },
      eventLifecycle: {
        ...state.gameplay.eventLifecycle,
        macroStories: [
          {
            storyId: "story.design-preview.tech-boom",
            templateId: "macro.tech_boom",
            templateVersion: getEventTemplate("macro.tech_boom").version,
            parameters: {},
            startedMonth: simulationMonth("2026-06"),
            expiresMonth: simulationMonth("2026-12"),
            returnModifiersPpm: {
              equity: ratePpm(15_000),
              bonds: ratePpm(0),
              cash: ratePpm(0),
              housing: ratePpm(5_000),
            },
          },
        ],
      },
    },
  };
}

export function buildMidRunState(): GameStateV2 {
  return withDisplaySnapshots(richBaseState());
}

/** Mid-run state interrupted by a pending personal shock. */
export function buildEventState(): GameStateV2 {
  const template = getEventTemplate("personal.unexpected_repair");
  const parameterId = template.parameters[0]!.id;
  const queued = queueScheduledPersonalEventV2(richBaseState(), {
    proposal: {
      eventId: "evt.2026-07.personal.unexpected_repair",
      templateId: "personal.unexpected_repair",
      templateVersion: template.version,
      parameters: { [parameterId]: 240_000 },
    },
    template,
    targetedWeakness: "low_emergency_fund",
  });
  return withDisplaySnapshots(queued);
}

/** One processed month, shaped exactly like the API's monthly record. */
export function buildRecap(): MonthlyRecap {
  return {
    processedMonth: "2026-08",
    nextMonth: "2026-09",
    taxTraceId: "tax.design-preview.2026-08",
    grossIncomeCents: 1_000_000,
    totalTaxCents: 218_000,
    afterTaxCashIncomeCents: 662_000,
    market: {
      modelVersion: "regime-v1",
      regime: "expansion",
      nextRegime: "expansion",
      equityReturnPpm: 8_200,
      bondReturnPpm: 2_100,
      cashReturnPpm: 300,
      housingReturnPpm: 4_100,
      inflationPpm: 2_400,
      laborDemandChangePpm: 1_000,
    },
    marketValueChangeCents: 41_200,
    annualInflationIncreaseCents: 9_000,
    insurancePlayerCostCents: 12_800,
    requiredCashCents: 365_000,
    nonDebtObligationsPaidCents: 340_000,
    debtService: {
      totalInterestCents: 6_400,
      totalScheduledPaymentCents: 25_000,
    },
    funding: null,
    recurringAllocations: {
      grossSalaryCents: 1_000_000,
      afterTaxDiscretionaryCents: 297_000,
      preTax: {
        employee401kCents: 50_000,
        employer401kMatchCents: 25_000,
        hsaCents: 10_000,
      },
      afterTax: {
        broadIndexCents: 50_000,
        sectorCents: 0,
        speculativeCents: 0,
        iraCents: 0,
        extraDebtPayments: [],
      },
      unallocatedAfterTaxCents: 247_000,
    },
    outcome: null,
  };
}
