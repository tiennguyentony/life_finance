import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  PREPAREDNESS_POLICY_V1,
  assessPreparednessV1,
} from "../preparedness-assessment-v1";
import type { RiskMetricId } from "../risk-policy-v1";
import { analyzeRiskV1, type RiskSnapshotV1 } from "../risk-v1";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function riskSnapshot(): RiskSnapshotV1 {
  const resolved = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return analyzeRiskV1(createNativeGameStateV2({
    runId: "run.preparedness-v1",
    playerId: "player.preparedness-v1",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "preparedness-v1",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_500_000),
      taxableBroadIndexCents: moneyCents(2_000_000),
      taxableSectorCents: moneyCents(500_000),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(3_000_000),
      retirementIraCents: moneyCents(500_000),
      hsaCents: moneyCents(100_000),
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
  }));
}

function withPreparedness(
  snapshot: RiskSnapshotV1,
  preparedPpm: Partial<Record<RiskMetricId, number>>,
  unknown: readonly RiskMetricId[] = [],
): RiskSnapshotV1 {
  const metrics = Object.fromEntries(
    Object.entries(snapshot.metrics).map(([id, metric]) => {
      const metricId = id as RiskMetricId;
      const prepared = preparedPpm[metricId] ?? 0;
      return [id, Object.freeze({
        ...metric,
        normalizedInput: unknown.includes(metricId) ? null : 0,
        severityPpm: ratePpm(unknown.includes(metricId) ? 500_000 : 1_000_000 - prepared),
      })];
    }),
  ) as RiskSnapshotV1["metrics"];
  return Object.freeze({ ...snapshot, metrics: Object.freeze(metrics) });
}

const ALL_COMPONENT_METRICS: readonly RiskMetricId[] = [
  "emergency_fund_months",
  "liquid_resource_coverage",
  "monthly_free_cash_flow",
  "fixed_cost_ratio",
  "lifestyle_rigidity",
  "debt_service_ratio",
  "high_interest_debt_burden",
  "interest_burden",
  "insurance_protection_gap",
  "portfolio_concentration",
  "job_investment_sector_correlation",
];

describe("Preparedness Assessment V1", () => {
  it("returns the frozen weighted contract for fully prepared evidence", () => {
    const snapshot = withPreparedness(
      riskSnapshot(),
      Object.fromEntries(ALL_COMPONENT_METRICS.map((id) => [id, 1_000_000])),
    );

    const result = assessPreparednessV1(snapshot);

    expect(result).toEqual({
      version: "preparedness-assessment-v1",
      riskVersion: "risk-v1",
      asOfMonth: simulationMonth("2026-07"),
      scorePpm: 1_000_000,
      band: "resilient",
      components: {
        liquidityPpm: 1_000_000,
        cashFlowPpm: 1_000_000,
        debtPpm: 1_000_000,
        insurancePpm: 1_000_000,
        diversificationPpm: 1_000_000,
      },
    });
    expect(Object.isFrozen(PREPAREDNESS_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(PREPAREDNESS_POLICY_V1.weightsPpm)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.components)).toBe(true);
  });

  it("uses the weakest relevant metric and exact aggregate weighting", () => {
    const prepared = Object.fromEntries(
      ALL_COMPONENT_METRICS.map((id) => [id, 1_000_000]),
    ) as Record<RiskMetricId, number>;
    prepared.emergency_fund_months = 0;

    const result = assessPreparednessV1(withPreparedness(riskSnapshot(), prepared));

    expect(result.components.liquidityPpm).toBe(0);
    expect(result.scorePpm).toBe(650_000);
    expect(result.band).toBe("stable");
  });

  it("treats unavailable evidence as neutral without hiding known exposure", () => {
    const prepared = Object.fromEntries(
      ALL_COMPONENT_METRICS.map((id) => [id, 1_000_000]),
    ) as Record<RiskMetricId, number>;
    const result = assessPreparednessV1(withPreparedness(
      riskSnapshot(),
      prepared,
      [
        "insurance_protection_gap",
        "portfolio_concentration",
        "job_investment_sector_correlation",
      ],
    ));

    expect(result.components.insurancePpm).toBe(500_000);
    expect(result.components.diversificationPpm).toBe(500_000);
    expect(result.scorePpm).toBe(900_000);

    const knownExposure = assessPreparednessV1(withPreparedness(
      riskSnapshot(),
      { ...prepared, portfolio_concentration: 100_000 },
      ["job_investment_sector_correlation"],
    ));
    expect(knownExposure.components.diversificationPpm).toBe(100_000);
  });

  it("uses exact inclusive preparedness band boundaries", () => {
    const at250 = withPreparedness(riskSnapshot(), {
      monthly_free_cash_flow: 1_000_000,
      fixed_cost_ratio: 1_000_000,
      lifestyle_rigidity: 1_000_000,
    });
    const at500 = withPreparedness(riskSnapshot(), {
      monthly_free_cash_flow: 1_000_000,
      fixed_cost_ratio: 1_000_000,
      lifestyle_rigidity: 1_000_000,
      debt_service_ratio: 1_000_000,
      high_interest_debt_burden: 1_000_000,
      interest_burden: 1_000_000,
      portfolio_concentration: 1_000_000,
      job_investment_sector_correlation: 1_000_000,
    });
    const at750 = withPreparedness(riskSnapshot(), {
      emergency_fund_months: 1_000_000,
      liquid_resource_coverage: 1_000_000,
      monthly_free_cash_flow: 1_000_000,
      fixed_cost_ratio: 1_000_000,
      lifestyle_rigidity: 1_000_000,
      insurance_protection_gap: 1_000_000,
    });

    expect(assessPreparednessV1(withPreparedness(riskSnapshot(), {})).band).toBe("critical");
    expect(assessPreparednessV1(at250)).toMatchObject({ scorePpm: 250_000, band: "exposed" });
    expect(assessPreparednessV1(at500)).toMatchObject({ scorePpm: 500_000, band: "stable" });
    expect(assessPreparednessV1(at750)).toMatchObject({ scorePpm: 750_000, band: "resilient" });
  });

  it("does not mutate input and rejects malformed metric evidence", () => {
    const snapshot = riskSnapshot();
    const before = structuredClone(snapshot);
    assessPreparednessV1(snapshot);
    expect(snapshot).toEqual(before);

    const malformed = {
      ...snapshot,
      metrics: {
        ...snapshot.metrics,
        emergency_fund_months: {
          ...snapshot.metrics.emergency_fund_months,
          severityPpm: -1,
        },
      },
    } as unknown as RiskSnapshotV1;
    expect(() => assessPreparednessV1(malformed)).toThrowError(RangeError);
  });
});
