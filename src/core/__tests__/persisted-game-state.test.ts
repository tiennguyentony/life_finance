import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2 } from "../game-state-v2";
import { assessTerminalOutcomeV2 } from "../outcomes";
import {
  decodePersistedGameState,
  PersistedGameStateDecodeError,
} from "../persisted-game-state";

function v1Fixture() {
  return createInitialGameState({
    runId: "run.persisted-decoder",
    startMonth: "2026-07",
    randomSeed: "persisted-decoder",
    player: {
      playerId: "player.persisted-decoder",
      birthMonth: "1990-01",
      locationId: "location.seattle",
      careerTrackId: "career.software",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_00),
      taxableInvestmentsCents: moneyCents(200_00),
      retirementCents: moneyCents(300_00),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(500_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(1_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function richTerminalFixture() {
  const v2 = migrateGameStateV1ToV2(v1Fixture());
  const requiredCashCents = moneyCents(601_00);
  const automaticLiquidityCents = moneyCents(600_00);
  const residualShortfallCents = moneyCents(1_00);
  const fundingPlan = Object.freeze({
    requiredCashCents,
    cashAvailableCents: automaticLiquidityCents,
    cashUsedCents: automaticLiquidityCents,
    taxableLiquidations: Object.freeze([]),
    grossLiquidationCents: moneyCents(0),
    liquidationCostCents: moneyCents(0),
    netLiquidationProceedsCents: moneyCents(0),
    remainingCreditCents: moneyCents(0),
    creditUsedCents: moneyCents(0),
    residualShortfallCents,
    fullyFunded: false,
  });
  const outcome = assessTerminalOutcomeV2(v2, {
    requiredCashCents,
    closingAutomaticLiquidityCents: automaticLiquidityCents,
    fundingPlan,
    shortfall: Object.freeze({
      requiredCashCents,
      residualShortfallCents,
      fundingPlan,
      netWorthCents: moneyCents(600_00),
      automaticLiquidityCents,
    }),
  }, "1.0.0");
  if (outcome === null || !("outcomePolicyVersion" in outcome)) {
    throw new Error("fixture must produce a rich deterministic outcome");
  }
  return { ...v2, outcome };
}

describe("persisted game-state decoder", () => {
  it("decodes and deeply freezes every supported schema", () => {
    const v1 = JSON.parse(JSON.stringify(v1Fixture())) as unknown;
    const v2 = JSON.parse(
      JSON.stringify(migrateGameStateV1ToV2(v1Fixture())),
    ) as unknown;

    const decodedV1 = decodePersistedGameState(v1);
    const decodedV2 = decodePersistedGameState(v2);

    expect(decodedV1.schemaVersion).toBe(1);
    expect(decodedV2.schemaVersion).toBe(2);
    expect(Object.isFrozen(decodedV1.ledger.transactions)).toBe(true);
    expect(
      decodedV2.schemaVersion === 2 &&
        Object.isFrozen(decodedV2.gameplay.recurringStrategy),
    ).toBe(true);
  });

  it("rejects unsupported, malformed, and internally inconsistent states", () => {
    expect(() => decodePersistedGameState(null)).toThrow(
      PersistedGameStateDecodeError,
    );
    expect(() => decodePersistedGameState({ schemaVersion: 3 })).toThrow(
      "unsupported schema version",
    );
    expect(() =>
      decodePersistedGameState({
        ...v1Fixture(),
        finances: { ...v1Fixture().finances, cashCents: -1 },
      }),
    ).toThrow("violates its versioned invariants");
  });

  it("round-trips rich deterministic outcome evidence without checksum drift", () => {
    const terminal = richTerminalFixture();
    const persisted = JSON.parse(JSON.stringify(terminal)) as unknown;
    const decoded = decodePersistedGameState(persisted);

    expect(decoded.outcome).toEqual(terminal.outcome);
    expect(sha256Canonical(decoded)).toBe(sha256Canonical(terminal));
    expect(Object.isFrozen(decoded.outcome)).toBe(true);
  });

  it.each([
    [
      "projection arithmetic",
      (terminal: ReturnType<typeof richTerminalFixture>) => ({
        ...terminal,
        outcome: {
          ...terminal.outcome,
          financialIndependence: {
            ...terminal.outcome.financialIndependence,
            progressPpm: ratePpm(
              terminal.outcome.financialIndependence.progressPpm + 1,
            ),
          },
        },
      }),
    ],
    [
      "gradeIfRetiredNow",
      (terminal: ReturnType<typeof richTerminalFixture>) => ({
        ...terminal,
        outcome: {
          ...terminal.outcome,
          retirementReadiness: {
            ...terminal.outcome.retirementReadiness,
            gradeIfRetiredNow: "D",
          },
        },
      }),
    ],
    [
      "displayed net worth",
      (terminal: ReturnType<typeof richTerminalFixture>) => ({
        ...terminal,
        outcome: {
          ...terminal.outcome,
          displayedNetWorthCents: moneyCents(
            terminal.outcome.displayedNetWorthCents + 1,
          ),
        },
      }),
    ],
    [
      "current age",
      (terminal: ReturnType<typeof richTerminalFixture>) => ({
        ...terminal,
        outcome: {
          ...terminal.outcome,
          retirementReadiness: {
            ...terminal.outcome.retirementReadiness,
            currentAgeYears:
              terminal.outcome.retirementReadiness.currentAgeYears + 1,
          },
        },
      }),
    ],
    [
      "outcome kind and grade consistency",
      (terminal: ReturnType<typeof richTerminalFixture>) => ({
        ...terminal,
        outcome: {
          ...terminal.outcome,
          kind: "financial_independence",
          grade: "S",
          reasonCode: "financial_independence_target_reached",
          reasonCodes: ["financial_independence_target_reached"],
        },
      }),
    ],
  ] as const)("rejects rich outcome with mismatched %s", (_label, corrupt) => {
    expect(() => decodePersistedGameState(corrupt(richTerminalFixture()))).toThrow(
      "violates its versioned invariants",
    );
  });
});
