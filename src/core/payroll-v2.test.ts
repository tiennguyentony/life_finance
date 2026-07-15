import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { createNativeGameStateV2 } from "./native-game-state-v2";
import {
  applyMonthlyPayroll,
  type MonthlyTaxEvidence,
} from "./payroll-v2";
import { setRecurringStrategy } from "./recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "./scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../data/scenario-catalog";

function state() {
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
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.payroll",
    playerId: "player.payroll",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "payroll",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(0),
      happinessPpm: ratePpm(1_000_000),
    },
  });
}

function evidence(
  overrides: Partial<MonthlyTaxEvidence> = {},
): MonthlyTaxEvidence {
  return {
    schemaVersion: 1,
    traceId: "tax.run-payroll.2026-07",
    economicYear: 2026,
    policyYear: 2026,
    stateCode: "WA",
    filingStatus: "single",
    provider: "PolicyEngine US",
    bundleVersion: "4.21.0",
    rulesVersion: "1.764.6",
    projectedFromFrozenPolicy: false,
    grossIncomeCents: moneyCents(1_000_000),
    employee401kContributionCents: moneyCents(50_000),
    employeeHsaContributionCents: moneyCents(20_000),
    totalTaxCents: 200_000,
    afterTaxCashIncomeCents: moneyCents(730_000),
    ...overrides,
  };
}

describe("v2 monthly payroll with persisted tax evidence", () => {
  it("posts net cash, tax, pre-tax savings, and tiered employer match atomically", () => {
    const initial = state();
    const configured = setRecurringStrategy(initial, {
      schemaVersion: 2,
      id: "cmd.strategy",
      type: "set_recurring_strategy",
      expectedRevision: 0,
      effectiveMonth: initial.currentMonth,
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: ratePpm(50_000),
          preTaxHsaSalaryRatePpm: ratePpm(20_000),
          afterTaxBroadIndexRatePpm: ratePpm(0),
          afterTaxSectorRatePpm: ratePpm(0),
          afterTaxSpeculativeRatePpm: ratePpm(0),
          afterTaxIraRatePpm: ratePpm(0),
          afterTaxExtraDebtRatePpm: ratePpm(0),
        },
      },
    });
    const result = applyMonthlyPayroll(configured, "turn.2026-07", evidence());

    expect(result.state.finances.cashCents).toBe(1_730_000);
    expect(result.state.finances.retirementCents).toBe(90_000);
    expect(result.state.finances.otherInvestableAssetsCents).toBe(20_000);
    expect(result.state.gameplay.portfolio.retirement401kCents).toBe(90_000);
    expect(result.state.gameplay.portfolio.hsaCents).toBe(20_000);
    expect(result.state.gameplay.contributions).toMatchObject({
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      hsaCents: 20_000,
    });
    expect(result.state.ledger.transactions.at(-1)?.postings).toEqual([
      { accountId: "asset.cash", debitCents: 730_000, creditCents: 0 },
      { accountId: "asset.retirement", debitCents: 90_000, creditCents: 0 },
      { accountId: "asset.other_investable", debitCents: 20_000, creditCents: 0 },
      { accountId: "expense.tax", debitCents: 200_000, creditCents: 0 },
      { accountId: "income.employment", debitCents: 0, creditCents: 1_000_000 },
      { accountId: "income.other", debitCents: 0, creditCents: 40_000 },
    ]);
    expect(result.state.revision).toBe(configured.revision);
  });

  it("supports a modeled negative tax while preserving balanced payroll", () => {
    const initial = state();
    const result = applyMonthlyPayroll(
      initial,
      "turn.tax-credit",
      evidence({
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: -10_000,
        afterTaxCashIncomeCents: moneyCents(1_010_000),
      }),
    );

    expect(result.state.finances.cashCents).toBe(2_010_000);
    expect(result.state.ledger.transactions.at(-1)?.postings).toContainEqual({
      accountId: "expense.tax",
      debitCents: 0,
      creditCents: 10_000,
    });
  });

  it("rejects arithmetic, jurisdiction, salary, and strategy mismatches without mutation", () => {
    const initial = state();
    expect(() =>
      applyMonthlyPayroll(
        initial,
        "turn.bad-arithmetic",
        evidence({ afterTaxCashIncomeCents: moneyCents(1) }),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_TAX_EVIDENCE" }));
    expect(() =>
      applyMonthlyPayroll(
        initial,
        "turn.bad-state",
        evidence({
          stateCode: "CA",
          employee401kContributionCents: moneyCents(0),
          employeeHsaContributionCents: moneyCents(0),
          afterTaxCashIncomeCents: moneyCents(800_000),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "TAX_CONTEXT_MISMATCH" }));
    expect(() =>
      applyMonthlyPayroll(initial, "turn.bad-strategy", evidence()),
    ).toThrow(expect.objectContaining({ code: "STRATEGY_TAX_MISMATCH" }));
    expect(initial.finances.cashCents).toBe(1_000_000);
    expect(initial.ledger.transactions).toHaveLength(1);
  });
});
