import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import {
  calculateNetWorth,
  createInitialGameState,
  type DeterministicGameOutcomeV1,
  type FinancialSnapshot,
} from "../../../core/game-state";
import { calculateGoalInvestableAssets } from "../../../core/financial-goals-v2";
import {
  migrateGameStateV1ToV2,
  type GameStateV2,
} from "../../../core/game-state-v2";
import { recordExposureSnapshotV2 } from "../../../core/exposure-v2";
import { analyzeRiskV1 } from "../../../core/risk-v1";
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
      version: "ai-game-context-v2",
      month: "2026-07",
      finances: {
        cashCents: 100_000,
        investableAssetsCents: 940_000,
        netWorthCents: 9_940_000,
      },
      learning: { audienceLevel: "beginner", concepts: [] },
    });
    expect(context).not.toHaveProperty("ledger");
    expect(context).not.toHaveProperty("acceptedCommandIds");
    expect(context.finances.investableAssetsCents).toBe(
      calculateGoalInvestableAssets(current.finances),
    );
    expect(context.finances.netWorthCents).toBe(
      calculateNetWorth(current.finances),
    );
    expect(context.finances).not.toHaveProperty("automaticLiquidityCents");
    expect(contextEvidence(context)).toHaveLength(10);
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

  it("derives current Risk v1 after a non-month state change instead of exporting stale Exposure", () => {
    const exposed = recordExposureSnapshotV2(state());
    const current = {
      ...exposed,
      finances: {
        ...exposed.finances,
        cashCents: moneyCents(2_000_000),
      },
    } as GameStateV2;
    const context = buildAiGameContext(current);

    expect(context).not.toHaveProperty("exposure");
    expect(context.risk).toEqual(analyzeRiskV1(current));
    expect(contextEvidence(context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "context.risk.emergency_fund_months",
          value: `${analyzeRiskV1(current).metrics.emergency_fund_months.rawValue} months_ppm`,
        }),
      ]),
    );
  });

  it("uses persisted rich terminal amounts as immutable debrief evidence", () => {
    const current = state();
    const outcome: DeterministicGameOutcomeV1 = {
      outcomePolicyVersion: "1.0.0",
      kind: "retirement_age",
      grade: "B",
      reachedMonth: current.currentMonth,
      reasonCode: "configured_retirement_age_reached",
      reasonCodes: [
        "configured_retirement_age_reached",
        "financial_independence_target_not_reached",
      ],
      financialIndependence: {
        goalSource: "current_lifestyle_default",
        investableAssetsCents: moneyCents(1_000_000),
        targetCents: moneyCents(2_000_000),
        progressPpm: ratePpm(500_000),
      },
      displayedNetWorthCents: moneyCents(1_250_000),
      automaticLiquidSolvency: {
        requiredCashCents: moneyCents(50_000),
        automaticLiquidityCents: moneyCents(200_000),
        residualShortfallCents: moneyCents(0),
        isSolvent: true,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        currentAgeYears: 65,
        reachedRetirementAge: true,
        gradeIfRetiredNow: "B",
      },
    };
    const terminal = { ...current, outcome } as GameStateV2;
    const context = buildAiGameContext(terminal);

    expect(context.goal).toMatchObject({
      targetCents: 2_000_000,
      progressPpm: 500_000,
    });
    expect(context.finances).toMatchObject({
      investableAssetsCents: 1_000_000,
      netWorthCents: 1_250_000,
    });
    expect(contextEvidence(context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "context.fi_progress",
          value: "500000 ppm",
        }),
        expect.objectContaining({
          id: "context.investable",
          value: "1000000 cents",
        }),
        expect.objectContaining({
          id: "context.fi_target",
          value: "2000000 cents",
        }),
        expect.objectContaining({
          id: "context.net_worth",
          value: "1250000 cents",
        }),
      ]),
    );
  });
});
