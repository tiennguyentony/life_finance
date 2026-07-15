import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { addMonths } from "../domain/month";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, type GameStateV2 } from "../game-state-v2";
import {
  activeMacroReturnModifiersV2,
  advanceMacroStoriesV2,
} from "../macro-story-v2";
import { marketSimulationState, simulateMarketMonth } from "../market";

function state() {
  return migrateGameStateV1ToV2(
    createInitialGameState({
      runId: "run.macro-story-v2",
      startMonth: "2026-07",
      randomSeed: "macro-story-v2",
      player: {
        playerId: "player.macro-story-v2",
        birthMonth: "1990-01",
        locationId: "US-WA",
        careerTrackId: "software",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(1_000_000),
        taxableInvestmentsCents: moneyCents(2_000_000),
        retirementCents: moneyCents(0),
        homeValueCents: moneyCents(1_000_000),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(1_000_000),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(1_200_000),
        requiredObligationsCents: moneyCents(100_000),
      },
      wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
      marketRegime: "expansion",
    }),
  );
}

describe("v2 macro story lifecycle", () => {
  it("persists bounded multi-month modifiers and expires them predictably", () => {
    const initial = state();
    const scheduled = advanceMacroStoriesV2(initial, {
      version: "macro-story-v1",
      monthlyChancePpm: 1_000_000,
      minimumDurationMonths: 2,
      maximumDurationMonths: 2,
    });
    const story = scheduled.gameplay.eventLifecycle.macroStories[0]!;
    expect(story).toMatchObject({
      startedMonth: "2026-07",
      expiresMonth: "2026-08",
      templateVersion: 1,
    });
    expect(scheduled.gameplay.eventLifecycle.activeStoryIds).toEqual([
      story.storyId,
    ]);
    expect(activeMacroReturnModifiersV2(scheduled)).toEqual(
      story.returnModifiersPpm,
    );

    const baseMarket = simulateMarketMonth(
      marketSimulationState(
        scheduled.marketRegime,
        scheduled.random,
        scheduled.gameplay.market.monthsInRegime,
      ),
    );
    const modifiedMarket = simulateMarketMonth(
      marketSimulationState(
        scheduled.marketRegime,
        scheduled.random,
        scheduled.gameplay.market.monthsInRegime,
      ),
      activeMacroReturnModifiersV2(scheduled),
    );
    expect(modifiedMarket.nextState).toEqual(baseMarket.nextState);
    expect(modifiedMarket.month.appliedReturnModifiersPpm).toEqual(
      story.returnModifiersPpm,
    );

    const expired = advanceMacroStoriesV2(
      {
        ...scheduled,
        currentMonth: addMonths(scheduled.currentMonth, 2),
      } as GameStateV2,
      {
        version: "macro-story-v1",
        monthlyChancePpm: 0,
        minimumDurationMonths: 2,
        maximumDurationMonths: 2,
      },
    );
    expect(expired.gameplay.eventLifecycle.macroStories).toEqual([]);
    expect(expired.gameplay.eventLifecycle.activeStoryIds).toEqual([]);
  });
});
