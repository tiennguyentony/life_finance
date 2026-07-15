import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { createNativeGameStateV2 } from "./native-game-state-v2";
import {
  assessV2Liquidity,
  prepareV2ObligationCash,
} from "./obligation-funding-v2";
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
    runId: "run.funding-v2",
    playerId: "player.funding-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "funding-v2",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(100_000),
      taxableBroadIndexCents: moneyCents(600_000),
      taxableSectorCents: moneyCents(500_000),
      taxableSpeculativeCents: moneyCents(400_000),
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

describe("v2 obligation cash preparation", () => {
  it("liquidates risk buckets in stable order with exact transaction cost", () => {
    const initial = state();
    const result = prepareV2ObligationCash(
      initial,
      "turn.funding",
      moneyCents(1_000_000),
      ratePpm(100_000),
    );

    expect(result.funding).toEqual({
      grossLiquidationCents: 1_000_000,
      liquidationCostCents: 100_000,
      netLiquidationProceedsCents: 900_000,
      creditDrawnCents: 0,
      liquidatedBuckets: {
        taxableLegacyUnclassifiedCents: 0,
        taxableSpeculativeCents: 400_000,
        taxableSectorCents: 500_000,
        taxableBroadIndexCents: 100_000,
      },
    });
    expect(result.state.finances.cashCents).toBe(1_000_000);
    expect(result.state.finances.taxableInvestmentsCents).toBe(500_000);
    expect(result.state.gameplay.portfolio).toMatchObject({
      taxableSpeculativeCents: 0,
      taxableSectorCents: 0,
      taxableBroadIndexCents: 500_000,
    });
    expect(result.state.ledger.transactions.at(-1)?.postings).toEqual([
      { accountId: "asset.cash", debitCents: 900_000, creditCents: 0 },
      { accountId: "expense.living", debitCents: 100_000, creditCents: 0 },
      { accountId: "asset.taxable_investments", debitCents: 0, creditCents: 1_000_000 },
    ]);
    expect(initial.finances.cashCents).toBe(100_000);
  });

  it("draws only the remaining credit after exhausting net taxable value", () => {
    const result = prepareV2ObligationCash(
      state(),
      "turn.credit",
      moneyCents(2_000_000),
      ratePpm(100_000),
    );

    expect(result.funding).toMatchObject({
      grossLiquidationCents: 1_500_000,
      liquidationCostCents: 150_000,
      netLiquidationProceedsCents: 1_350_000,
      creditDrawnCents: 550_000,
    });
    expect(result.state.finances.cashCents).toBe(2_000_000);
    expect(result.state.finances.taxableInvestmentsCents).toBe(0);
    expect(result.state.finances.creditUsedCents).toBe(550_000);
    expect(result.state.gameplay.debts.revolvingCreditUsedCents).toBe(550_000);
  });

  it("detects bankruptcy before writing any partial liquidation or credit", () => {
    const initial = state();
    const assessment = assessV2Liquidity(
      initial,
      moneyCents(2_500_001),
      ratePpm(100_000),
    );
    expect(assessment).toMatchObject({
      totalAutomaticLiquidityCents: 2_450_000,
      shortfallCents: 50_001,
      isBankrupt: true,
    });
    expect(() =>
      prepareV2ObligationCash(
        initial,
        "turn.bankrupt",
        moneyCents(2_500_001),
        ratePpm(100_000),
      ),
    ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_LIQUIDITY" }));
    expect(initial.finances).toMatchObject({
      cashCents: 100_000,
      taxableInvestmentsCents: 1_500_000,
      creditUsedCents: 0,
    });
    expect(initial.ledger.transactions).toHaveLength(1);
  });

  it("does nothing when cash already covers the requested amount", () => {
    const initial = state();
    const result = prepareV2ObligationCash(
      initial,
      "turn.cash-only",
      moneyCents(50_000),
      ratePpm(100_000),
    );
    expect(result.funding.grossLiquidationCents).toBe(0);
    expect(result.funding.creditDrawnCents).toBe(0);
    expect(result.state.ledger.transactions).toHaveLength(1);
  });
});
