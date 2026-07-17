import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  estimatePersonalEventImpactV2,
  RuntimeBalanceImpactV2Error,
} from "../runtime-balance-impact-v2";

function state(prepared: boolean): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: prepared ? "health.hdhp_hsa" : null,
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: prepared ? ["insurance.renters"] : [],
      scenarioId: "scenario.fresh_start",
    },
  );
  const native = createNativeGameStateV2({
    runId: `run.runtime-balance-impact.${prepared}`,
    playerId: "player.runtime-balance-impact",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "runtime-balance-impact",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(500_000),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(5_000_000),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return prepared
    ? native
    : {
        ...native,
        finances: { ...native.finances, cashCents: moneyCents(50_000) },
      };
}

describe("Runtime Balance impact estimator v2", () => {
  const monthlyCashFlowEvidence = {
    monthlyCashInflowCents: moneyCents(730_000),
    requiredCashCents: moneyCents(584_967),
  };

  it("reuses coverage and liquidity rules so preparation lowers the same event impact", () => {
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const parameters = { gross_bill_cents: 1_000_000 };

    const prepared = estimatePersonalEventImpactV2(
      state(true),
      template,
      parameters,
      ratePpm(10_000),
      monthlyCashFlowEvidence,
    );
    const unprepared = estimatePersonalEventImpactV2(
      state(false),
      template,
      parameters,
      ratePpm(10_000),
      monthlyCashFlowEvidence,
    );

    expect(prepared.grossParameterCostCents).toBe(1_000_000);
    expect(unprepared.grossParameterCostCents).toBe(1_000_000);
    expect(prepared.minimumUncoveredCostCents).toBeLessThan(
      unprepared.minimumUncoveredCostCents,
    );
    expect(prepared.impactScorePpm).toBeLessThan(unprepared.impactScorePpm);
    expect(prepared.reasonableResponseIds).toContain("use_insurance");
    expect(unprepared.reasonableResponseIds).not.toContain("use_insurance");
  });

  it("reports temporary cost, liquidation, credit, burn, recovery, and failure preflight", () => {
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const estimate = estimatePersonalEventImpactV2(
      state(false),
      template,
      { gross_bill_cents: 1_500_000 },
      ratePpm(10_000),
      monthlyCashFlowEvidence,
    );

    expect(estimate.minimumTemporaryCostCents).toBe(1_500_000);
    expect(estimate.directCostCents).toBe(1_500_000);
    expect(estimate.lostIncomeCents).toBe(0);
    expect(estimate.temporaryCostDurationMonths).toBe(1);
    expect(estimate.liquidResourceUseCents).toBe(50_000);
    expect(estimate.likelyLiquidationCents).toBeGreaterThan(0);
    expect(estimate.likelyCreditUseCents).toBeGreaterThan(0);
    expect(estimate.burnMonthsPpm).toBeGreaterThan(0);
    expect(estimate.negativeCashFlowDurationMonths).toBe(1);
    expect(estimate.recoveryTimeMonths).toBeGreaterThanOrEqual(1);
    expect(estimate.inexpensiveGoalDelayMonths).toBeNull();
    expect(typeof estimate.immediateBankruptcyRisk).toBe("boolean");
    expect(["none", "possible", "immediate"]).toContain(
      estimate.bankruptcyRisk,
    );
  });

  it("never scales a declared gross amount from player wealth", () => {
    const template = getPersonalEventTemplateV2("personal.lifestyle_upgrade");
    const parameters = { annual_cost_increase_cents: 2_400_000 };
    const lowWealth = state(false);
    const wealthy: GameStateV2 = {
      ...lowWealth,
      finances: {
        ...lowWealth.finances,
        cashCents: moneyCents(50_000_000),
      },
    };

    const low = estimatePersonalEventImpactV2(
      lowWealth,
      template,
      parameters,
      ratePpm(10_000),
      monthlyCashFlowEvidence,
    );
    const high = estimatePersonalEventImpactV2(
      wealthy,
      template,
      parameters,
      ratePpm(10_000),
      monthlyCashFlowEvidence,
    );

    expect(low.grossParameterCostCents).toBe(2_400_000);
    expect(high.grossParameterCostCents).toBe(2_400_000);
    const acceptedUpgrade = low.responses.find(
      ({ responseId }) => responseId === "accept_upgrade",
    );
    expect(acceptedUpgrade).toMatchObject({
      grossCostCents: 2_400_000,
      projectedPlanCostCents: 2_400_000,
      firstMonthRequiredCashCents: 200_000,
    });
    expect(acceptedUpgrade?.bankruptcyRisk).not.toBe("immediate");
    expect(low.directCostCents).toBe(0);
  });

  it("rejects invalid verified monthly cash-flow evidence with a typed error", () => {
    expect(() => estimatePersonalEventImpactV2(
      state(true),
      getPersonalEventTemplateV2("personal.medical_bill"),
      { gross_bill_cents: 100_000 },
      ratePpm(10_000),
      {
        monthlyCashInflowCents: moneyCents(0),
        requiredCashCents: -1 as ReturnType<typeof moneyCents>,
      },
    )).toThrow(
      expect.objectContaining<Partial<RuntimeBalanceImpactV2Error>>({
        code: "INVALID_MONTHLY_CASH_FLOW_EVIDENCE",
      }),
    );
  });
});
