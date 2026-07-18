import { sha256Canonical } from "../core/canonical";
import type { BeginnerChapterOutcomeV1 } from "../core/beginner-chapter-v1";
import { randomState, type RandomState } from "../core/domain/rng";
import type { PreparednessBandV1 } from "../core/preparedness-assessment-v1";
import {
  decodeWorldRandomStateV1,
  initializeNamedWorldRandomV1,
  type WorldRandomStateV1,
} from "../core/world-random-v1";
import {
  balanceLabBotPolicyV1,
  deriveBalanceLabBotRandomStateV1,
  type BalanceLabBotPolicyV1,
} from "./balance-lab-v1-bots";
import {
  decodeBalanceLabRunSpecV1,
  OfflineBalanceLabV1Error,
  type BalanceLabBotIdV1,
  type BalanceLabDifficultyV1,
  type BalanceLabRunSpecV1,
} from "./balance-lab-v1-contracts";
import type { BalanceLabBalanceObservationV1 } from "./balance-lab-balance-observation-v1";

export type BalanceLabWorldEvidenceV1 = Readonly<{
  monthIndex: number;
  macroEvidenceHash: string;
  rawOpportunityFingerprint: string;
  nextMacroStateValue: number;
  nextOpportunityEpochValue: number;
}>;

export type BalanceLabBotIntentEvidenceV1 = Readonly<{
  monthIndex: number;
  intentId: string;
  command: BalanceLabBotPolicyV1["monthlyAction"] | "resolve_event_choice";
  disposition: "applied" | "not_applicable" | "resolved";
  eventId?: string;
  choiceId?: string;
}>;

export type BalanceLabAuthoritativeMetricsV1 = Readonly<{
  endReason: "active" | "bankruptcy" | "financial_independence" | "retirement";
  grade: string | null;
  retirementFiProgressPpm: number;
  displayedNetWorthCents: number;
  liquidSolvencyCents: number;
  highInterestDebtCreatedCents: number;
  interestPaidCents: number;
  forcedSaleCount: number;
  eventCountByTier: Readonly<{
    micro: number;
    medium: number;
    large: number;
    catastrophe: number;
  }>;
  catastropheCount: number;
  recoveryMonths: readonly number[];
  recoveryObservations?: readonly Readonly<{
    eventMonthIndex: number;
    status: "recovered" | "censored";
    observedMonths: number;
  }>[];
  lessonIds: readonly string[];
  noEventMonths: number;
  unavoidableFailure: boolean;
  bankruptcyResidualShortfallCents?: number;
  totalEventPlayerCostCents?: number;
  totalEventGrossCostCents?: number;
  eventImpactSamples?: readonly Readonly<{
    eventId: string;
    templateId: string;
    playerCostCents: number;
    grossCostCents: number;
  }>[];
  majorEventPacingViolationCount?: number;
  majorEventPacingSampleCount?: number;
  balanceObservations?: readonly BalanceLabBalanceObservationV1[];
  beginnerChapterEvidence?: Readonly<{
    outcome: BeginnerChapterOutcomeV1;
    completed: boolean;
    observedMonths: number;
    scorePpm: number;
    preparednessBand: PreparednessBandV1;
  }>;
  eventDecisionEvidence?: readonly Readonly<{
    eventId: string;
    templateId: string;
    choiceId: string;
    availableChoiceIds: readonly string[];
  }>[];
  /** Objective values are produced by their production owner, never recalculated by the lab. */
  objectiveValues: Readonly<Record<string, number>>;
}>;

export type BalanceLabProductionOwnersV1<State, MonthlyRecord> = Readonly<{
  createOpeningState(input: Readonly<{
    personaId: string;
    matchedSeed: number;
    difficulty: BalanceLabDifficultyV1;
    worldRandom: WorldRandomStateV1;
  }>): State;
  checksumState(state: State): string;
  applyBotPolicy(input: Readonly<{
    state: State;
    policy: BalanceLabBotPolicyV1;
    botRandom: RandomState | undefined;
  }>): Readonly<{ state: State; nextBotRandom: RandomState | undefined }>;
  processMonth(input: Readonly<{
    state: State;
    monthIndex: number;
    difficulty: BalanceLabDifficultyV1;
    worldRandom: WorldRandomStateV1;
    policy: BalanceLabBotPolicyV1;
    botRandom: RandomState | undefined;
  }>): Readonly<{
    state: State;
    record: MonthlyRecord;
    worldRandom: WorldRandomStateV1;
    worldEvidence: BalanceLabWorldEvidenceV1;
    terminal: boolean;
    nextBotRandom?: RandomState | undefined;
    botIntents?: readonly BalanceLabBotIntentEvidenceV1[];
  }>;
  observeBalance?(input: Readonly<{
    state: State;
    record: MonthlyRecord | undefined;
    monthIndex: number;
  }>): BalanceLabBalanceObservationV1;
  readAuthoritativeMetrics(input: Readonly<{
    state: State;
    records: readonly MonthlyRecord[];
    processedMonths: number;
    terminal: boolean;
    balanceObservations: readonly BalanceLabBalanceObservationV1[];
  }>): BalanceLabAuthoritativeMetricsV1;
}>;

export type BalanceLabRunResultV1 = Readonly<{
  personaId: string;
  matchedSeed: number;
  botId: BalanceLabBotIdV1;
  openingStateChecksum: string;
  initialWorldRandom: WorldRandomStateV1;
  finalStateChecksum: string;
  finalWorldRandom: WorldRandomStateV1;
  processedMonths: number;
  terminal: boolean;
  worldEvidence: readonly BalanceLabWorldEvidenceV1[];
  botIntents: readonly BalanceLabBotIntentEvidenceV1[];
  botRandomFinal?: RandomState;
  metrics: BalanceLabAuthoritativeMetricsV1;
}>;

export type OfflineBalanceLabResultV1 = Readonly<{
  version: "offline-balance-lab-v1";
  spec: BalanceLabRunSpecV1;
  configurationHash: string;
  runs: readonly BalanceLabRunResultV1[];
  deterministicResultFingerprint: string;
}>;

const HASH = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function ownerViolation(message: string): never {
  throw new OfflineBalanceLabV1Error("PRODUCTION_OWNER_VIOLATION", message);
}

function requireSafeInteger(value: number, label: string, minimum?: number): void {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && value < minimum)) {
    ownerViolation(`${label} must be a safe integer${minimum === undefined ? "" : ` >= ${minimum}`}`);
  }
}

function validateWorldEvidence(
  evidence: BalanceLabWorldEvidenceV1,
  monthIndex: number,
  world: WorldRandomStateV1,
): BalanceLabWorldEvidenceV1 {
  if (
    evidence.monthIndex !== monthIndex ||
    !HASH.test(evidence.macroEvidenceHash) ||
    !HASH.test(evidence.rawOpportunityFingerprint) ||
    evidence.nextMacroStateValue !== world.macro.value ||
    evidence.nextOpportunityEpochValue !== world.eventOpportunity.value
  ) {
    ownerViolation(`month ${monthIndex} returned inconsistent world evidence`);
  }
  return Object.freeze({ ...evidence });
}

function validateMetrics(
  metrics: BalanceLabAuthoritativeMetricsV1,
  processedMonths: number,
): BalanceLabAuthoritativeMetricsV1 {
  if (!(metrics.endReason === "active" || metrics.endReason === "bankruptcy" || metrics.endReason === "financial_independence" || metrics.endReason === "retirement")) {
    ownerViolation("production outcome returned an unsupported end reason");
  }
  if (metrics.grade !== null && (typeof metrics.grade !== "string" || !IDENTIFIER.test(metrics.grade))) {
    ownerViolation("production grade must be null or a canonical identifier");
  }
  requireSafeInteger(metrics.retirementFiProgressPpm, "retirement FI progress", 0);
  if (metrics.retirementFiProgressPpm > 1_000_000) ownerViolation("retirement FI progress exceeds 1,000,000 PPM");
  requireSafeInteger(metrics.displayedNetWorthCents, "displayed net worth");
  requireSafeInteger(metrics.liquidSolvencyCents, "liquid solvency");
  requireSafeInteger(metrics.highInterestDebtCreatedCents, "high-interest debt", 0);
  requireSafeInteger(metrics.interestPaidCents, "interest paid", 0);
  requireSafeInteger(metrics.forcedSaleCount, "forced-sale count", 0);
  for (const [tier, count] of Object.entries(metrics.eventCountByTier)) {
    requireSafeInteger(count, `${tier} event count`, 0);
  }
  requireSafeInteger(metrics.catastropheCount, "catastrophe count", 0);
  if (metrics.catastropheCount !== metrics.eventCountByTier.catastrophe) {
    ownerViolation("catastrophe count conflicts with event tier evidence");
  }
  for (const recovery of metrics.recoveryMonths) requireSafeInteger(recovery, "recovery month count", 0);
  for (const recovery of metrics.recoveryObservations ?? []) {
    requireSafeInteger(recovery.eventMonthIndex, "recovery event month", 0);
    requireSafeInteger(recovery.observedMonths, "recovery observed months", 0);
    if (!(recovery.status === "recovered" || recovery.status === "censored")) {
      ownerViolation("recovery observation has unsupported status");
    }
  }
  if (!metrics.lessonIds.every((lessonId) => IDENTIFIER.test(lessonId))) {
    ownerViolation("lesson evidence contains an invalid identifier");
  }
  requireSafeInteger(metrics.noEventMonths, "no-event count", 0);
  if (metrics.noEventMonths > processedMonths) ownerViolation("no-event count exceeds processed months");
  if (typeof metrics.unavoidableFailure !== "boolean") ownerViolation("unavoidable failure must be boolean");
  requireSafeInteger(
    metrics.bankruptcyResidualShortfallCents ?? 0,
    "bankruptcy residual shortfall",
    0,
  );
  if (metrics.totalEventPlayerCostCents !== undefined) {
    requireSafeInteger(metrics.totalEventPlayerCostCents, "event player cost", 0);
  }
  if (metrics.totalEventGrossCostCents !== undefined) {
    requireSafeInteger(metrics.totalEventGrossCostCents, "event gross cost", 0);
    if ((metrics.totalEventPlayerCostCents ?? 0) > metrics.totalEventGrossCostCents) {
      ownerViolation("event player cost exceeds gross event cost");
    }
  }
  for (const sample of metrics.eventImpactSamples ?? []) {
    if (!IDENTIFIER.test(sample.eventId) || !IDENTIFIER.test(sample.templateId)) {
      ownerViolation("event impact evidence requires canonical identities");
    }
    requireSafeInteger(sample.playerCostCents, "event impact player cost", 0);
    requireSafeInteger(sample.grossCostCents, "event impact gross cost", 1);
    if (sample.playerCostCents > sample.grossCostCents) {
      ownerViolation("event impact player cost exceeds gross cost");
    }
  }
  requireSafeInteger(
    metrics.majorEventPacingViolationCount ?? 0,
    "major-event pacing violation count",
    0,
  );
  requireSafeInteger(
    metrics.majorEventPacingSampleCount ?? 0,
    "major-event pacing sample count",
    0,
  );
  if (
    (metrics.majorEventPacingViolationCount ?? 0) >
    (metrics.majorEventPacingSampleCount ?? 0)
  ) ownerViolation("major-event pacing violations exceed samples");
  for (const [objectiveId, value] of Object.entries(metrics.objectiveValues)) {
    if (!IDENTIFIER.test(objectiveId)) ownerViolation("objective id must be canonical");
    requireSafeInteger(value, `objective ${objectiveId}`);
  }
  return Object.freeze({
    ...metrics,
    eventCountByTier: Object.freeze({ ...metrics.eventCountByTier }),
    recoveryMonths: Object.freeze([...metrics.recoveryMonths]),
    recoveryObservations: Object.freeze(
      (metrics.recoveryObservations ?? []).map((observation) =>
        Object.freeze({ ...observation }),
      ),
    ),
    lessonIds: Object.freeze([...metrics.lessonIds]),
    eventImpactSamples: Object.freeze(
      (metrics.eventImpactSamples ?? []).map((sample) => Object.freeze({ ...sample })),
    ),
    majorEventPacingViolationCount:
      metrics.majorEventPacingViolationCount ?? 0,
    majorEventPacingSampleCount: metrics.majorEventPacingSampleCount ?? 0,
    objectiveValues: Object.freeze({ ...metrics.objectiveValues }),
    bankruptcyResidualShortfallCents:
      metrics.bankruptcyResidualShortfallCents ?? 0,
    ...(metrics.balanceObservations === undefined
      ? {}
      : { balanceObservations: Object.freeze([...metrics.balanceObservations]) }),
  });
}

function classifyMatchedUnavoidableFailures(
  runs: readonly BalanceLabRunResultV1[],
  expectedBotCount: number,
): readonly BalanceLabRunResultV1[] {
  const cohorts = new Map<string, BalanceLabRunResultV1[]>();
  for (const run of runs) {
    const key = `${run.personaId}|${run.matchedSeed}`;
    const cohort = cohorts.get(key) ?? [];
    cohort.push(run);
    cohorts.set(key, cohort);
  }
  const unavoidableKeys = new Set(
    [...cohorts.entries()]
      .filter(([, cohort]) =>
        cohort.length === expectedBotCount &&
        cohort.every(({ metrics }) =>
          metrics.endReason === "bankruptcy" &&
          (metrics.bankruptcyResidualShortfallCents ?? 0) > 0,
        ),
      )
      .map(([key]) => key),
  );
  return Object.freeze(runs.map((run) => Object.freeze({
    ...run,
    metrics: Object.freeze({
      ...run.metrics,
      unavoidableFailure: unavoidableKeys.has(`${run.personaId}|${run.matchedSeed}`),
    }),
  })));
}

function assertMatchedWorlds(runs: readonly BalanceLabRunResultV1[]): void {
  const references = new Map<string, Readonly<{
    botId: BalanceLabBotIdV1;
    evidence: BalanceLabWorldEvidenceV1;
  }>>();
  for (const run of runs) {
    for (const evidence of run.worldEvidence) {
      if (run.terminal && evidence.monthIndex === run.processedMonths - 1) {
        continue;
      }
      const key = `${run.personaId}|${run.matchedSeed}|${evidence.monthIndex}`;
      const reference = references.get(key);
      if (reference === undefined) {
        references.set(key, Object.freeze({ botId: run.botId, evidence }));
      } else if (sha256Canonical(reference.evidence) !== sha256Canonical(evidence)) {
        const divergentFields = Object.keys(reference.evidence).filter(
          (field) =>
            reference.evidence[field as keyof BalanceLabWorldEvidenceV1] !==
            evidence[field as keyof BalanceLabWorldEvidenceV1],
        );
        throw new OfflineBalanceLabV1Error(
          "MATCHED_WORLD_DIVERGENCE",
          `matched world evidence diverged for ${key} (${reference.botId} vs ${run.botId}): ${divergentFields.join(",")}`,
        );
      }
    }
  }
}

function initialWorldRandom(spec: BalanceLabRunSpecV1, personaId: string, matchedSeed: number) {
  return initializeNamedWorldRandomV1(
    randomState(
      [spec.version, spec.experimentId, personaId, String(matchedSeed), "world"].join(" | "),
    ),
  );
}

export function runOfflineBalanceLabV1<State, MonthlyRecord>(
  unsafeSpec: BalanceLabRunSpecV1,
  owners: BalanceLabProductionOwnersV1<State, MonthlyRecord>,
): OfflineBalanceLabResultV1 {
  const spec = decodeBalanceLabRunSpecV1(unsafeSpec);
  const runs: BalanceLabRunResultV1[] = [];

  for (const personaId of spec.personaIds) {
    for (const matchedSeed of spec.matchedSeeds) {
      const openingWorld = initialWorldRandom(spec, personaId, matchedSeed);
      let matchedOpeningChecksum: string | undefined;
      for (const botId of spec.botIds) {
        let state = owners.createOpeningState({
          personaId,
          matchedSeed,
          difficulty: spec.difficulty,
          worldRandom: openingWorld,
        });
        const openingStateChecksum = owners.checksumState(state);
        if (!HASH.test(openingStateChecksum)) ownerViolation("opening state checksum must be SHA-256");
        matchedOpeningChecksum ??= openingStateChecksum;
        if (openingStateChecksum !== matchedOpeningChecksum) {
          ownerViolation("matched bots did not receive the same opening production state");
        }
        const balanceObservations: BalanceLabBalanceObservationV1[] = [];
        if (owners.observeBalance !== undefined) {
          balanceObservations.push(owners.observeBalance({
            state,
            record: undefined,
            monthIndex: -1,
          }));
        }

        let botRandom = botId === "random-control-v1"
          ? deriveBalanceLabBotRandomStateV1({ experimentId: spec.experimentId, personaId, matchedSeed })
          : undefined;
        const applied = owners.applyBotPolicy({
          state,
          policy: balanceLabBotPolicyV1(botId),
          botRandom,
        });
        state = applied.state;
        botRandom = applied.nextBotRandom;

        let worldRandom = openingWorld;
        const records: MonthlyRecord[] = [];
        const worldEvidence: BalanceLabWorldEvidenceV1[] = [];
        const botIntents: BalanceLabBotIntentEvidenceV1[] = [];
        let terminal = false;
        for (let monthIndex = 0; monthIndex < spec.horizonMonths && !terminal; monthIndex += 1) {
          const transition = owners.processMonth({
            state,
            monthIndex,
            difficulty: spec.difficulty,
            worldRandom,
            policy: balanceLabBotPolicyV1(botId),
            botRandom,
          });
          state = transition.state;
          worldRandom = decodeWorldRandomStateV1(transition.worldRandom);
          records.push(transition.record);
          if (owners.observeBalance !== undefined) {
            balanceObservations.push(owners.observeBalance({
              state,
              record: transition.record,
              monthIndex,
            }));
          }
          worldEvidence.push(validateWorldEvidence(transition.worldEvidence, monthIndex, worldRandom));
          botRandom = transition.nextBotRandom ?? botRandom;
          botIntents.push(...(
            transition.botIntents ?? [Object.freeze({
              monthIndex,
              intentId: balanceLabBotPolicyV1(botId).monthlyIntent.id,
              command: balanceLabBotPolicyV1(botId).monthlyAction,
              disposition: "not_applicable" as const,
            })]
          ));
          terminal = transition.terminal;
        }

        const metrics = validateMetrics(
          owners.readAuthoritativeMetrics({
            state,
            records: Object.freeze([...records]),
            processedMonths: records.length,
            terminal,
            balanceObservations: Object.freeze([...balanceObservations]),
          }),
          records.length,
        );
        const finalStateChecksum = owners.checksumState(state);
        if (!HASH.test(finalStateChecksum)) ownerViolation("final state checksum must be SHA-256");
        const runBase = {
          personaId,
          matchedSeed,
          botId,
          openingStateChecksum,
          initialWorldRandom: openingWorld,
          finalStateChecksum,
          finalWorldRandom: worldRandom,
          processedMonths: records.length,
          terminal,
          worldEvidence: Object.freeze([...worldEvidence]),
          botIntents: Object.freeze([...botIntents]),
          metrics,
        };
        runs.push(
          Object.freeze(
            botRandom === undefined
              ? runBase
              : { ...runBase, botRandomFinal: Object.freeze({ ...botRandom }) },
          ),
        );
      }
    }
  }

  const frozenRuns = classifyMatchedUnavoidableFailures(runs, spec.botIds.length);
  assertMatchedWorlds(frozenRuns);
  const configurationHash = sha256Canonical({
    spec,
    worldRandomVersion: "named-world-rng-v1",
    botPolicies: spec.botIds.map(balanceLabBotPolicyV1),
  });
  const fingerprintInput = {
    version: "offline-balance-lab-v1" as const,
    spec,
    configurationHash,
    runs: frozenRuns,
  };
  return Object.freeze({
    ...fingerprintInput,
    deterministicResultFingerprint: sha256Canonical(fingerprintInput),
  });
}
