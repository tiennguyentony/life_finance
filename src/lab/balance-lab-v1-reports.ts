import { canonicalJson, sha256Canonical } from "../core/canonical";
import { WORLD_RANDOM_VERSION_V1 } from "../core/world-random-v1";
import { decodeWorldRandomStateV1 } from "../core/world-random-v1";
import type { BalanceLabAcceptanceResultV1 } from "./balance-lab-v1-acceptance";
import { OfflineBalanceLabV1Error, decodeBalanceLabRunSpecV1 } from "./balance-lab-v1-contracts";
import type { BalanceLabMetricSummaryV1 } from "./balance-lab-v1-metrics";
import type { OfflineBalanceLabResultV1 } from "./balance-lab-v1-runner";

export type BalanceLabReportV1 = Readonly<{
  version: "balance-lab-report-v1";
  codeVersion: Readonly<{ commit: string; dirty: boolean; sourceHash: string }>;
  configurationHash: string;
  eventCatalogFingerprint: string;
  taxEvidence: Readonly<{
    version: "quick-tax-fixture-v1" | "policyengine-live-v1";
    fingerprint: string;
  }>;
  worldRandomVersion: typeof WORLD_RANDOM_VERSION_V1;
  reportFingerprint: string;
  deterministicResultFingerprint: string;
  result: OfflineBalanceLabResultV1;
  summary: BalanceLabMetricSummaryV1;
  acceptance: readonly BalanceLabAcceptanceResultV1[];
  warnings: readonly string[];
  limitations: readonly string[];
  runtime: Readonly<{
    elapsedMs: number;
    processedProductionMonths: number;
    productionMonthsPerSecond: number;
  }>;
}>;

export function buildBalanceLabReportV1(input: Omit<
  BalanceLabReportV1,
  "version" | "worldRandomVersion" | "reportFingerprint" |
    "deterministicResultFingerprint"
>): BalanceLabReportV1 {
  const reportFingerprint = sha256Canonical({
    configurationHash: input.configurationHash,
    eventCatalogFingerprint: input.eventCatalogFingerprint,
    taxEvidence: input.taxEvidence,
    result: input.result,
    summary: input.summary,
    acceptance: input.acceptance,
    warnings: input.warnings,
    limitations: input.limitations,
    runtime: input.runtime,
    codeCommit: input.codeVersion.commit,
    codeSourceHash: input.codeVersion.sourceHash,
  });
  return Object.freeze({
    version: "balance-lab-report-v1",
    codeVersion: Object.freeze({ ...input.codeVersion }),
    configurationHash: input.configurationHash,
    eventCatalogFingerprint: input.eventCatalogFingerprint,
    taxEvidence: Object.freeze({ ...input.taxEvidence }),
    worldRandomVersion: WORLD_RANDOM_VERSION_V1,
    reportFingerprint,
    deterministicResultFingerprint: input.result.deterministicResultFingerprint,
    result: input.result,
    summary: input.summary,
    acceptance: Object.freeze([...input.acceptance]),
    warnings: Object.freeze([...input.warnings]),
    limitations: Object.freeze([...input.limitations]),
    runtime: Object.freeze({ ...input.runtime }),
  });
}

const HASH = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

function invalidReport(message: string): never {
  throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", `invalid balance report: ${message}`);
}

function requireHash(value: unknown, label: string): void {
  if (typeof value !== "string" || !HASH.test(value)) invalidReport(`${label} must be SHA-256`);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function validateRate(value: unknown): void {
  if (!isRecord(value) || !hasExactKeys(value, [
    "numerator", "denominator", "ratePpm", "confidenceInterval95Ppm",
  ]) || !isFiniteInteger(value.numerator) || !isFiniteInteger(value.denominator) ||
      !isFiniteInteger(value.ratePpm) || !isRecord(value.confidenceInterval95Ppm) ||
      !hasExactKeys(value.confidenceInterval95Ppm, ["lower", "upper"]) ||
      !isFiniteInteger(value.confidenceInterval95Ppm.lower) ||
      !isFiniteInteger(value.confidenceInterval95Ppm.upper)) {
    invalidReport("invalid rate summary");
  }
}

const METRIC_KEYS = [
  "endReason", "grade", "retirementFiProgressPpm", "displayedNetWorthCents",
  "liquidSolvencyCents", "highInterestDebtCreatedCents", "interestPaidCents",
  "forcedSaleCount", "eventCountByTier", "catastropheCount", "recoveryMonths",
  "recoveryObservations", "lessonIds", "noEventMonths", "unavoidableFailure",
  "bankruptcyResidualShortfallCents", "eventImpactSamples",
  "majorEventPacingViolationCount", "majorEventPacingSampleCount", "objectiveValues",
] as const;

function validateRunMetrics(value: Record<string, unknown>): void {
  if (!hasExactKeys(value, METRIC_KEYS, [
    "totalEventPlayerCostCents", "totalEventGrossCostCents",
  ]) || !["active", "bankruptcy", "financial_independence", "retirement"].includes(
    value.endReason as string,
  ) || !(value.grade === null || typeof value.grade === "string") ||
      !isRecord(value.eventCountByTier) || !hasExactKeys(value.eventCountByTier, [
        "micro", "medium", "large", "catastrophe",
      ]) || !Object.values(value.eventCountByTier).every(isFiniteInteger) ||
      !Array.isArray(value.recoveryMonths) || !value.recoveryMonths.every(isFiniteInteger) ||
      !Array.isArray(value.recoveryObservations) ||
      !Array.isArray(value.eventImpactSamples) ||
      !Array.isArray(value.lessonIds) || !value.lessonIds.every((item) => typeof item === "string") ||
      typeof value.unavoidableFailure !== "boolean" || !isRecord(value.objectiveValues) ||
      !Object.values(value.objectiveValues).every(isFiniteInteger)) {
    invalidReport("invalid authoritative run metrics");
  }
  const integerKeys = [
    "retirementFiProgressPpm", "displayedNetWorthCents", "liquidSolvencyCents",
    "highInterestDebtCreatedCents", "interestPaidCents", "forcedSaleCount",
    "catastropheCount", "noEventMonths",
    "bankruptcyResidualShortfallCents", "majorEventPacingViolationCount",
    "majorEventPacingSampleCount",
  ];
  if (!integerKeys.every((key) => isFiniteInteger(value[key])) ||
      (value.totalEventPlayerCostCents !== undefined &&
        !isFiniteInteger(value.totalEventPlayerCostCents)) ||
      (value.totalEventGrossCostCents !== undefined &&
        !isFiniteInteger(value.totalEventGrossCostCents))) {
    invalidReport("invalid authoritative metric number");
  }
  for (const recovery of value.recoveryObservations) {
    if (!isRecord(recovery) || !hasExactKeys(recovery, [
      "eventMonthIndex", "status", "observedMonths",
    ]) || !isFiniteInteger(recovery.eventMonthIndex) ||
        !isFiniteInteger(recovery.observedMonths) ||
        !(recovery.status === "recovered" || recovery.status === "censored")) {
      invalidReport("invalid recovery observation");
    }
  }
  for (const impact of value.eventImpactSamples) {
    if (!isRecord(impact) || !hasExactKeys(impact, [
      "eventId", "templateId", "playerCostCents", "grossCostCents",
    ]) || typeof impact.eventId !== "string" || typeof impact.templateId !== "string" ||
        !isFiniteInteger(impact.playerCostCents) || !isFiniteInteger(impact.grossCostCents)) {
      invalidReport("invalid event impact sample");
    }
  }
}

function validateSummary(value: Record<string, unknown>): void {
  const keys = [
    "runCount", "processedMonths", "bankruptcyRate", "fiAchievementRate",
    "unavoidableFailureRate", "meanRetirementFiProgressPpm", "gradeDistribution",
    "meanDisplayedNetWorthCents", "meanLiquidSolvencyCents",
    "totalHighInterestDebtCreatedCents", "totalInterestPaidCents",
    "forcedSaleFrequencyPpm", "eventCountByTier", "catastropheCount",
    "meanRecoveryMonths", "recoveryObservationCount", "censoredRecoveryCount",
    "lessonCoverage", "repeatedLessonRatePpm", "noEventRatePpm",
    "preparedVsRecklessBankruptcyDeltaPpm", "healthyPersonaUnavoidableFailureRatePpm",
    "matchedStrategyWinRatePpm", "maximumStrategyObjectiveLeadSharePpm",
    "impactReductionRatePpm", "majorEventPacingPpm", "matchedObjectiveResults",
    "objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot", "acceptanceEvidence",
  ] as const;
  if (!hasExactKeys(value, keys)) invalidReport("unsupported summary fields");
  validateRate(value.bankruptcyRate);
  validateRate(value.fiAchievementRate);
  validateRate(value.unavoidableFailureRate);
  const integerKeys = keys.filter((key) => ![
    "bankruptcyRate", "fiAchievementRate", "unavoidableFailureRate",
    "gradeDistribution", "totalHighInterestDebtCreatedCents", "totalInterestPaidCents",
    "eventCountByTier", "meanRecoveryMonths", "matchedObjectiveResults",
    "objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot", "acceptanceEvidence",
  ].includes(key));
  if (!integerKeys.every((key) => isFiniteInteger(value[key])) ||
      !(value.meanRecoveryMonths === null || isFiniteInteger(value.meanRecoveryMonths)) ||
      typeof value.totalHighInterestDebtCreatedCents !== "string" ||
      typeof value.totalInterestPaidCents !== "string" ||
      !isRecord(value.gradeDistribution) ||
      !Object.values(value.gradeDistribution).every(isFiniteInteger) ||
      !isRecord(value.eventCountByTier) ||
      !hasExactKeys(value.eventCountByTier, ["micro", "medium", "large", "catastrophe"]) ||
      !Object.values(value.eventCountByTier).every(isFiniteInteger) ||
      !Array.isArray(value.matchedObjectiveResults) ||
      !isRecord(value.objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot) ||
      !isRecord(value.acceptanceEvidence)) {
    invalidReport("invalid summary values");
  }
  for (const objective of value.matchedObjectiveResults) {
    if (!isRecord(objective) || !hasExactKeys(objective, [
      "objectiveId", "cohortCount", "wins", "ties",
    ]) || typeof objective.objectiveId !== "string" ||
        !isFiniteInteger(objective.cohortCount) || !isFiniteInteger(objective.ties) ||
        !isRecord(objective.wins) || !Object.values(objective.wins).every(isFiniteInteger)) {
      invalidReport("invalid matched objective summary");
    }
  }
  for (const byObjective of Object.values(
    value.objectiveVarianceAcrossSeedsCentsSquaredByPersonaAndBot,
  )) {
    if (!isRecord(byObjective)) invalidReport("invalid objective variance summary");
    for (const byBot of Object.values(byObjective)) {
      if (!isRecord(byBot) || !Object.values(byBot).every((item) =>
        typeof item === "string" && /^\d+$/.test(item))) {
        invalidReport("invalid objective variance summary");
      }
    }
  }
  const acceptanceMetricKeys = [
    "bankruptcy_rate_ppm", "unavoidable_failure_rate_ppm",
    "repeated_lesson_rate_ppm", "forced_sale_frequency_ppm",
    "prepared_vs_reckless_bankruptcy_delta_ppm",
    "healthy_persona_unavoidable_failure_rate_ppm", "impact_reduction_rate_ppm",
    "major_event_pacing_ppm", "matched_strategy_win_rate_ppm",
    "maximum_strategy_objective_lead_share_ppm",
  ];
  if (!hasExactKeys(value.acceptanceEvidence, acceptanceMetricKeys)) {
    invalidReport("invalid acceptance evidence metrics");
  }
  for (const evidence of Object.values(value.acceptanceEvidence)) {
    if (!isRecord(evidence) || !hasExactKeys(evidence, [
      "numerator", "denominator", "observed",
    ]) || !Object.values(evidence).every(isFiniteInteger)) {
      invalidReport("invalid acceptance evidence");
    }
  }
}

/** Strict persisted report boundary. Renderers only accept reports that can round-trip here. */
export function decodeBalanceLabReportV1(value: unknown): BalanceLabReportV1 {
  if (!isRecord(value) || !hasExactKeys(value, [
    "version", "codeVersion", "configurationHash", "eventCatalogFingerprint", "taxEvidence",
    "worldRandomVersion", "reportFingerprint", "deterministicResultFingerprint",
    "result", "summary",
    "acceptance", "warnings", "limitations", "runtime",
  ])) invalidReport("unsupported top-level fields");
  if (value.version !== "balance-lab-report-v1" || value.worldRandomVersion !== WORLD_RANDOM_VERSION_V1) {
    invalidReport("unsupported report or world-random version");
  }
  const code = value.codeVersion;
  if (!isRecord(code) || !hasExactKeys(code, ["commit", "dirty", "sourceHash"]) ||
      typeof code.commit !== "string" || code.commit.length < 1 || typeof code.dirty !== "boolean") {
    invalidReport("invalid code version");
  }
  requireHash(code.sourceHash, "code source hash");
  requireHash(value.configurationHash, "configuration hash");
  requireHash(value.eventCatalogFingerprint, "event catalog fingerprint");
  requireHash(value.deterministicResultFingerprint, "report fingerprint");
  requireHash(value.reportFingerprint, "observed report fingerprint");
  const tax = value.taxEvidence;
  if (!isRecord(tax) || !hasExactKeys(tax, ["version", "fingerprint"]) ||
      !(tax.version === "quick-tax-fixture-v1" || tax.version === "policyengine-live-v1")) {
    invalidReport("invalid tax evidence");
  }
  requireHash(tax.fingerprint, "tax evidence fingerprint");
  const result = value.result;
  if (!isRecord(result) || !hasExactKeys(result, [
    "version", "spec", "configurationHash", "runs", "deterministicResultFingerprint",
  ]) || result.version !== "offline-balance-lab-v1" || !Array.isArray(result.runs)) {
    invalidReport("invalid run result");
  }
  decodeBalanceLabRunSpecV1(result.spec);
  requireHash(result.configurationHash, "result configuration hash");
  requireHash(result.deterministicResultFingerprint, "result fingerprint");
  for (const run of result.runs) {
    if (!isRecord(run) || !hasExactKeys(run, [
      "personaId", "matchedSeed", "botId", "openingStateChecksum", "initialWorldRandom",
      "finalStateChecksum", "finalWorldRandom", "processedMonths", "terminal",
      "worldEvidence", "botIntents", "metrics",
    ], ["botRandomFinal"]) || !Array.isArray(run.worldEvidence) ||
      !Array.isArray(run.botIntents) || !isRecord(run.metrics)) {
      invalidReport("invalid run entry");
    }
    requireHash(run.openingStateChecksum, "opening checksum");
    requireHash(run.finalStateChecksum, "final checksum");
    decodeWorldRandomStateV1(run.initialWorldRandom);
    decodeWorldRandomStateV1(run.finalWorldRandom);
    for (const evidence of run.worldEvidence) {
      if (!isRecord(evidence) || !hasExactKeys(evidence, [
        "monthIndex", "macroEvidenceHash", "rawOpportunityFingerprint",
        "nextMacroStateValue", "nextOpportunityEpochValue",
      ])) invalidReport("invalid world evidence");
      requireHash(evidence.macroEvidenceHash, "macro evidence hash");
      requireHash(evidence.rawOpportunityFingerprint, "opportunity fingerprint");
      if (![
        evidence.monthIndex,
        evidence.nextMacroStateValue,
        evidence.nextOpportunityEpochValue,
      ].every(isFiniteInteger)) invalidReport("invalid world evidence number");
    }
    for (const intent of run.botIntents) {
      if (!isRecord(intent) || !hasExactKeys(intent,
        ["monthIndex", "intentId", "command", "disposition"],
        ["eventId", "choiceId"],
      ) || !isFiniteInteger(intent.monthIndex) || typeof intent.intentId !== "string" ||
          typeof intent.command !== "string" || typeof intent.disposition !== "string" ||
          (intent.eventId !== undefined && typeof intent.eventId !== "string") ||
          (intent.choiceId !== undefined && typeof intent.choiceId !== "string")) {
        invalidReport("invalid bot intent evidence");
      }
    }
    validateRunMetrics(run.metrics);
  }
  if (!isRecord(value.summary) || !Array.isArray(value.acceptance) ||
      !Array.isArray(value.warnings) || !Array.isArray(value.limitations) ||
      !value.warnings.every((item) => typeof item === "string") ||
      !value.limitations.every((item) => typeof item === "string")) {
    invalidReport("invalid summary, acceptance, warnings, or limitations");
  }
  validateSummary(value.summary);
  for (const item of value.acceptance) {
    if (!isRecord(item) || !hasExactKeys(item, [
      "id", "metric", "status", "observed", "comparator", "threshold", "numerator",
      "denominator", "minimumSamples", "evidenceIds",
    ]) || !Array.isArray(item.evidenceIds) ||
        typeof item.id !== "string" || typeof item.metric !== "string" ||
        !["pass", "fail", "insufficient_sample"].includes(item.status as string) ||
        !["at_least", "at_most", "equals"].includes(item.comparator as string) ||
        ![item.observed, item.threshold, item.numerator, item.denominator, item.minimumSamples]
          .every(isFiniteInteger) ||
        !item.evidenceIds.every((entry) => typeof entry === "string")) {
      invalidReport("invalid acceptance evidence");
    }
  }
  const runtime = value.runtime;
  if (!isRecord(runtime) || !hasExactKeys(runtime, [
    "elapsedMs", "processedProductionMonths", "productionMonthsPerSecond",
  ]) || !Object.values(runtime).every((item) => typeof item === "number" && Number.isFinite(item))) {
    invalidReport("invalid runtime evidence");
  }
  return value as BalanceLabReportV1;
}

export function renderBalanceLabJsonV1(report: BalanceLabReportV1): string {
  return `${canonicalJson(report)}\n`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function renderBalanceLabRunsCsvV1(report: BalanceLabReportV1): string {
  return csv([
    [
      "persona_id",
      "matched_seed",
      "bot_id",
      "processed_months",
      "terminal",
      "end_reason",
      "grade",
      "net_worth_cents",
      "liquid_solvency_cents",
      "interest_paid_cents",
      "forced_sale_count",
      "final_state_checksum",
    ],
    ...report.result.runs.map((run) => [
      run.personaId,
      run.matchedSeed,
      run.botId,
      run.processedMonths,
      run.terminal,
      run.metrics.endReason,
      run.metrics.grade ?? "",
      run.metrics.displayedNetWorthCents,
      run.metrics.liquidSolvencyCents,
      run.metrics.interestPaidCents,
      run.metrics.forcedSaleCount,
      run.finalStateChecksum,
    ]),
  ]);
}

export function renderBalanceLabMatchedCsvV1(report: BalanceLabReportV1): string {
  return csv([
    ["objective_id", "cohort_count", "bot_id", "wins", "ties"],
    ...report.summary.matchedObjectiveResults.flatMap((objective) =>
      Object.entries(objective.wins)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([botId, wins]) => [
          objective.objectiveId,
          objective.cohortCount,
          botId,
          wins ?? 0,
          objective.ties,
        ]),
    ),
  ]);
}

export function renderBalanceLabMarkdownV1(report: BalanceLabReportV1): string {
  const acceptanceRows = report.acceptance.length === 0
    ? "| — | — | — | — |\n"
    : report.acceptance
        .map((item) =>
          `| ${item.id} | ${item.status} | ${item.observed} | ${item.comparator} ${item.threshold} |`,
        )
        .join("\n") + "\n";
  const warnings = report.warnings.length === 0
    ? "- None."
    : report.warnings.map((warning) => `- ${warning}`).join("\n");
  const limitations = report.limitations.length === 0
    ? "- None."
    : report.limitations.map((limitation) => `- ${limitation}`).join("\n");
  return [
    "# Offline Balance Lab v1",
    "",
    `Deterministic production-result fingerprint: \`${report.deterministicResultFingerprint}\``,
    `Observed report fingerprint: \`${report.reportFingerprint}\``,
    `Configuration hash: \`${report.configurationHash}\``,
    `Code: \`${report.codeVersion.commit}\`${report.codeVersion.dirty ? " (dirty)" : ""}`,
    `Code source hash: \`${report.codeVersion.sourceHash}\``,
    `Tax evidence: \`${report.taxEvidence.version}\` / \`${report.taxEvidence.fingerprint}\``,
    "",
    "## Summary",
    "",
    "| Runs | Production months | Bankruptcy PPM | FI PPM | Mean net worth | No-event PPM |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${report.summary.runCount} | ${report.summary.processedMonths} | ${report.summary.bankruptcyRate.ratePpm} | ${report.summary.fiAchievementRate.ratePpm} | ${report.summary.meanDisplayedNetWorthCents} | ${report.summary.noEventRatePpm} |`,
    "",
    "## Acceptance",
    "",
    "| Check | Status | Observed | Threshold |",
    "| --- | --- | ---: | --- |",
    acceptanceRows.trimEnd(),
    "",
    "## Warnings",
    "",
    warnings,
    "",
    "## Limitations",
    "",
    limitations,
    "",
  ].join("\n");
}
