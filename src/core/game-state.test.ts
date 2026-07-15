import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import {
  calculateAutomaticLiquidity,
  calculateNetWorth,
  createInitialGameState,
  hasReachedFinancialIndependence,
  InvalidGameStateError,
  validateGameState,
  type FinancialSnapshot,
} from "./game-state";

function finances(
  overrides: Partial<FinancialSnapshot> = {},
): FinancialSnapshot {
  return {
    cashCents: moneyCents(100_00),
    taxableInvestmentsCents: moneyCents(200_00),
    retirementCents: moneyCents(300_00),
    homeValueCents: moneyCents(400_00),
    otherInvestableAssetsCents: moneyCents(50_00),
    otherAssetsCents: moneyCents(25_00),
    nonCreditLiabilitiesCents: moneyCents(150_00),
    creditLimitCents: moneyCents(100_00),
    creditUsedCents: moneyCents(20_00),
    annualLivingCostCents: moneyCents(1_000_00),
    requiredObligationsCents: moneyCents(10_00),
    ...overrides,
  };
}

function initialState(overrides: Partial<FinancialSnapshot> = {}) {
  return createInitialGameState({
    runId: "run_test",
    startMonth: "2026-07",
    randomSeed: "seed",
    player: {
      playerId: "player_test",
      birthMonth: "1996-02",
      locationId: "US-CA",
      careerTrackId: "software_engineer",
      filingStatus: "single",
    },
    finances: finances(overrides),
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

describe("GameState", () => {
  it("creates a deeply frozen, versioned initial aggregate", () => {
    const state = initialState();

    expect(state.schemaVersion).toBe(1);
    expect(state.engineVersion).toBe("4.0.0");
    expect(state.revision).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.finances)).toBe(true);
    expect(Object.isFrozen(state.acceptedCommandIds)).toBe(true);
    expect(state.ledger.transactions).toHaveLength(1);
  });

  it("rejects invalid money, credit, dates, and wellbeing together", () => {
    expect(() =>
      createInitialGameState({
        ...initialState(),
        startMonth: "2026-07",
        randomSeed: 1,
        player: { ...initialState().player, birthMonth: "2027-01" },
        finances: finances({
          cashCents: moneyCents(-1),
          creditLimitCents: moneyCents(10),
          creditUsedCents: moneyCents(11),
        }),
        wellbeing: {
          burnoutPpm: ratePpm(1_000_001),
          happinessPpm: ratePpm(0),
        },
      }),
    ).toThrow(InvalidGameStateError);

    try {
      createInitialGameState({
        runId: "run_test",
        startMonth: "2026-07",
        randomSeed: 1,
        player: {
          ...initialState().player,
          birthMonth: "2027-01",
        },
        finances: finances({
          cashCents: moneyCents(-1),
          creditLimitCents: moneyCents(10),
          creditUsedCents: moneyCents(11),
        }),
        wellbeing: {
          burnoutPpm: ratePpm(1_000_001),
          happinessPpm: ratePpm(0),
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidGameStateError);
      expect((error as InvalidGameStateError).violations.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "future_birth",
          "invalid_money",
          "credit_limit_exceeded",
          "invalid_wellbeing",
        ]),
      );
    }
  });

  it("detects replay revision and command identifier inconsistencies", () => {
    const state = initialState();
    const corrupted = {
      ...state,
      revision: 2,
      acceptedCommandIds: ["same", "same"],
    };

    expect(validateGameState(corrupted).map(({ code }) => code)).toContain(
      "duplicate_command",
    );
  });
});

describe("financial invariants", () => {
  it("includes all assets and liabilities in displayed net worth", () => {
    expect(calculateNetWorth(finances())).toBe(905_00);
  });

  it("limits automatic liquidity to cash, taxable investments, and credit", () => {
    expect(calculateAutomaticLiquidity(finances())).toBe(380_00);
  });

  it("checks FI against 25 times annual living costs without overflow", () => {
    expect(
      hasReachedFinancialIndependence(
        finances({
          taxableInvestmentsCents: moneyCents(1_000_000_00),
          retirementCents: moneyCents(1_000_000_00),
          otherInvestableAssetsCents: moneyCents(500_000_00),
          annualLivingCostCents: moneyCents(100_000_00),
        }),
      ),
    ).toBe(true);
  });

  it("counts liquid cash toward FI while continuing to exclude home equity", () => {
    expect(
      hasReachedFinancialIndependence(
        finances({
          cashCents: moneyCents(25_000_00),
          taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(0),
          otherInvestableAssetsCents: moneyCents(0),
          homeValueCents: moneyCents(10_000_000_00),
          annualLivingCostCents: moneyCents(1_000_00),
        }),
      ),
    ).toBe(true);
  });
});
