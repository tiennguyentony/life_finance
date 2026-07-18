import { describe, expect, it } from "vitest";

import rawConfig from "../../../balance-lab.config.json";
import { sha256Canonical } from "../../core/canonical";
import {
  balanceLabGateDecisionV1,
  evaluateBalanceLabAcceptanceV1,
} from "../balance-lab-v1-acceptance";
import {
  decodeBalanceLabConfigV1,
  resolveBalanceLabBatchV1,
} from "../balance-lab-v1-config";
import { summarizeBalanceLabRunsV1 } from "../balance-lab-v1-metrics";
import {
  buildBalanceLabReportV1,
  decodeBalanceLabReportV1,
  renderBalanceLabJsonV1,
  renderBalanceLabMarkdownV1,
  renderBalanceLabMatchedCsvV1,
  renderBalanceLabRunsCsvV1,
} from "../balance-lab-v1-reports";
import type { OfflineBalanceLabResultV1 } from "../balance-lab-v1-runner";

const run = {
  personaId: "healthy-v1",
  matchedSeed: 1,
  botId: "disciplined-v1" as const,
  processedMonths: 24,
  metrics: {
    endReason: "active" as const,
    grade: null,
    retirementFiProgressPpm: 200_000,
    displayedNetWorthCents: 1_500_000,
    liquidSolvencyCents: 900_000,
    highInterestDebtCreatedCents: 0,
    interestPaidCents: 10_000,
    forcedSaleCount: 0,
    eventCountByTier: { micro: 1, medium: 0, large: 0, catastrophe: 0 },
    catastropheCount: 0,
    recoveryMonths: [],
    recoveryObservations: [],
    lessonIds: ["lesson.quoted", "lesson.quoted", "lesson.second"],
    noEventMonths: 23,
    unavoidableFailure: false,
    bankruptcyResidualShortfallCents: 0,
    eventImpactSamples: [],
    majorEventPacingViolationCount: 0,
    majorEventPacingSampleCount: 0,
    eventDecisionEvidence: [],
    beginnerEventCadenceEvidence: [],
    objectiveValues: { survival: 1 },
  },
};

describe("balance lab config, acceptance, and reports", () => {
  it("strictly resolves documented beginner/quick/medium/large production-month tiers", () => {
    const config = decodeBalanceLabConfigV1(rawConfig);
    const beginner = resolveBalanceLabBatchV1(config, "beginner", "beginner-first-run");
    const quick = resolveBalanceLabBatchV1(config, "quick", "quick-ci");
    const medium = resolveBalanceLabBatchV1(config, "medium", "medium-local");
    const large = resolveBalanceLabBatchV1(config, "large", "large-scheduled");

    expect(beginner.spec.horizonMonths).toBe(12);
    expect(beginner.spec.difficulty).toBe("guided");
    expect(beginner.spec.personaIds).toEqual([
      "healthy-v1",
      "low-cash-v1",
      "debt-burdened-v1",
    ]);
    expect(quick.spec.matchedSeeds).toHaveLength(3);
    expect(quick.spec.horizonMonths).toBe(24);
    expect(medium.spec.matchedSeeds).toHaveLength(25);
    expect(large.spec.matchedSeeds).toHaveLength(200);
    expect(large.spec.horizonMonths).toBe(480);
    expect(() => decodeBalanceLabConfigV1({ ...rawConfig, extra: true })).toThrow();
    expect(config.acceptance.map(({ metric }) => metric)).toEqual(
      expect.arrayContaining([
        "prepared_vs_reckless_bankruptcy_delta_ppm",
        "healthy_persona_unavoidable_failure_rate_ppm",
        "impact_reduction_rate_ppm",
        "major_event_pacing_ppm",
        "matched_strategy_win_rate_ppm",
        "maximum_strategy_objective_lead_share_ppm",
        "beginner_chapter_completion_rate_ppm",
        "beginner_nonfatal_recovery_within_six_months_rate_ppm",
        "beginner_meaningful_or_crisis_approved_rate_ppm",
        "beginner_extreme_approved_rate_ppm",
        "beginner_median_total_prompt_count",
        "beginner_median_meaningful_decision_count",
        "beginner_at_least_six_meaningful_decision_rate_ppm",
        "beginner_median_unique_decision_template_count",
        "beginner_median_humorous_root_count",
        "beginner_median_absurd_root_count",
        "beginner_positive_or_recovery_beat_rate_ppm",
        "beginner_adjacent_absurd_violation_count",
        "beginner_root_event_streak_violation_count",
        "beginner_funny_root_above_meaningful_count",
        "beginner_prepared_funny_unavoidable_failure_count",
      ]),
    );
    expect(config.acceptance.find(
      ({ id }) => id === "beginner-prepared-vs-reckless-bankruptcy",
    )).toMatchObject({ threshold: 200_000, tierIds: ["beginner"] });
    expect(config.acceptance.find(
      ({ id }) => id === "beginner-total-prompts-minimum",
    )).toMatchObject({ threshold: 8, minimumSamples: 200 });
    expect(config.acceptance.find(
      ({ id }) => id === "beginner-meaningful-decisions-maximum",
    )).toMatchObject({ threshold: 8, comparator: "at_most" });
    expect(config.acceptance.find(
      ({ id }) => id === "beginner-adjacent-absurd-violations",
    )).toMatchObject({ threshold: 0, comparator: "equals" });
  });

  it("emits three-state configurable acceptance with sample evidence", () => {
    const config = decodeBalanceLabConfigV1(rawConfig);
    const summary = summarizeBalanceLabRunsV1([run]);
    const acceptance = evaluateBalanceLabAcceptanceV1(
      summary,
      config.acceptance,
      100,
      "quick",
    );

    expect(acceptance.find(({ id }) => id === "bankruptcy-rate")?.status).toBe(
      "insufficient_sample",
    );
    expect(acceptance.find(({ id }) => id === "quick-runtime-budget")?.status).toBe(
      "pass",
    );
    expect(acceptance.find(({ id }) => id === "repeated-lessons")).toMatchObject({
      numerator: 1,
      denominator: 3,
      observed: 333_333,
    });
    expect(acceptance.every(({ evidenceIds }) => evidenceIds.length === 2)).toBe(true);
  });

  it("applies scoped rules only to their declared tiers", () => {
    const config = decodeBalanceLabConfigV1({
      ...rawConfig,
      acceptance: [
        {
          id: "all-tiers",
          metric: "bankruptcy_rate_ppm",
          comparator: "at_most",
          threshold: 1_000_000,
          minimumSamples: 1,
        },
        {
          id: "beginner-only",
          metric: "beginner_chapter_completion_rate_ppm",
          comparator: "at_least",
          threshold: 650_000,
          minimumSamples: 200,
          tierIds: ["beginner"],
        },
      ],
    });
    const summary = summarizeBalanceLabRunsV1([run]);

    expect(evaluateBalanceLabAcceptanceV1(
      summary,
      config.acceptance,
      100,
      "quick",
    ).map(({ id }) => id)).toEqual(["all-tiers"]);
    expect(evaluateBalanceLabAcceptanceV1(
      summary,
      config.acceptance,
      100,
      "beginner",
    ).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "all-tiers", status: "pass" },
      { id: "beginner-only", status: "insufficient_sample" },
    ]);
    expect(() => decodeBalanceLabConfigV1({
      ...rawConfig,
      acceptance: [{
        id: "invalid-scope",
        metric: "bankruptcy_rate_ppm",
        comparator: "at_most",
        threshold: 1,
        minimumSamples: 1,
        tierIds: ["unknown"],
      }],
    })).toThrow();
  });

  it("strictly decodes the documented strategy and pacing acceptance metrics", () => {
    const decoded = decodeBalanceLabConfigV1({
      ...rawConfig,
      acceptance: [
        {
          id: "prepared-beats-reckless",
          metric: "prepared_vs_reckless_bankruptcy_delta_ppm",
          comparator: "at_least",
          threshold: 0,
          minimumSamples: 1,
        },
        {
          id: "healthy-unavoidable-failure",
          metric: "healthy_persona_unavoidable_failure_rate_ppm",
          comparator: "at_most",
          threshold: 250_000,
          minimumSamples: 1,
        },
        {
          id: "impact-reduction",
          metric: "impact_reduction_rate_ppm",
          comparator: "at_least",
          threshold: 0,
          minimumSamples: 1,
        },
        {
          id: "major-pacing",
          metric: "major_event_pacing_ppm",
          comparator: "at_most",
          threshold: 100_000,
          minimumSamples: 1,
        },
        {
          id: "no-strategy-objective-domination",
          metric: "maximum_strategy_objective_lead_share_ppm",
          comparator: "at_most",
          threshold: 900_000,
          minimumSamples: 1,
        },
        {
          id: "matched-strategy-win-rate",
          metric: "matched_strategy_win_rate_ppm",
          comparator: "at_least",
          threshold: 500_000,
          minimumSamples: 1,
        },
      ],
    });

    expect(decoded.acceptance.map(({ metric }) => metric)).toEqual([
      "prepared_vs_reckless_bankruptcy_delta_ppm",
      "healthy_persona_unavoidable_failure_rate_ppm",
      "impact_reduction_rate_ppm",
      "major_event_pacing_ppm",
      "maximum_strategy_objective_lead_share_ppm",
      "matched_strategy_win_rate_ppm",
    ]);
  });

  it("reports insufficient quick samples but gates insufficient medium and all failed rules", () => {
    const insufficient = [{ id: "small", status: "insufficient_sample" }] as never;
    const failed = [{ id: "broken", status: "fail" }] as never;

    expect(balanceLabGateDecisionV1("quick", insufficient)).toEqual({
      status: "pass_with_insufficient_samples",
      blockingRuleIds: [],
    });
    expect(balanceLabGateDecisionV1("beginner", insufficient)).toEqual({
      status: "pass_with_insufficient_samples",
      blockingRuleIds: [],
    });
    expect(balanceLabGateDecisionV1("medium", insufficient)).toEqual({
      status: "fail",
      blockingRuleIds: ["small"],
    });
    expect(balanceLabGateDecisionV1("quick", failed)).toEqual({
      status: "fail",
      blockingRuleIds: ["broken"],
    });
  });

  it("renders deterministic canonical JSON, RFC 4180 CSV, and Markdown from one report", () => {
    const config = decodeBalanceLabConfigV1(rawConfig);
    const summary = summarizeBalanceLabRunsV1([run]);
    const result = {
      version: "offline-balance-lab-v1",
      spec: resolveBalanceLabBatchV1(config, "quick", "report").spec,
      configurationHash: "a".repeat(64),
      deterministicResultFingerprint: "b".repeat(64),
      runs: [{
        ...run,
        openingStateChecksum: "c".repeat(64),
        initialWorldRandom: {
          version: "named-world-rng-v1",
          macro: { algorithm: "mulberry32-v1", value: 1 },
          eventOpportunity: { algorithm: "mulberry32-v1", value: 2 },
          eventParameters: { algorithm: "mulberry32-v1", value: 3 },
          balanceDirector: { algorithm: "mulberry32-v1", value: 4 },
        },
        finalStateChecksum: "d".repeat(64),
        finalWorldRandom: {
          version: "named-world-rng-v1",
          macro: { algorithm: "mulberry32-v1", value: 5 },
          eventOpportunity: { algorithm: "mulberry32-v1", value: 6 },
          eventParameters: { algorithm: "mulberry32-v1", value: 7 },
          balanceDirector: { algorithm: "mulberry32-v1", value: 4 },
        },
        terminal: false,
        worldEvidence: [],
        botIntents: [],
      }],
    } as OfflineBalanceLabResultV1;
    const report = buildBalanceLabReportV1({
      codeVersion: { commit: "test", dirty: true, sourceHash: "f".repeat(64) },
      configurationHash: "a".repeat(64),
      eventCatalogFingerprint: "9".repeat(64),
      taxEvidence: {
        version: "quick-tax-fixture-v1",
        fingerprint: "e".repeat(64),
      },
      result,
      summary,
      acceptance: evaluateBalanceLabAcceptanceV1(summary, config.acceptance, 100, "quick"),
      warnings: ["small sample"],
      limitations: ["No production large/catastrophe templates."],
      runtime: {
        elapsedMs: 100,
        processedProductionMonths: 24,
        productionMonthsPerSecond: 240,
      },
    });
    const slowerReport = buildBalanceLabReportV1({
      ...report,
      acceptance: evaluateBalanceLabAcceptanceV1(summary, config.acceptance, 200, "quick"),
      runtime: {
        elapsedMs: 200,
        processedProductionMonths: 24,
        productionMonthsPerSecond: 120,
      },
    });

    const json = renderBalanceLabJsonV1(report);
    const runsCsv = renderBalanceLabRunsCsvV1(report);
    const matchedCsv = renderBalanceLabMatchedCsvV1(report);
    const markdown = renderBalanceLabMarkdownV1(report);
    expect(json).toBe(renderBalanceLabJsonV1(report));
    expect(JSON.parse(json).version).toBe(
      "balance-lab-report-v1",
    );
    expect(decodeBalanceLabReportV1(JSON.parse(json))).toEqual(report);
    expect(report.deterministicResultFingerprint).toBe(
      result.deterministicResultFingerprint,
    );
    expect((report as unknown as { reportFingerprint: string }).reportFingerprint)
      .not.toBe(
        (slowerReport as unknown as { reportFingerprint: string }).reportFingerprint,
      );
    expect(slowerReport.deterministicResultFingerprint).toBe(
      report.deterministicResultFingerprint,
    );
    expect(() => decodeBalanceLabReportV1({ ...report, extra: true })).toThrow();
    expect(() => decodeBalanceLabReportV1({
      ...report,
      summary: { ...report.summary, extra: true },
    })).toThrow();
    const { beginnerEngagement: _engagement, ...summaryWithoutEngagement } =
      report.summary;
    expect(() => decodeBalanceLabReportV1({
      ...report,
      summary: summaryWithoutEngagement,
    })).toThrow();
    expect(() => decodeBalanceLabReportV1({
      ...report,
      acceptance: [{ ...report.acceptance[0]!, observed: "0" }],
    })).toThrow();
    expect(() => decodeBalanceLabReportV1({
      ...report,
      result: {
        ...report.result,
        runs: [{
          ...report.result.runs[0]!,
          metrics: { ...report.result.runs[0]!.metrics, extra: true },
        }],
      },
    })).toThrow();
    const {
      beginnerEventCadenceEvidence: _cadence,
      ...metricsWithoutCadence
    } = report.result.runs[0]!.metrics;
    expect(() => decodeBalanceLabReportV1({
      ...report,
      result: {
        ...report.result,
        runs: [{
          ...report.result.runs[0]!,
          metrics: metricsWithoutCadence,
        }],
      },
    })).toThrow();
    expect(runsCsv).toContain("\r\n");
    expect(runsCsv).toContain("opening_preparedness_score_ppm");
    expect(runsCsv).toContain("terminal_preparedness_band");
    expect(runsCsv).toContain("approved_challenge_score_ppm");
    expect(runsCsv).toContain("beginner_chapter_outcome");
    expect(runsCsv).toContain("meaningful_decision_count");
    expect(runsCsv).toContain("safety_override_count");
    expect(matchedCsv).toContain("objective_id");
    expect(markdown).toContain("## Balance equation shadow");
    expect(markdown).toContain("## Beginner chapter");
    expect(markdown).toContain("## Beginner engagement");
    expect(markdown).toContain(
      "No production large/catastrophe templates.",
    );
    expect(markdown).toContain("f".repeat(64));
    expect(sha256Canonical({ json, runsCsv, matchedCsv, markdown })).toBe(
      "adec7577cdf9fb07af6a32a92f7645192557bbf7a7f1fddbbd2094baf4f06d56",
    );
  });
});
