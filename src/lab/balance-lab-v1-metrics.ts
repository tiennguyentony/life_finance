import type { BalanceLabBotIdV1 } from "./balance-lab-v1-contracts";
import type {
  BalanceLabAuthoritativeMetricsV1,
  BalanceLabRunResultV1,
} from "./balance-lab-v1-runner";

export type BalanceLabMetricRunV1 = Pick<
  BalanceLabRunResultV1,
  "personaId" | "matchedSeed" | "botId" | "processedMonths" | "metrics"
>;

export type BalanceLabRateV1 = Readonly<{
  numerator: number;
  denominator: number;
  ratePpm: number;
  confidenceInterval95Ppm: Readonly<{ lower: number; upper: number }>;
}>;

export type BalanceLabMatchedObjectiveResultV1 = Readonly<{
  objectiveId: string;
  cohortCount: number;
  wins: Readonly<Partial<Record<BalanceLabBotIdV1, number>>>;
  ties: number;
}>;

export type BalanceLabMetricSummaryV1 = Readonly<{
  runCount: number;
  processedMonths: number;
  bankruptcyRate: BalanceLabRateV1;
  fiAchievementRate: BalanceLabRateV1;
  unavoidableFailureRate: BalanceLabRateV1;
  meanRetirementFiProgressPpm: number;
  gradeDistribution: Readonly<Record<string, number>>;
  meanDisplayedNetWorthCents: number;
  meanLiquidSolvencyCents: number;
  totalHighInterestDebtCreatedCents: string;
  totalInterestPaidCents: string;
  forcedSaleFrequencyPpm: number;
  eventCountByTier: BalanceLabAuthoritativeMetricsV1["eventCountByTier"];
  catastropheCount: number;
  meanRecoveryMonths: number | null;
  recoveryObservationCount: number;
  censoredRecoveryCount: number;
  lessonCoverage: number;
  repeatedLessonRatePpm: number;
  noEventRatePpm: number;
  preparedVsRecklessBankruptcyDeltaPpm: number;
  healthyPersonaUnavoidableFailureRatePpm: number;
  matchedStrategyWinRatePpm: number;
  maximumStrategyObjectiveLeadSharePpm: number;
  impactReductionRatePpm: number;
  majorEventPacingPpm: number;
  matchedObjectiveResults: readonly BalanceLabMatchedObjectiveResultV1[];
  objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot: Readonly<
    Record<
      string,
      Readonly<Record<string, Readonly<Partial<Record<BalanceLabBotIdV1, string>>>>>
    >
  >;
  acceptanceEvidence: Readonly<Record<string, Readonly<{
    numerator: number;
    denominator: number;
    observed: number;
  }>>>;
}>;

function rate(numerator: number, denominator: number): BalanceLabRateV1 {
  const interval = (() => {
    if (denominator === 0) return Object.freeze({ lower: 0, upper: 1_000_000 });
    const z = 1.959963984540054;
    const n = denominator;
    const proportion = numerator / n;
    const denominatorAdjustment = 1 + (z * z) / n;
    const center = (proportion + (z * z) / (2 * n)) / denominatorAdjustment;
    const margin =
      (z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * n)) / n)) /
      denominatorAdjustment;
    return Object.freeze({
      lower: Math.max(0, Math.floor((center - margin) * 1_000_000)),
      upper: Math.min(1_000_000, Math.ceil((center + margin) * 1_000_000)),
    });
  })();
  return Object.freeze({
    numerator,
    denominator,
    ratePpm:
      denominator === 0
        ? 0
        : Number((BigInt(numerator) * BigInt(1_000_000)) / BigInt(denominator)),
    confidenceInterval95Ppm: interval,
  });
}

function evidence(
  numerator: number,
  denominator: number,
): Readonly<{ numerator: number; denominator: number; observed: number }> {
  return Object.freeze({
    numerator,
    denominator,
    observed: denominator === 0
      ? 0
      : Number((BigInt(numerator) * BigInt(1_000_000)) / BigInt(denominator)),
  });
}

function meanInteger(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + BigInt(value), BigInt(0));
  return Number(sum / BigInt(values.length));
}

function sampleVariance(values: readonly number[]): string {
  if (values.length < 2) return "0";
  const count = BigInt(values.length);
  const sum = values.reduce((total, value) => total + BigInt(value), BigInt(0));
  const sumSquares = values.reduce(
    (total, value) => total + BigInt(value) * BigInt(value),
    BigInt(0),
  );
  return ((sumSquares * count - sum * sum) / (count * (count - BigInt(1)))).toString();
}

function matchedObjectives(
  runs: readonly BalanceLabMetricRunV1[],
): readonly BalanceLabMatchedObjectiveResultV1[] {
  const cohorts = new Map<string, BalanceLabMetricRunV1[]>();
  for (const run of runs) {
    const key = `${run.personaId}|${run.matchedSeed}`;
    const cohort = cohorts.get(key) ?? [];
    cohort.push(run);
    cohorts.set(key, cohort);
  }
  const objectiveIds = [...new Set(
    runs.flatMap((run) => Object.keys(run.metrics.objectiveValues)),
  )].sort();

  return Object.freeze(
    objectiveIds.map((objectiveId) => {
      const wins: Partial<Record<BalanceLabBotIdV1, number>> = {};
      for (const run of runs) wins[run.botId] = 0;
      let cohortCount = 0;
      let ties = 0;
      for (const cohort of cohorts.values()) {
        if (!cohort.every((run) => objectiveId in run.metrics.objectiveValues)) continue;
        cohortCount += 1;
        const highest = Math.max(
          ...cohort.map((run) => run.metrics.objectiveValues[objectiveId]!),
        );
        const winners = cohort.filter(
          (run) => run.metrics.objectiveValues[objectiveId] === highest,
        );
        if (winners.length === 1) {
          const winnerId = winners[0]!.botId;
          wins[winnerId] = (wins[winnerId] ?? 0) + 1;
        } else {
          ties += 1;
        }
      }
      return Object.freeze({
        objectiveId,
        cohortCount,
        wins: Object.freeze(wins),
        ties,
      });
    }),
  );
}

function maximumStrategyObjectiveLeadEvidence(
  objectives: readonly BalanceLabMatchedObjectiveResultV1[],
): Readonly<{ numerator: number; denominator: number; observed: number }> {
  const sampledObjectives = objectives.filter(({ cohortCount }) => cohortCount > 0);
  const objectiveLeadCount = new Map<BalanceLabBotIdV1, number>();
  for (const objective of sampledObjectives) {
    const entries = Object.entries(objective.wins) as [BalanceLabBotIdV1, number][];
    const highest = Math.max(0, ...entries.map(([, wins]) => wins));
    if (highest === 0) continue;
    const leaders = entries.filter(([, wins]) => wins === highest);
    if (leaders.length !== 1) continue;
    const leader = leaders[0]![0];
    objectiveLeadCount.set(leader, (objectiveLeadCount.get(leader) ?? 0) + 1);
  }
  return evidence(
    Math.max(0, ...objectiveLeadCount.values()),
    sampledObjectives.length,
  );
}

function preparedBankruptcyEvidence(
  runs: readonly BalanceLabMetricRunV1[],
): Readonly<{ numerator: number; denominator: number; observed: number }> {
  const cohorts = new Map<string, BalanceLabMetricRunV1[]>();
  for (const run of runs) {
    const key = `${run.personaId}|${run.matchedSeed}`;
    const cohort = cohorts.get(key) ?? [];
    cohort.push(run);
    cohorts.set(key, cohort);
  }
  let improvementCount = 0;
  let worseningCount = 0;
  let pairCount = 0;
  for (const cohort of cohorts.values()) {
    const prepared = cohort.find(({ botId }) => botId === "disciplined-v1");
    const reckless = cohort.find(({ botId }) => botId === "debt-heavy-lifestyle-v1");
    if (prepared === undefined || reckless === undefined) continue;
    pairCount += 1;
    const preparedFailed = prepared.metrics.endReason === "bankruptcy";
    const recklessFailed = reckless.metrics.endReason === "bankruptcy";
    if (!preparedFailed && recklessFailed) improvementCount += 1;
    if (preparedFailed && !recklessFailed) worseningCount += 1;
  }
  return evidence(improvementCount - worseningCount, pairCount);
}

function objectiveVarianceAcrossSeeds(
  runs: readonly BalanceLabMetricRunV1[],
): BalanceLabMetricSummaryV1[
  "objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot"
] {
  const values = new Map<
    string,
    Map<string, Map<BalanceLabBotIdV1, number[]>>
  >();
  for (const run of runs) {
    const byObjective = values.get(run.personaId) ??
      new Map<string, Map<BalanceLabBotIdV1, number[]>>();
    for (const [objectiveId, value] of Object.entries(run.metrics.objectiveValues)) {
      const byBot = byObjective.get(objectiveId) ??
        new Map<BalanceLabBotIdV1, number[]>();
      const samples = byBot.get(run.botId) ?? [];
      samples.push(value);
      byBot.set(run.botId, samples);
      byObjective.set(objectiveId, byBot);
    }
    values.set(run.personaId, byObjective);
  }
  return Object.freeze(
    Object.fromEntries(
      [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
        ([personaId, byObjective]) => [
          personaId,
          Object.freeze(
            Object.fromEntries(
              [...byObjective.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([objectiveId, byBot]) => [
                  objectiveId,
                  Object.freeze(Object.fromEntries(
                    [...byBot.entries()]
                      .sort(([left], [right]) => left.localeCompare(right))
                      .map(([botId, samples]) => [
                        botId,
                        sampleVariance(samples),
                      ]),
                  )),
                ]),
            ),
          ),
        ],
      ),
    ),
  );
}

function matchedImpactReductionEvidence(
  runs: readonly BalanceLabMetricRunV1[],
): Readonly<{ numerator: number; denominator: number; observed: number }> {
  const cohorts = new Map<string, BalanceLabMetricRunV1[]>();
  for (const run of runs) {
    const key = `${run.personaId}|${run.matchedSeed}`;
    const cohort = cohorts.get(key) ?? [];
    cohort.push(run);
    cohorts.set(key, cohort);
  }
  let numerator = 0;
  let denominator = 0;
  for (const cohort of cohorts.values()) {
    const prepared = cohort.find(({ botId }) => botId === "disciplined-v1");
    const unprepared = cohort.find(({ botId }) => botId === "debt-heavy-lifestyle-v1");
    if (prepared === undefined || unprepared === undefined) continue;
    const preparedByEvent = new Map(
      (prepared.metrics.eventImpactSamples ?? []).map((sample) => [sample.eventId, sample]),
    );
    for (const reckless of unprepared.metrics.eventImpactSamples ?? []) {
      const protectedSample = preparedByEvent.get(reckless.eventId);
      if (
        protectedSample === undefined ||
        protectedSample.templateId !== reckless.templateId ||
        protectedSample.grossCostCents !== reckless.grossCostCents ||
        reckless.playerCostCents <= 0
      ) continue;
      numerator += Math.max(
        0,
        Math.floor(
          ((reckless.playerCostCents - protectedSample.playerCostCents) * 1_000_000) /
            reckless.playerCostCents,
        ),
      );
      denominator += 1;
    }
  }
  return Object.freeze({
    numerator,
    denominator,
    observed: denominator === 0 ? 0 : Math.floor(numerator / denominator),
  });
}

export function summarizeBalanceLabRunsV1(
  runs: readonly BalanceLabMetricRunV1[],
): BalanceLabMetricSummaryV1 {
  if (runs.length < 1) throw new RangeError("balance lab metrics require at least one run");
  const processedMonths = runs.reduce((total, run) => total + run.processedMonths, 0);
  const gradeDistribution: Record<string, number> = { active: 0 };
  const eventCountByTier = { micro: 0, medium: 0, large: 0, catastrophe: 0 };
  const recoveryMonths: number[] = [];
  let recoveryObservationCount = 0;
  let censoredRecoveryCount = 0;
  const lessonCoverage = new Set<string>();
  let lessonCount = 0;
  let repeatedLessonCount = 0;
  let noEventMonths = 0;
  let forcedSaleCount = 0;
  let catastropheCount = 0;
  let highInterestDebt = BigInt(0);
  let interestPaid = BigInt(0);
  let majorEventPacingViolationCount = 0;
  let majorEventPacingSampleCount = 0;

  for (const run of runs) {
    const metrics = run.metrics;
    const grade = metrics.grade ?? (metrics.endReason === "active" ? "active" : "ungraded");
    gradeDistribution[grade] = (gradeDistribution[grade] ?? 0) + 1;
    for (const tier of ["micro", "medium", "large", "catastrophe"] as const) {
      eventCountByTier[tier] += metrics.eventCountByTier[tier];
    }
    catastropheCount += metrics.catastropheCount;
    recoveryMonths.push(...metrics.recoveryMonths);
    recoveryObservationCount += metrics.recoveryObservations?.length ?? 0;
    censoredRecoveryCount += metrics.recoveryObservations?.filter(
      ({ status }) => status === "censored",
    ).length ?? 0;
    const uniqueLessonsInRun = new Set(metrics.lessonIds);
    for (const lessonId of uniqueLessonsInRun) lessonCoverage.add(lessonId);
    lessonCount += metrics.lessonIds.length;
    repeatedLessonCount += metrics.lessonIds.length - uniqueLessonsInRun.size;
    noEventMonths += metrics.noEventMonths;
    forcedSaleCount += metrics.forcedSaleCount;
    highInterestDebt += BigInt(metrics.highInterestDebtCreatedCents);
    interestPaid += BigInt(metrics.interestPaidCents);
    majorEventPacingViolationCount += metrics.majorEventPacingViolationCount ?? 0;
    majorEventPacingSampleCount += metrics.majorEventPacingSampleCount ?? 0;
  }

  const healthy = runs.filter(({ personaId }) => personaId === "healthy-v1");
  const healthyUnavoidableFailure = evidence(
    healthy.filter(({ metrics }) => metrics.unavoidableFailure).length,
    healthy.length,
  );
  const preparedBankruptcyMatched = preparedBankruptcyEvidence(runs);
  const matched = matchedObjectives(runs);
  const preparedWins = matched.reduce(
    (total, objective) => total + (objective.wins["disciplined-v1"] ?? 0),
    0,
  );
  const recklessWins = matched.reduce(
    (total, objective) => total + (objective.wins["debt-heavy-lifestyle-v1"] ?? 0),
    0,
  );
  const maximumStrategyObjectiveLead = maximumStrategyObjectiveLeadEvidence(matched);
  const impactReduction = matchedImpactReductionEvidence(runs);
  const majorEventPacing = Object.freeze({
    numerator: majorEventPacingViolationCount,
    denominator: majorEventPacingSampleCount,
    observed: rate(
      majorEventPacingViolationCount,
      majorEventPacingSampleCount,
    ).ratePpm,
  });

  return Object.freeze({
    runCount: runs.length,
    processedMonths,
    bankruptcyRate: rate(
      runs.filter((run) => run.metrics.endReason === "bankruptcy").length,
      runs.length,
    ),
    fiAchievementRate: rate(
      runs.filter((run) => run.metrics.endReason === "financial_independence").length,
      runs.length,
    ),
    unavoidableFailureRate: rate(
      runs.filter((run) => run.metrics.unavoidableFailure).length,
      runs.length,
    ),
    meanRetirementFiProgressPpm: meanInteger(
      runs.map((run) => run.metrics.retirementFiProgressPpm),
    ),
    gradeDistribution: Object.freeze(gradeDistribution),
    meanDisplayedNetWorthCents: meanInteger(
      runs.map((run) => run.metrics.displayedNetWorthCents),
    ),
    meanLiquidSolvencyCents: meanInteger(
      runs.map((run) => run.metrics.liquidSolvencyCents),
    ),
    totalHighInterestDebtCreatedCents: highInterestDebt.toString(),
    totalInterestPaidCents: interestPaid.toString(),
    forcedSaleFrequencyPpm: rate(forcedSaleCount, processedMonths).ratePpm,
    eventCountByTier: Object.freeze(eventCountByTier),
    catastropheCount,
    meanRecoveryMonths:
      recoveryMonths.length === 0 ? null : meanInteger(recoveryMonths),
    recoveryObservationCount,
    censoredRecoveryCount,
    lessonCoverage: lessonCoverage.size,
    repeatedLessonRatePpm: rate(repeatedLessonCount, lessonCount).ratePpm,
    noEventRatePpm: rate(noEventMonths, processedMonths).ratePpm,
    preparedVsRecklessBankruptcyDeltaPpm:
      preparedBankruptcyMatched.observed,
    healthyPersonaUnavoidableFailureRatePpm: healthyUnavoidableFailure.observed,
    matchedStrategyWinRatePpm: rate(
      preparedWins,
      preparedWins + recklessWins,
    ).ratePpm,
    maximumStrategyObjectiveLeadSharePpm: maximumStrategyObjectiveLead.observed,
    impactReductionRatePpm: impactReduction.observed,
    majorEventPacingPpm: majorEventPacing.observed,
    matchedObjectiveResults: matched,
    objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot:
      objectiveVarianceAcrossSeeds(runs),
    acceptanceEvidence: Object.freeze({
      bankruptcy_rate_ppm: evidence(
        runs.filter(({ metrics }) => metrics.endReason === "bankruptcy").length,
        runs.length,
      ),
      unavoidable_failure_rate_ppm: evidence(
        runs.filter(({ metrics }) => metrics.unavoidableFailure).length,
        runs.length,
      ),
      repeated_lesson_rate_ppm: evidence(repeatedLessonCount, lessonCount),
      forced_sale_frequency_ppm: evidence(forcedSaleCount, processedMonths),
      prepared_vs_reckless_bankruptcy_delta_ppm: preparedBankruptcyMatched,
      healthy_persona_unavoidable_failure_rate_ppm: healthyUnavoidableFailure,
      impact_reduction_rate_ppm: impactReduction,
      major_event_pacing_ppm: majorEventPacing,
      matched_strategy_win_rate_ppm: evidence(
        preparedWins,
        preparedWins + recklessWins,
      ),
      maximum_strategy_objective_lead_share_ppm: maximumStrategyObjectiveLead,
    }),
  });
}
