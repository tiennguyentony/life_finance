import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../core/canonical";
import { advanceEventEpochsV1 } from "../../core/world-random-v1";
import {
  OfflineBalanceLabV1Error,
  type BalanceLabRunSpecV1,
} from "../balance-lab-v1-contracts";
import {
  runOfflineBalanceLabV1,
  type BalanceLabProductionOwnersV1,
} from "../balance-lab-v1-runner";

type State = Readonly<{
  personaId: string;
  matchedSeed: number;
  month: number;
  botId?: string;
}>;
type Record = Readonly<{ month: number }>;

const spec: BalanceLabRunSpecV1 = {
  version: "offline-balance-lab-v1",
  experimentId: "runner-unit",
  personaIds: ["persona-a"],
  matchedSeeds: [11, 22],
  botIds: ["disciplined-v1", "random-control-v1"],
  horizonMonths: 3,
  difficulty: "normal",
};

function owners(
  divergeWorldForRandom = false,
  bankruptcyMode: "none" | "random_only" | "all" = "none",
): BalanceLabProductionOwnersV1<State, Record> {
  return {
    createOpeningState: ({ personaId, matchedSeed }) =>
      Object.freeze({ personaId, matchedSeed, month: 0 }),
    checksumState: sha256Canonical,
    applyBotPolicy: ({ state, policy, botRandom }) => ({
      state: Object.freeze({ ...state, botId: policy.id }),
      nextBotRandom: botRandom,
    }),
    processMonth: ({ state, worldRandom, monthIndex }) => {
      const nextWorld = advanceEventEpochsV1(worldRandom);
      const divergent = divergeWorldForRandom && state.botId === "random-control-v1";
      return {
        state: Object.freeze({ ...state, month: state.month + 1 }),
        record: Object.freeze({ month: monthIndex }),
        worldRandom: nextWorld,
        worldEvidence: Object.freeze({
          monthIndex,
          macroEvidenceHash: sha256Canonical({ monthIndex, macro: worldRandom.macro }),
          rawOpportunityFingerprint: sha256Canonical({
            monthIndex,
            epoch: worldRandom.eventOpportunity,
            divergent,
          }),
          nextMacroStateValue: nextWorld.macro.value,
          nextOpportunityEpochValue: nextWorld.eventOpportunity.value,
        }),
        terminal: false,
      };
    },
    readAuthoritativeMetrics: ({ state, processedMonths }) => ({
      endReason: bankruptcyMode === "all" ||
          (bankruptcyMode === "random_only" && state.botId === "random-control-v1")
        ? "bankruptcy"
        : "active",
      grade: null,
      retirementFiProgressPpm: 250_000,
      displayedNetWorthCents: state.botId === "disciplined-v1" ? 2_000_000 : 1_000_000,
      liquidSolvencyCents: 500_000,
      highInterestDebtCreatedCents: 0,
      interestPaidCents: 1_000,
      forcedSaleCount: 0,
      eventCountByTier: { micro: 1, medium: 0, large: 0, catastrophe: 0 },
      catastropheCount: 0,
      recoveryMonths: [],
      lessonIds: ["emergency-fund"],
      noEventMonths: processedMonths - 1,
      unavoidableFailure: false,
      bankruptcyResidualShortfallCents:
        bankruptcyMode === "all" ||
        (bankruptcyMode === "random_only" && state.botId === "random-control-v1")
          ? 1
          : 0,
      objectiveValues: { displayedNetWorthCents: state.botId === "disciplined-v1" ? 2_000_000 : 1_000_000 },
    }),
  };
}

describe("offline balance lab v1 runner", () => {
  it("completes bounded matched runs exactly and keeps random-bot state outside world state", () => {
    const first = runOfflineBalanceLabV1(spec, owners());
    const second = runOfflineBalanceLabV1(spec, owners());

    expect(first).toEqual(second);
    expect(first.runs).toHaveLength(4);
    expect(first.runs.every((run) => run.processedMonths === 3)).toBe(true);
    expect(first.deterministicResultFingerprint).toHaveLength(64);
    expect(first.runs.every((run) => run.botIntents.length === 3)).toBe(true);
    expect(
      first.runs.every((run) =>
        run.botIntents.every((intent, monthIndex) => intent.monthIndex === monthIndex),
      ),
    ).toBe(true);
    for (const matchedSeed of spec.matchedSeeds) {
      const cohort = first.runs.filter((run) => run.matchedSeed === matchedSeed);
      expect(cohort[0]!.worldEvidence).toEqual(cohort[1]!.worldEvidence);
      expect(cohort[0]!.initialWorldRandom).toEqual(cohort[1]!.initialWorldRandom);
    }
  });

  it("fails instead of publishing an unmatched world comparison", () => {
    expect(() => runOfflineBalanceLabV1(spec, owners(true))).toThrow(
      expect.objectContaining<Partial<OfflineBalanceLabV1Error>>({
        code: "MATCHED_WORLD_DIVERGENCE",
      }),
    );
  });

  it("labels failure unavoidable only when every matched strategy has residual bankruptcy", () => {
    const strategyCaused = runOfflineBalanceLabV1(spec, owners(false, "random_only"));
    const cohortWide = runOfflineBalanceLabV1(spec, owners(false, "all"));

    expect(strategyCaused.runs.every(({ metrics }) => !metrics.unavoidableFailure)).toBe(true);
    expect(cohortWide.runs.every(({ metrics }) => metrics.unavoidableFailure)).toBe(true);
  });
});
