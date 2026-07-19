import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  RISK_METRIC_POLICIES_V1,
  RISK_METRIC_WEIGHTS_V1,
} from "../risk-policy-v1";
import { analyzeRiskV1, RISK_ANALYZER_V1_VERSION } from "../risk-v1";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function state(options: { insuranceCoverageIds?: readonly string[] } = {}) {
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
      insuranceCoverageIds: options.insuranceCoverageIds ?? [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.risk-v1",
    playerId: "player.risk-v1",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "risk-v1",
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
  });
}

function withIncome(input: GameStateV2, annualGrossSalaryCents: number): GameStateV2 {
  if (input.gameplay.employment.status !== "employed") {
    throw new Error("test fixture requires employed state");
  }
  return {
    ...input,
    gameplay: {
      ...input.gameplay,
      employment: {
        ...input.gameplay.employment,
        annualGrossSalaryCents: moneyCents(annualGrossSalaryCents),
      },
    },
  };
}

function withFinances(
  input: GameStateV2,
  finances: Partial<GameStateV2["finances"]>,
): GameStateV2 {
  return { ...input, finances: { ...input.finances, ...finances } };
}

function withPortfolio(
  input: GameStateV2,
  portfolio: Partial<GameStateV2["gameplay"]["portfolio"]>,
): GameStateV2 {
  const nextPortfolio = { ...input.gameplay.portfolio, ...portfolio };
  return {
    ...input,
    finances: {
      ...input.finances,
      taxableInvestmentsCents: moneyCents(
        nextPortfolio.taxableBroadIndexCents +
          nextPortfolio.taxableSectorCents +
          nextPortfolio.taxableSpeculativeCents +
          nextPortfolio.taxableLegacyUnclassifiedCents,
      ),
    },
    gameplay: { ...input.gameplay, portfolio: nextPortfolio },
  };
}

function withHighInterestDebt(input: GameStateV2): GameStateV2 {
  const debt = {
    id: "debt.high-interest",
    kind: "personal_loan",
    principalCents: moneyCents(6_000_000),
    annualInterestRatePpm: ratePpm(180_000),
    minimumPaymentCents: moneyCents(200_000),
    remainingTermMonths: 36,
  } as const;
  return {
    ...input,
    finances: {
      ...input.finances,
      nonCreditLiabilitiesCents: debt.principalCents,
      requiredObligationsCents: moneyCents(
        input.finances.requiredObligationsCents + debt.minimumPaymentCents,
      ),
    },
    gameplay: {
      ...input.gameplay,
      debts: { ...input.gameplay.debts, termDebts: [debt] },
    },
  };
}

function withCreditDraw(input: GameStateV2, amountCents: number): GameStateV2 {
  return {
    ...input,
    finances: {
      ...input.finances,
      cashCents: moneyCents(input.finances.cashCents + amountCents),
      creditUsedCents: moneyCents(input.finances.creditUsedCents + amountCents),
    },
    gameplay: {
      ...input.gameplay,
      debts: {
        ...input.gameplay.debts,
        revolvingCreditUsedCents: moneyCents(
          input.gameplay.debts.revolvingCreditUsedCents + amountCents,
        ),
      },
    },
  };
}

describe("risk and resilience analyzer v1", () => {
  it("returns every transparent metric with raw units and bounded severity", () => {
    const snapshot = analyzeRiskV1(state());

    expect(snapshot.version).toBe(RISK_ANALYZER_V1_VERSION);
    expect(Object.keys(snapshot.metrics)).toEqual([
      "emergency_fund_months",
      "monthly_free_cash_flow",
      "debt_service_ratio",
      "fixed_cost_ratio",
      "high_interest_debt_burden",
      "liquid_resource_coverage",
      "insurance_protection_gap",
      "portfolio_concentration",
      "job_investment_sector_correlation",
      "income_stability",
      "lifestyle_rigidity",
      "interest_burden",
      "retirement_readiness",
      "recent_financial_stress",
    ]);
    for (const metric of Object.values(snapshot.metrics)) {
      expect(metric.unit).toBeTruthy();
      expect(metric.severityPpm).toBeGreaterThanOrEqual(0);
      expect(metric.severityPpm).toBeLessThanOrEqual(1_000_000);
    }
    expect(snapshot.facts).toHaveLength(14);
  });

  it("handles zero and negative income without treating negative salary as spendable income", () => {
    const base = state();
    const zeroIncome = analyzeRiskV1(withIncome(base, 0));
    const negativeIncome = analyzeRiskV1(withIncome(base, -1_200_000));

    expect(negativeIncome.metrics.monthly_free_cash_flow.rawValue).toBe(
      zeroIncome.metrics.monthly_free_cash_flow.rawValue,
    );
    expect(zeroIncome.metrics.income_stability).toMatchObject({
      rawValue: 0,
      band: "severe",
    });
    expect(zeroIncome.metrics.fixed_cost_ratio).toMatchObject({
      rawValue: 1_000_000,
      band: "severe",
    });
  });

  it("treats debt payments and interest as severe when recurring income is zero", () => {
    const snapshot = analyzeRiskV1(withIncome(withHighInterestDebt(state()), 0));

    expect(snapshot.metrics.debt_service_ratio.band).toBe("severe");
    expect(snapshot.metrics.high_interest_debt_burden.band).toBe("severe");
    expect(snapshot.metrics.interest_burden.band).toBe("severe");
  });

  it("uses Financial Engine per-debt rounding for monthly interest burden", () => {
    const base = state();
    const termDebts: GameStateV2["gameplay"]["debts"]["termDebts"] = [
      {
        id: "debt.rounding-a",
        kind: "personal_loan",
        principalCents: moneyCents(3),
        annualInterestRatePpm: ratePpm(1_000_000),
        minimumPaymentCents: moneyCents(1),
        remainingTermMonths: 12,
      },
      {
        id: "debt.rounding-b",
        kind: "personal_loan",
        principalCents: moneyCents(3),
        annualInterestRatePpm: ratePpm(1_000_000),
        minimumPaymentCents: moneyCents(1),
        remainingTermMonths: 12,
      },
    ];
    const input: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        debts: { ...base.gameplay.debts, termDebts },
      },
    };

    expect(analyzeRiskV1(input).metrics.interest_burden.rawValue).toBe(0);
  });

  it("uses the Financial Engine payoff cap for minimum debt service", () => {
    const base = state();
    const input: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        debts: {
          ...base.gameplay.debts,
          termDebts: [
            {
              id: "debt.final-payment",
              kind: "personal_loan",
              principalCents: moneyCents(3),
              annualInterestRatePpm: ratePpm(0),
              minimumPaymentCents: moneyCents(100),
              remainingTermMonths: 1,
            },
          ],
        },
      },
    };

    expect(analyzeRiskV1(input).metrics.debt_service_ratio.rawValue).toBe(3);
  });

  it("uses the Financial Goal owner ceiling for retirement readiness", () => {
    const base = state();
    const input = withPortfolio(
      {
        ...base,
        gameplay: {
          ...base.gameplay,
          financialGoal: {
            version: "financial-goal-v1",
            desiredAnnualSpendingCents: moneyCents(2),
            safeWithdrawalRatePpm: ratePpm(60_000),
            targetAgeYears: 65,
            source: "player_selected",
          },
        },
      },
      {
        taxableBroadIndexCents: moneyCents(0),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(0),
        retirement401kCents: moneyCents(33),
        retirementIraCents: moneyCents(0),
        retirementLegacyUnclassifiedCents: moneyCents(0),
        hsaCents: moneyCents(0),
      },
    );

    expect(analyzeRiskV1(input).metrics.retirement_readiness.rawValue).toBe(
      970_588,
    );
  });

  it("handles zero essential expenses as full coverage without division errors", () => {
    const snapshot = analyzeRiskV1(
      withFinances(state(), {
        annualLivingCostCents: moneyCents(0),
        requiredObligationsCents: moneyCents(0),
      }),
    );

    expect(snapshot.metrics.emergency_fund_months).toMatchObject({
      rawValue: 24_000_000,
      band: "low",
    });
    expect(snapshot.metrics.liquid_resource_coverage).toMatchObject({
      rawValue: 24_000_000,
      band: "low",
    });
    expect(snapshot.metrics.fixed_cost_ratio.rawValue).toBe(0);
    expect(snapshot.metrics.lifestyle_rigidity.rawValue).toBe(0);
  });

  it("uses inclusive, documented threshold boundaries in both risk directions", () => {
    const base = state();
    const exactSixMonths = analyzeRiskV1(
      withFinances(base, {
        cashCents: moneyCents(base.finances.requiredObligationsCents * 6),
      }),
    );
    const belowSixMonths = analyzeRiskV1(
      withFinances(base, {
        cashCents: moneyCents(base.finances.requiredObligationsCents * 6 - 1),
      }),
    );
    const exactConcentration = analyzeRiskV1(
      withPortfolio(base, {
        taxableBroadIndexCents: moneyCents(800_000),
        taxableSectorCents: moneyCents(200_000),
        taxableSpeculativeCents: moneyCents(0),
        retirement401kCents: moneyCents(0),
        retirementIraCents: moneyCents(0),
        hsaCents: moneyCents(0),
      }),
    );
    const aboveConcentration = analyzeRiskV1(
      withPortfolio(base, {
        taxableBroadIndexCents: moneyCents(799_999),
        taxableSectorCents: moneyCents(200_001),
        taxableSpeculativeCents: moneyCents(0),
        retirement401kCents: moneyCents(0),
        retirementIraCents: moneyCents(0),
        hsaCents: moneyCents(0),
      }),
    );

    expect(exactSixMonths.metrics.emergency_fund_months.band).toBe("low");
    expect(belowSixMonths.metrics.emergency_fund_months.band).toBe("moderate");
    expect(exactConcentration.metrics.portfolio_concentration.band).toBe("low");
    expect(aboveConcentration.metrics.portfolio_concentration.band).toBe(
      "moderate",
    );
  });

  it("is repeatable, does not mutate state, and is monotonic across cash levels", () => {
    const input = state();
    const before = structuredClone(input);

    expect(analyzeRiskV1(input)).toEqual(analyzeRiskV1(input));
    expect(input).toEqual(before);

    const severities = Array.from({ length: 13 }, (_, index) =>
      analyzeRiskV1(
        withFinances(input, {
          cashCents: moneyCents(
            Math.round(input.finances.requiredObligationsCents * index * 0.75),
          ),
        }),
      ).metrics.emergency_fund_months.severityPpm,
    );
    for (let index = 1; index < severities.length; index += 1) {
      expect(severities[index]).toBeLessThanOrEqual(severities[index - 1]!);
    }
  });

  it("counts only player costs inside the trailing three-month stress window", () => {
    const base = state();
    const event = (
      id: string,
      resolvedMonth: "2026-04" | "2026-05",
      playerCostCents: number,
    ): GameStateV2["gameplay"]["eventLifecycle"]["history"][number] => ({
      commandId: `command.${id}`,
      resultingRevision: 1,
      eventId: `event.${id}`,
      templateId: "event.test",
      templateVersion: 1,
      tier: "medium",
      targetedWeakness: "low_emergency_fund",
      parameters: {},
      choiceId: "choice.pay",
      availableChoiceIds: ["choice.pay"],
      scheduledMonth: simulationMonth(resolvedMonth),
      resolvedMonth: simulationMonth(resolvedMonth),
      playerCostCents: moneyCents(playerCostCents),
      insurerCostCents: moneyCents(0),
    });
    const input: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        eventLifecycle: {
          ...base.gameplay.eventLifecycle,
          history: [
            event("outside", "2026-04", 900_000),
            event("inside", "2026-05", 300_000),
          ],
        },
      },
    };

    expect(analyzeRiskV1(input).metrics.recent_financial_stress).toMatchObject({
      rawValue: 300_000,
      unit: "money_cents",
    });
  });

  it("publishes immutable thresholds, separate normalized weights, tags, and facts", () => {
    expect(
      Object.values(RISK_METRIC_WEIGHTS_V1).reduce(
        (total, weight) => total + weight,
        0,
      ),
    ).toBe(1_000_000);
    expect(
      Object.isFrozen(RISK_METRIC_POLICIES_V1.emergency_fund_months.thresholds),
    ).toBe(true);

    const snapshot = analyzeRiskV1(
      withIncome(withHighInterestDebt(withFinances(state(), { cashCents: moneyCents(0) })), 0),
    );
    expect(snapshot.weaknessTags).toEqual(
      expect.arrayContaining([
        "risk.low_emergency_fund",
        "risk.high_interest_debt",
        "risk.unstable_income",
      ]),
    );
    expect(snapshot.facts).toContainEqual(
      expect.objectContaining({
        factId: "risk-v1.emergency_fund_months",
        factCode: "unborrowed_cash_covers_required_obligations_for_months",
        rawValue: 0,
        unit: "months_ppm",
        band: "severe",
      }),
    );
  });

  it("reports a complete insurance gap when uninsured and no gap when fully insured", () => {
    const uninsured = analyzeRiskV1(withIncome(state(), 9_000_000));
    const insuredState = withIncome(
      state({
          insuranceCoverageIds: [
            "insurance.short_term_disability",
            "insurance.long_term_disability",
            "insurance.term_life",
            "insurance.renters",
          ],
        }),
      9_000_000,
    );
    const insured = analyzeRiskV1(insuredState);
    const optedOut = analyzeRiskV1({
      ...insuredState,
      gameplay: {
        ...insuredState.gameplay,
        recurringStrategy: {
          ...insuredState.gameplay.recurringStrategy,
          insuranceCoverageIds: [],
        },
      },
    });
    const homeownerWithRenters = analyzeRiskV1(
      withFinances(insuredState, { homeValueCents: moneyCents(10_000_000) }),
    );

    expect(uninsured.metrics.insurance_protection_gap).toMatchObject({
      rawValue: 1_000_000,
      band: "severe",
    });
    expect(insured.metrics.insurance_protection_gap).toMatchObject({
      rawValue: 0,
      band: "low",
    });
    expect(optedOut.metrics.insurance_protection_gap).toMatchObject({
      rawValue: 1_000_000,
      band: "severe",
    });
    expect(
      homeownerWithRenters.metrics.insurance_protection_gap.rawValue,
    ).toBeGreaterThan(0);
  });

  it("improves only liquidity dimensions when cash increases", () => {
    const base = state();
    const lowCash = analyzeRiskV1(withFinances(base, { cashCents: moneyCents(0) }));
    const highCash = analyzeRiskV1(
      withFinances(base, { cashCents: moneyCents(5_000_000) }),
    );

    expect(highCash.metrics.emergency_fund_months.severityPpm).toBeLessThan(
      lowCash.metrics.emergency_fund_months.severityPpm,
    );
    expect(highCash.metrics.liquid_resource_coverage.severityPpm).toBeLessThan(
      lowCash.metrics.liquid_resource_coverage.severityPpm,
    );
    for (const id of [
      "insurance_protection_gap",
      "portfolio_concentration",
      "job_investment_sector_correlation",
      "income_stability",
      "interest_burden",
    ] as const) {
      expect(highCash.metrics[id]).toEqual(lowCash.metrics[id]);
    }
  });

  it("does not treat borrowed cash as a stronger emergency fund", () => {
    const before = analyzeRiskV1(state());
    const after = analyzeRiskV1(withCreditDraw(state(), 500_00));

    expect(after.metrics.emergency_fund_months.severityPpm).toBeGreaterThan(
      before.metrics.emergency_fund_months.severityPpm,
    );
    expect(after.metrics.liquid_resource_coverage.severityPpm).toBeGreaterThan(
      before.metrics.liquid_resource_coverage.severityPpm,
    );
    expect(after.metrics.debt_service_ratio.severityPpm).toBeGreaterThan(
      before.metrics.debt_service_ratio.severityPpm,
    );
    expect(after.metrics.high_interest_debt_burden.severityPpm).toBeGreaterThan(
      before.metrics.high_interest_debt_burden.severityPpm,
    );
    expect(after.aggregateSeverityPpm).toBeGreaterThan(before.aggregateSeverityPpm);
  });

  it("monotonically improves debt dimensions when high-interest debt is paid off", () => {
    const base = state();
    const indebted = withHighInterestDebt(base);
    const before = analyzeRiskV1(indebted);
    const after = analyzeRiskV1(base);

    for (const id of [
      "debt_service_ratio",
      "high_interest_debt_burden",
      "interest_burden",
      "fixed_cost_ratio",
    ] as const) {
      expect(after.metrics[id].severityPpm).toBeLessThan(
        before.metrics[id].severityPpm,
      );
    }
  });

  it("separates portfolio concentration from employment-sector overlap", () => {
    const base = state();
    const diversified = analyzeRiskV1(
      withPortfolio(base, {
        taxableBroadIndexCents: moneyCents(2_000_000),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(0),
      }),
    );
    const sectorHeavy = analyzeRiskV1(
      withPortfolio(base, {
        taxableBroadIndexCents: moneyCents(500_000),
        taxableSectorCents: moneyCents(1_500_000),
        taxableSpeculativeCents: moneyCents(0),
      }),
    );
    const speculativeHeavy = analyzeRiskV1(
      withPortfolio(base, {
        taxableBroadIndexCents: moneyCents(500_000),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(1_500_000),
      }),
    );

    expect(sectorHeavy.metrics.portfolio_concentration.severityPpm).toBeGreaterThan(
      diversified.metrics.portfolio_concentration.severityPpm,
    );
    expect(sectorHeavy.metrics.job_investment_sector_correlation.severityPpm).toBeGreaterThan(
      diversified.metrics.job_investment_sector_correlation.severityPpm,
    );
    expect(speculativeHeavy.metrics.portfolio_concentration.severityPpm).toBe(
      sectorHeavy.metrics.portfolio_concentration.severityPpm,
    );
    expect(speculativeHeavy.metrics.job_investment_sector_correlation).toEqual(
      diversified.metrics.job_investment_sector_correlation,
    );
  });

  it("improves fixed-cost flexibility when lifestyle spending is reduced", () => {
    const base = state();
    const reducedAnnualLivingCost = moneyCents(
      Math.floor(base.finances.annualLivingCostCents / 2),
    );
    const monthlyReduction = Math.round(
      (base.finances.annualLivingCostCents - reducedAnnualLivingCost) / 12,
    );
    const reduced = withFinances(base, {
      annualLivingCostCents: reducedAnnualLivingCost,
      requiredObligationsCents: moneyCents(
        base.finances.requiredObligationsCents - monthlyReduction,
      ),
    });
    const before = analyzeRiskV1(base);
    const after = analyzeRiskV1(reduced);

    expect(after.metrics.lifestyle_rigidity.severityPpm).toBeLessThan(
      before.metrics.lifestyle_rigidity.severityPpm,
    );
    expect(after.metrics.fixed_cost_ratio.severityPpm).toBeLessThan(
      before.metrics.fixed_cost_ratio.severityPpm,
    );
    expect(after.metrics.monthly_free_cash_flow.rawValue).toBeGreaterThan(
      before.metrics.monthly_free_cash_flow.rawValue!,
    );
  });
});
