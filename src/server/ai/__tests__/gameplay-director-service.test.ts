import { describe, expect, it, vi } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import { analyzeRiskV1 } from "../../../core/risk-v1";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import type { ScenarioDirectorInputV2 } from "../../../core/scenario-director-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import type { ScenarioDirectorRequest } from "../contracts";
import {
  GameplayDirectorService,
  gameplayDirectorConfigFromEnvironment,
} from "../gameplay-director-service";

function directorInput(): ScenarioDirectorInputV2 {
  const resolved = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: [],
    scenarioId: "scenario.fresh_start",
  });
  const state = createNativeGameStateV2({
    runId: "run.gameplay-ai",
    playerId: "player.gameplay-ai",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "gameplay-ai",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(100_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(100_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  });
  return {
    version: "scenario-director-v2",
    month: state.currentMonth,
    riskSnapshot: analyzeRiskV1(state),
    macro: { regime: state.marketRegime, tags: [] },
    candidates: [
      {
        templateId: "event.liquidity",
        templateVersion: 1,
        category: "maintenance",
        tier: "medium",
        targetedWeakness: "low_emergency_fund",
        lessonTags: { primary: "lesson.liquidity", secondary: [] },
        directorTags: [],
      },
      {
        templateId: "event.career",
        templateVersion: 1,
        category: "career",
        tier: "micro",
        targetedWeakness: "unrelated_hazard",
        lessonTags: { primary: "lesson.income", secondary: [] },
        directorTags: [],
      },
    ],
    recentDecisions: [],
    recentEvents: [],
    lessonExposureCounts: [],
    difficulty: "normal",
  };
}

function responseFor(request: ScenarioDirectorRequest) {
  return {
    version: "scenario-director-ai-response-v1" as const,
    candidateSetChecksum: request.director.candidateSetChecksum,
    ranked: [...request.director.candidates].reverse().map(
      ({ templateId, templateVersion, intendedLesson, reasonCodes }) => ({
        templateId,
        templateVersion,
        intendedLesson,
        reasonCodes,
      }),
    ),
  };
}

describe("gameplay AI director", () => {
  it("is explicitly opt-in and parses bounded operational settings", () => {
    expect(gameplayDirectorConfigFromEnvironment({}).mode).toBe("off");
    expect(gameplayDirectorConfigFromEnvironment({
      AI_GAMEPLAY_MODE: "active",
      AI_GAMEPLAY_TIMEOUT_MS: "1200",
      AI_GAMEPLAY_SAMPLE_EVERY_MONTHS: "1",
    })).toMatchObject({ mode: "active", timeoutMs: 1200, sampleEveryMonths: 1 });
  });

  it("persists a compact override only in active mode after validation", async () => {
    const generate = vi.fn(async (request: ScenarioDirectorRequest) =>
      responseFor(request),
    );
    const service = new GameplayDirectorService(
      () => ({ generate, responseSource: () => "hosted_oss" }),
      gameplayDirectorConfigFromEnvironment({
        AI_GAMEPLAY_MODE: "active",
        AI_GAMEPLAY_SAMPLE_EVERY_MONTHS: "1",
      }),
    );
    const result = await service.rank("run.private", directorInput());

    expect(result?.evidence).toMatchObject({
      mode: "active",
      source: "hosted_oss",
      status: "validated",
      candidateCount: 2,
    });
    expect(result?.rankingOverride?.ranked.map(({ templateId }) => templateId))
      .toEqual(["event.career", "event.liquidity"]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("records shadow comparison without changing gameplay order", async () => {
    const service = new GameplayDirectorService(
      () => ({
        generate: async (request: ScenarioDirectorRequest) => responseFor(request),
        responseSource: () => "local_oss",
      }),
      gameplayDirectorConfigFromEnvironment({
        AI_GAMEPLAY_MODE: "shadow",
        AI_GAMEPLAY_SAMPLE_EVERY_MONTHS: "1",
      }),
    );
    const result = await service.rank("run.private", directorInput());
    expect(result?.evidence).toMatchObject({ mode: "shadow", status: "validated" });
    expect(result?.rankingOverride).toBeUndefined();
  });
});
