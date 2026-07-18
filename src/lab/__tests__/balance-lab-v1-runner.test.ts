import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../core/canonical";
import { simulationMonth } from "../../core/domain/month";
import { advanceEventEpochsV1 } from "../../core/world-random-v1";
import {
  OfflineBalanceLabV1Error,
  type BalanceLabRunSpecV1,
} from "../balance-lab-v1-contracts";
import {
  assembleOfflineBalanceLabResultV1,
  runOfflineBalanceLabV1,
  type BalanceLabProductionOwnersV1,
} from "../balance-lab-v1-runner";
import { runOfflineBalanceLabShardsV1 } from "../balance-lab-v1-parallel";

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
  observeBalance = false,
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
    ...(observeBalance
      ? {
          observeBalance: ({ state, monthIndex }: {
            state: State;
            record: Record | undefined;
            monthIndex: number;
          }) =>
            Object.freeze({
              version: "balance-lab-balance-observation-v1" as const,
              monthIndex,
              stage: monthIndex === -1 ? "opening" as const : "monthly" as const,
              month: simulationMonth(`2026-${String(Math.min(12, state.month + 1)).padStart(2, "0")}`),
              difficulty: "normal" as const,
              preparedness: Object.freeze({
                version: "preparedness-assessment-v1" as const,
                riskVersion: "risk-v1" as const,
                asOfMonth: simulationMonth("2026-01"),
                scorePpm: 500_000,
                band: "stable" as const,
                components: Object.freeze({
                  liquidityPpm: 500_000,
                  cashFlowPpm: 500_000,
                  debtPpm: 500_000,
                  insurancePpm: 500_000,
                  diversificationPpm: 500_000,
                }),
              }),
              candidateChallenges: Object.freeze([]),
              approvedChallenge: null,
            }),
        }
      : {}),
    readAuthoritativeMetrics: ({ state, processedMonths, balanceObservations }) => ({
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
      ...(observeBalance ? { balanceObservations } : {}),
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

  it("collects opening and monthly shadow observations without changing outcomes or random state", () => {
    const withoutShadow = runOfflineBalanceLabV1(spec, owners());
    const withShadow = runOfflineBalanceLabV1(spec, owners(false, "none", true));

    expect(withShadow.runs[0]!.metrics.balanceObservations).toHaveLength(4);
    expect(withShadow.runs[0]!.metrics.balanceObservations?.map(({ monthIndex }) => monthIndex))
      .toEqual([-1, 0, 1, 2]);
    expect(withShadow.runs.map(({ finalStateChecksum }) => finalStateChecksum))
      .toEqual(withoutShadow.runs.map(({ finalStateChecksum }) => finalStateChecksum));
    expect(withShadow.runs.map(({ finalWorldRandom }) => finalWorldRandom))
      .toEqual(withoutShadow.runs.map(({ finalWorldRandom }) => finalWorldRandom));
    expect(withShadow.runs.map(({ botRandomFinal }) => botRandomFinal))
      .toEqual(withoutShadow.runs.map(({ botRandomFinal }) => botRandomFinal));
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

  it("assembles seed shards into the exact canonical full-cohort result", () => {
    const full = runOfflineBalanceLabV1(spec, owners());
    const firstShard = runOfflineBalanceLabV1(
      { ...spec, matchedSeeds: [spec.matchedSeeds[0]!] },
      owners(),
    );
    const secondShard = runOfflineBalanceLabV1(
      { ...spec, matchedSeeds: [spec.matchedSeeds[1]!] },
      owners(),
    );

    const assembled = assembleOfflineBalanceLabResultV1(
      spec,
      [...secondShard.runs, ...firstShard.runs],
    );

    expect(assembled).toEqual(full);
  });

  it("produces the exact same result with one or multiple asynchronous workers", async () => {
    const full = runOfflineBalanceLabV1(spec, owners());
    const runShard = async (shard: BalanceLabRunSpecV1) =>
      runOfflineBalanceLabV1(shard, owners());

    const singleWorker = await runOfflineBalanceLabShardsV1(spec, 1, runShard);
    const twoWorkers = await runOfflineBalanceLabShardsV1(spec, 2, runShard);

    expect(singleWorker).toEqual(full);
    expect(twoWorkers).toEqual(full);
  });
});
