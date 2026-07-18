import { describe, expect, it } from "vitest";

import { simulationMonth } from "../../core/domain/month";
import type { PreparednessBandV1 } from "../../core/preparedness-assessment-v1";
import type { BalanceLabBalanceObservationV1 } from "../balance-lab-balance-observation-v1";
import type { BalanceLabRunResultV1 } from "../balance-lab-v1-runner";
import { summarizeBalanceLabRunsV1 } from "../balance-lab-v1-metrics";

function observation(
  monthIndex: number,
  scorePpm: number,
  band: PreparednessBandV1,
  withChallenge = false,
): BalanceLabBalanceObservationV1 {
  const assessment = Object.freeze({
    version: "runtime-balance-challenge-v1" as const,
    scorePpm: 500_000,
    band: "meaningful" as const,
    limitingDimension: "burn_months" as const,
    ratios: Object.freeze({
      impactScorePpm: 300_000,
      burnMonthsPpm: 500_000,
      negativeCashFlowPpm: 250_000,
      recoveryTimePpm: 250_000,
    }),
  });
  const candidate = Object.freeze({
    templateId: "event.car-repair",
    templateVersion: 1,
    eventTier: "medium" as const,
    rank: 1,
    rejectionCodes: Object.freeze([]),
    assessment,
  });
  return Object.freeze({
    version: "balance-lab-balance-observation-v1",
    monthIndex,
    stage: monthIndex === -1 ? "opening" : "monthly",
    month: simulationMonth(monthIndex === -1 ? "2026-01" : "2026-02"),
    difficulty: "normal",
    preparedness: Object.freeze({
      version: "preparedness-assessment-v1",
      riskVersion: "risk-v1",
      asOfMonth: simulationMonth(monthIndex === -1 ? "2026-01" : "2026-02"),
      scorePpm,
      band,
      components: Object.freeze({
        liquidityPpm: scorePpm,
        cashFlowPpm: scorePpm,
        debtPpm: scorePpm,
        insurancePpm: scorePpm,
        diversificationPpm: scorePpm,
      }),
    }),
    candidateChallenges: withChallenge ? Object.freeze([candidate]) : Object.freeze([]),
    approvedChallenge: withChallenge ? candidate : null,
  });
}

function run(
  botId: BalanceLabRunResultV1["botId"],
  overrides: Partial<BalanceLabRunResultV1["metrics"]>,
): Pick<BalanceLabRunResultV1, "personaId" | "matchedSeed" | "botId" | "processedMonths" | "metrics"> {
  return {
    personaId: "healthy-v1",
    matchedSeed: 7,
    botId,
    processedMonths: 10,
    metrics: {
      endReason: "active",
      grade: null,
      retirementFiProgressPpm: 500_000,
      displayedNetWorthCents: 0,
      liquidSolvencyCents: 0,
      highInterestDebtCreatedCents: 0,
      interestPaidCents: 0,
      forcedSaleCount: 0,
      eventCountByTier: { micro: 0, medium: 0, large: 0, catastrophe: 0 },
      catastropheCount: 0,
      recoveryMonths: [],
      lessonIds: [],
      noEventMonths: 0,
      unavoidableFailure: false,
      objectiveValues: {},
      ...overrides,
    },
  };
}

describe("offline balance lab v1 metrics", () => {
  it("aggregates only authoritative production evidence and explicit no-event decisions", () => {
    const summary = summarizeBalanceLabRunsV1([
      run("disciplined-v1", {
        endReason: "financial_independence",
        grade: "A",
        displayedNetWorthCents: 1_000_000,
        liquidSolvencyCents: 400_000,
        interestPaidCents: 15_000,
        forcedSaleCount: 1,
        eventCountByTier: { micro: 2, medium: 1, large: 0, catastrophe: 0 },
        recoveryMonths: [3],
        lessonIds: ["cash-buffer", "cash-buffer", "insurance"],
        noEventMonths: 4,
        objectiveValues: {
          displayedNetWorthCents: 1_000_000,
          liquidSolvencyCents: 0,
        },
      }),
      run("debt-heavy-lifestyle-v1", {
        endReason: "bankruptcy",
        grade: "F",
        retirementFiProgressPpm: 100_000,
        displayedNetWorthCents: -100_000,
        liquidSolvencyCents: 10_000,
        highInterestDebtCreatedCents: 300_000,
        interestPaidCents: 45_000,
        eventCountByTier: { micro: 1, medium: 0, large: 0, catastrophe: 1 },
        catastropheCount: 1,
        lessonIds: ["cash-buffer"],
        noEventMonths: 2,
        unavoidableFailure: true,
        objectiveValues: {
          displayedNetWorthCents: -100_000,
          liquidSolvencyCents: 10_000,
        },
      }),
    ]);

    expect(summary.runCount).toBe(2);
    expect(summary.processedMonths).toBe(20);
    expect(summary.bankruptcyRate).toMatchObject({
      numerator: 1,
      denominator: 2,
      ratePpm: 500_000,
    });
    expect(summary.bankruptcyRate.confidenceInterval95Ppm).toEqual({
      lower: expect.any(Number),
      upper: expect.any(Number),
    });
    expect(summary.fiAchievementRate.ratePpm).toBe(500_000);
    expect(summary.gradeDistribution).toEqual({ A: 1, F: 1, active: 0 });
    expect(summary.meanDisplayedNetWorthCents).toBe(450_000);
    expect(summary.totalHighInterestDebtCreatedCents).toBe("300000");
    expect(summary.totalInterestPaidCents).toBe("60000");
    expect(summary.forcedSaleFrequencyPpm).toBe(50_000);
    expect(summary.eventCountByTier).toEqual({ micro: 3, medium: 1, large: 0, catastrophe: 1 });
    expect(summary.meanRecoveryMonths).toBe(3);
    expect(summary.lessonCoverage).toBe(2);
    expect(summary.repeatedLessonRatePpm).toBe(250_000);
    expect(summary.noEventRatePpm).toBe(300_000);
    expect(summary.unavoidableFailureRate.ratePpm).toBe(500_000);
    expect(summary.matchedObjectiveResults).toEqual([
      {
        objectiveId: "displayedNetWorthCents",
        cohortCount: 1,
        wins: { "disciplined-v1": 1, "debt-heavy-lifestyle-v1": 0 },
        ties: 0,
      },
      {
        objectiveId: "liquidSolvencyCents",
        cohortCount: 1,
        wins: { "disciplined-v1": 0, "debt-heavy-lifestyle-v1": 1 },
        ties: 0,
      },
    ]);
    expect(summary.preparedVsRecklessBankruptcyDeltaPpm).toBe(1_000_000);
    expect(summary.healthyPersonaUnavoidableFailureRatePpm).toBe(500_000);
    expect(summary.matchedStrategyWinRatePpm).toBe(500_000);
    expect(summary.maximumStrategyObjectiveLeadSharePpm).toBe(500_000);
    expect(summary.impactReductionRatePpm).toBe(0);
    expect(summary.majorEventPacingPpm).toBe(0);
  });

  it("does not infer no-event months from active runs or absent lifecycle state", () => {
    const summary = summarizeBalanceLabRunsV1([run("cash-hoarder-v1", {})]);

    expect(summary.noEventRatePpm).toBe(0);
    expect(summary.balanceShadow.observationCount).toBe(0);
    expect(summary.balanceShadow.openingPreparednessMeanScorePpm).toBeNull();
  });

  it("summarizes preparedness, challenge, grouped failure, and recovery shadow evidence", () => {
    const prepared = run("disciplined-v1", {
      balanceObservations: [
        observation(-1, 800_000, "resilient"),
        observation(0, 700_000, "stable", true),
      ],
      recoveryObservations: [
        { eventMonthIndex: 0, status: "recovered", observedMonths: 5 },
      ],
    });
    const exposed = run("debt-heavy-lifestyle-v1", {
      endReason: "bankruptcy",
      unavoidableFailure: true,
      balanceObservations: [
        observation(-1, 200_000, "critical"),
        observation(0, 300_000, "exposed"),
      ],
    });

    const shadow = summarizeBalanceLabRunsV1([prepared, exposed]).balanceShadow;

    expect(shadow).toMatchObject({
      observationCount: 4,
      openingPreparednessMeanScorePpm: 500_000,
      terminalPreparednessMeanScorePpm: 500_000,
      openingPreparednessBands: {
        critical: 1,
        exposed: 0,
        stable: 0,
        resilient: 1,
      },
      terminalPreparednessBands: {
        critical: 0,
        exposed: 1,
        stable: 1,
        resilient: 0,
      },
      candidateChallengeBands: {
        light: 0,
        meaningful: 1,
        crisis: 0,
        extreme: 0,
        above_limit: 0,
      },
      approvedChallengeBands: {
        light: 0,
        meaningful: 1,
        crisis: 0,
        extreme: 0,
        above_limit: 0,
      },
      limitingDimensions: {
        impact_score: 0,
        burn_months: 1,
        negative_cash_flow: 0,
        recovery_time: 0,
      },
    });
    expect(shadow.challengeByDifficultyAndTier.normal.medium.meaningful).toBe(1);
    expect(shadow.bankruptcyByOpeningPreparednessBand.critical).toMatchObject({
      numerator: 1,
      denominator: 1,
      ratePpm: 1_000_000,
    });
    expect(shadow.bankruptcyByOpeningPreparednessBand.resilient).toMatchObject({
      numerator: 0,
      denominator: 1,
      ratePpm: 0,
    });
    expect(shadow.stableResilientUnavoidableFailureRate).toMatchObject({
      numerator: 0,
      denominator: 1,
      ratePpm: 0,
    });
    expect(shadow.nonfatalRecoveryWithinSixMonthsRate).toMatchObject({
      numerator: 1,
      denominator: 1,
      ratePpm: 1_000_000,
    });
  });

  it("measures prepared impact reduction only from matched relevant event outcomes", () => {
    const event = (
      eventId: string,
      playerCostCents: number,
      grossCostCents: number,
    ) => ({
      eventId,
      templateId: "personal.medical_bill",
      playerCostCents,
      grossCostCents,
    });
    const prepared = run("disciplined-v1", {
      eventImpactSamples: [event("evt.shared", 25_000, 100_000)],
    } as never);
    const reckless = run("debt-heavy-lifestyle-v1", {
      eventImpactSamples: [event("evt.shared", 100_000, 100_000)],
    } as never);
    const unrelated = run("aggressive-investor-v1", {
      eventImpactSamples: [event("evt.other", 0, 1_000_000)],
    } as never);

    const summary = summarizeBalanceLabRunsV1([prepared, reckless, unrelated]);

    expect(summary.impactReductionRatePpm).toBe(750_000);
    expect((summary as unknown as { acceptanceEvidence: Record<string, unknown> })
      .acceptanceEvidence.impact_reduction_rate_ppm).toEqual({
        numerator: 750_000,
        denominator: 1,
        observed: 750_000,
    });
  });

  it("reports Runtime Balance pacing violations rather than raw major-event frequency", () => {
    const summary = summarizeBalanceLabRunsV1([
      run("disciplined-v1", {
        eventCountByTier: { micro: 0, medium: 8, large: 0, catastrophe: 0 },
        majorEventPacingViolationCount: 1,
        majorEventPacingSampleCount: 4,
      } as never),
    ]);

    expect(summary.majorEventPacingPpm).toBe(250_000);
    expect((summary as unknown as { acceptanceEvidence: Record<string, unknown> })
      .acceptanceEvidence.major_event_pacing_ppm).toEqual({
        numerator: 1,
        denominator: 4,
        observed: 250_000,
    });
  });

  it("measures variance across seeds inside each persona and bot cohort", () => {
    const sample = (personaId: string, matchedSeed: number, value: number) => ({
      ...run("cash-hoarder-v1", {
        objectiveValues: { displayedNetWorthCents: value },
      }),
      personaId,
      matchedSeed,
    });

    const summary = summarizeBalanceLabRunsV1([
      sample("persona-a", 1, 0),
      sample("persona-a", 2, 10),
      sample("persona-b", 1, 1_000),
      sample("persona-b", 2, 1_010),
    ]);

    expect((summary as unknown as {
      objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot: unknown;
    }).objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot).toEqual({
      "persona-a": {
        displayedNetWorthCents: { "cash-hoarder-v1": "50" },
      },
      "persona-b": {
        displayedNetWorthCents: { "cash-hoarder-v1": "50" },
      },
    });
  });
});
