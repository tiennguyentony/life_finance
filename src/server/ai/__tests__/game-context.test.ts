import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import {
  calculateInvestableAssets,
  calculateNetWorth,
  createInitialGameState,
  type FinancialSnapshot,
} from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { buildAiGameContext, contextEvidence } from "../game-context";

function state(overrides: Partial<FinancialSnapshot> = {}) {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.ai-context",
    startMonth: "2026-07",
    randomSeed: "ai-context",
    player: {
      playerId: "player.ai-context",
      birthMonth: "1995-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000),
      taxableInvestmentsCents: moneyCents(200_000),
      retirementCents: moneyCents(300_000),
      homeValueCents: moneyCents(9_000_000),
      otherInvestableAssetsCents: moneyCents(400_000),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(50_000),
      creditLimitCents: moneyCents(100_000),
      creditUsedCents: moneyCents(10_000),
      annualLivingCostCents: moneyCents(600_000),
      requiredObligationsCents: moneyCents(50_000),
      ...overrides,
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

describe("AI game context assembler", () => {
  it("builds a minimized immutable snapshot without raw ledger or full command history", () => {
    const current = state();
    const context = buildAiGameContext(current);

    expect(context).toMatchObject({
      version: "ai-game-context-v1",
      month: "2026-07",
      finances: {
        cashCents: 100_000,
        investableAssetsCents: 1_000_000,
        netWorthCents: 9_940_000,
      },
      learning: { audienceLevel: "beginner", concepts: [] },
    });
    expect(context).not.toHaveProperty("ledger");
    expect(context).not.toHaveProperty("acceptedCommandIds");
    expect(context.finances.investableAssetsCents).toBe(
      calculateInvestableAssets(current.finances),
    );
    expect(context.finances.netWorthCents).toBe(
      calculateNetWorth(current.finances),
    );
    expect(context.finances).not.toHaveProperty("automaticLiquidityCents");
    expect(contextEvidence(context)).toHaveLength(6);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("uses canonical net worth for high restricted wealth", () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const restricted = state({
      cashCents: moneyCents(0),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(maximum - 1),
      homeValueCents: moneyCents(maximum),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(maximum),
      creditLimitCents: moneyCents(maximum),
      creditUsedCents: moneyCents(maximum),
    });

    expect(calculateNetWorth(restricted.finances)).toBe(-1);
    expect(buildAiGameContext(restricted).finances.netWorthCents).toBe(
      calculateNetWorth(restricted.finances),
    );
  });
});
