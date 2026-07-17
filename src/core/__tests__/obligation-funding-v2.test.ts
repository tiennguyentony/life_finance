import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm, type MoneyCents } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { finalizeGameStateV2 } from "../game-state-v2";
import {
  createNativeGameStateV2,
  type NativeGameStateV2Input,
} from "../native-game-state-v2";
import {
  assessV2Liquidity,
  executeV2ObligationFunding,
  minimumGrossTaxableLiquidationV2,
  netTaxableLiquidationValueV2,
  planV2ObligationFunding,
  prepareV2ObligationCash,
} from "../obligation-funding-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function state(
  finances: Partial<NativeGameStateV2Input["finances"]> = {},
) {
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
      ...finances,
    },
    wellbeing: {
      burnoutPpm: ratePpm(0),
      happinessPpm: ratePpm(1_000_000),
    },
  });
}

function stateWithRestrictedAssets() {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.married",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.established_household",
    },
  );
  return createNativeGameStateV2({
    runId: "run.funding-v2-restricted",
    playerId: "player.funding-v2-restricted",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "funding-v2-restricted",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(500_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(50_000_000),
      retirementIraCents: moneyCents(50_000_000),
      hsaCents: moneyCents(50_000_000),
      homeValueCents: moneyCents(50_000_000),
      otherAssetsCents: moneyCents(50_000_000),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(0),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(0),
      happinessPpm: ratePpm(1_000_000),
    },
  });
}

describe("v2 obligation funding plan", () => {
  it("uses the public net-value and minimum-gross helpers at rounding boundaries", () => {
    expect(
      netTaxableLiquidationValueV2(moneyCents(1), ratePpm(500_000)),
    ).toBe(0);
    expect(
      netTaxableLiquidationValueV2(moneyCents(2), ratePpm(500_000)),
    ).toBe(1);
    expect(
      minimumGrossTaxableLiquidationV2(
        moneyCents(1),
        moneyCents(2),
        ratePpm(500_000),
      ),
    ).toBe(2);
  });

  it("uses only the required portion of available cash", () => {
    const plan = planV2ObligationFunding(
      state(),
      moneyCents(50_000),
      ratePpm(100_000),
    );

    expect(plan).toMatchObject({
      requiredCashCents: 50_000,
      cashAvailableCents: 100_000,
      cashUsedCents: 50_000,
      taxableLiquidations: [],
      grossLiquidationCents: 0,
      liquidationCostCents: 0,
      netLiquidationProceedsCents: 0,
      remainingCreditCents: 1_000_000,
      creditUsedCents: 0,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
  });

  it("is fully funded at exact post-cost taxable equality", () => {
    const plan = planV2ObligationFunding(
      state(),
      moneyCents(1_450_000),
      ratePpm(100_000),
    );

    expect(plan).toMatchObject({
      cashUsedCents: 100_000,
      grossLiquidationCents: 1_500_000,
      liquidationCostCents: 150_000,
      netLiquidationProceedsCents: 1_350_000,
      creditUsedCents: 0,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
  });

  it("is fully funded at exact remaining-credit equality", () => {
    const plan = planV2ObligationFunding(
      state(),
      moneyCents(2_450_000),
      ratePpm(100_000),
    );

    expect(plan).toMatchObject({
      cashUsedCents: 100_000,
      netLiquidationProceedsCents: 1_350_000,
      remainingCreditCents: 1_000_000,
      creditUsedCents: 1_000_000,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
  });

  it("reports a one-cent residual beyond remaining credit", () => {
    const plan = planV2ObligationFunding(
      state(),
      moneyCents(2_450_001),
      ratePpm(100_000),
    );

    expect(plan).toMatchObject({
      cashUsedCents: 100_000,
      grossLiquidationCents: 1_500_000,
      netLiquidationProceedsCents: 1_350_000,
      creditUsedCents: 1_000_000,
      residualShortfallCents: 1,
      fullyFunded: false,
    });
  });

  it("orders taxable sales from legacy through speculative, sector, and broad index", () => {
    const initial = state();
    const classified = finalizeGameStateV2({
      ...initial,
      gameplay: {
        ...initial.gameplay,
        portfolio: {
          ...initial.gameplay.portfolio,
          taxableLegacyUnclassifiedCents: moneyCents(100_000),
          taxableSpeculativeCents: moneyCents(300_000),
          taxableSectorCents: moneyCents(400_000),
          taxableBroadIndexCents: moneyCents(700_000),
        },
      },
    });

    const plan = planV2ObligationFunding(
      classified,
      moneyCents(1_180_000),
      ratePpm(100_000),
    );

    expect(plan.taxableLiquidations).toEqual([
      {
        bucket: "taxableLegacyUnclassifiedCents",
        grossCents: 100_000,
        costCents: 10_000,
        netCents: 90_000,
      },
      {
        bucket: "taxableSpeculativeCents",
        grossCents: 300_000,
        costCents: 30_000,
        netCents: 270_000,
      },
      {
        bucket: "taxableSectorCents",
        grossCents: 400_000,
        costCents: 40_000,
        netCents: 360_000,
      },
      {
        bucket: "taxableBroadIndexCents",
        grossCents: 400_000,
        costCents: 40_000,
        netCents: 360_000,
      },
    ]);
  });

  it("allocates per-bucket costs as deltas of aggregate rounded cost", () => {
    const plan = planV2ObligationFunding(
      state({
        taxableBroadIndexCents: moneyCents(1),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(1),
        revolvingCreditLimitCents: moneyCents(0),
      }),
      moneyCents(100_001),
      ratePpm(500_000),
    );

    expect(plan).toMatchObject({
      grossLiquidationCents: 2,
      liquidationCostCents: 1,
      netLiquidationProceedsCents: 1,
      residualShortfallCents: 0,
    });
    expect(plan.taxableLiquidations).toEqual([
      {
        bucket: "taxableSpeculativeCents",
        grossCents: 1,
        costCents: 1,
        netCents: 0,
      },
      {
        bucket: "taxableBroadIndexCents",
        grossCents: 1,
        costCents: 0,
        netCents: 1,
      },
    ]);
  });

  it("returns an empty fully funded plan for zero required cash", () => {
    expect(
      planV2ObligationFunding(state(), moneyCents(0), ratePpm(1_000_000)),
    ).toMatchObject({
      cashUsedCents: 0,
      taxableLiquidations: [],
      grossLiquidationCents: 0,
      liquidationCostCents: 0,
      netLiquidationProceedsCents: 0,
      creditUsedCents: 0,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
  });

  it("rejects invalid amounts and liquidation rates", () => {
    const unsafeAmount = (Number.MAX_SAFE_INTEGER + 1) as MoneyCents;

    expect(() =>
      planV2ObligationFunding(state(), moneyCents(-1), ratePpm(0)),
    ).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      planV2ObligationFunding(state(), unsafeAmount, ratePpm(0)),
    ).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      netTaxableLiquidationValueV2(moneyCents(-1), ratePpm(0)),
    ).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      minimumGrossTaxableLiquidationV2(
        moneyCents(1),
        moneyCents(-1),
        ratePpm(0),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() =>
      planV2ObligationFunding(state(), moneyCents(0), ratePpm(-1)),
    ).toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
    expect(() =>
      planV2ObligationFunding(state(), moneyCents(0), ratePpm(1_000_001)),
    ).toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
  });

  it("excludes retirement, HSA, home, and other restricted assets", () => {
    const plan = planV2ObligationFunding(
      stateWithRestrictedAssets(),
      moneyCents(500_001),
      ratePpm(0),
    );

    expect(plan).toMatchObject({
      cashUsedCents: 500_000,
      taxableLiquidations: [],
      grossLiquidationCents: 0,
      creditUsedCents: 0,
      residualShortfallCents: 1,
      fullyFunded: false,
    });
  });
});

describe("v2 obligation funding plan execution", () => {
  it("executes the supplied plan totals and bucket amounts exactly", () => {
    const initial = state();
    const plan = planV2ObligationFunding(
      initial,
      moneyCents(1_000_000),
      ratePpm(100_000),
    );

    const result = executeV2ObligationFunding(initial, "turn.execute", plan);

    expect(result.record).toEqual({
      grossLiquidationCents: plan.grossLiquidationCents,
      liquidationCostCents: plan.liquidationCostCents,
      netLiquidationProceedsCents: plan.netLiquidationProceedsCents,
      creditDrawnCents: plan.creditUsedCents,
      liquidatedBuckets: {
        taxableLegacyUnclassifiedCents: 0,
        taxableSpeculativeCents: 400_000,
        taxableSectorCents: 500_000,
        taxableBroadIndexCents: 100_000,
      },
    });
    expect(result.state.finances).toMatchObject({
      cashCents: 1_000_000,
      taxableInvestmentsCents: 500_000,
      creditUsedCents: 0,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.taxableLiquidations)).toBe(true);
    expect(plan.taxableLiquidations.every(Object.isFrozen)).toBe(true);
  });

  it("rejects an incomplete plan without changing state", () => {
    const initial = state();
    const plan = planV2ObligationFunding(
      initial,
      moneyCents(2_450_001),
      ratePpm(100_000),
    );

    expect(() =>
      executeV2ObligationFunding(initial, "turn.incomplete", plan),
    ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_LIQUIDITY" }));
    expect(initial.ledger.transactions).toHaveLength(1);
    expect(initial.finances).toMatchObject({
      cashCents: 100_000,
      taxableInvestmentsCents: 1_500_000,
      creditUsedCents: 0,
    });
  });

  it("rejects a plan whose aggregate totals do not match its bucket lines", () => {
    const initial = state();
    const plan = planV2ObligationFunding(
      initial,
      moneyCents(1_000_000),
      ratePpm(100_000),
    );
    const inconsistentPlan = {
      ...plan,
      grossLiquidationCents: moneyCents(plan.grossLiquidationCents + 1),
    };

    expect(() =>
      executeV2ObligationFunding(initial, "turn.inconsistent", inconsistentPlan),
    ).toThrow(expect.objectContaining({ code: "PLAN_MISMATCH" }));
    expect(initial.ledger.transactions).toHaveLength(1);
  });
});

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
