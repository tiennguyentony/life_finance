import { randomUUID } from "node:crypto";

import { sha256Canonical } from "../../core/canonical";
import { buildCheckpointEvidenceV2 } from "../../core/checkpoint-v2";
import { safeBigIntToNumber } from "../../core/domain/integer";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { monthsBetween, simulationMonth } from "../../core/domain/month";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  type ProcessMonthV2Command,
} from "../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import { OUTCOME_POLICY_V1_VERSION } from "../../core/outcome-policy-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  advanceTimeV2,
  TIME_CONTROLLER_V2_VERSION,
  type PauseReasonV2,
  type TimeAdvanceModeV2,
  type TimeControllerV2Dependencies,
  type TimeControllerV2Result,
} from "../../core/time-controller-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import type { TaxCalculator } from "../tax/client";
import {
  advanceTimeV2ResponseSchema,
  commandV2ResponseSchema,
  createRunV2ResponseSchema,
  getRunV2ResponseSchema,
  migrateRunV2ResponseSchema,
  type AdvanceTimeV2Request,
  type AdvanceTimeV2Response,
  type CommandV2Response,
  type CreateRunV2Request,
  type CreateRunV2Response,
  type GameCommandV2Public,
  type GetRunV2Response,
  type MigrateRunV2Response,
} from "./contracts-v2";
import { mapPlayerCommand } from "./v2/command-mapper";
import { RunApiV2Error } from "./v2/errors";
import { summarizeMonthlyRecord } from "./v2/monthly-record";
import type { V2Repository } from "./v2/repository-port";
import { buildTaxRequest, resolveMonthlyTaxEvidence } from "./v2/tax-orchestrator";
import { fingerprintAnnualTaxContext } from "../tax/context-cache";

const AUTOMATIC_LIQUIDATION_COST_RATE_PPM = ratePpm(10_000);

export class RunApiServiceV2 {
  readonly #repository: V2Repository;
  readonly #taxCalculator: TaxCalculator;
  readonly #playerIdFactory: () => string;
  readonly #timeControllerDependencies: TimeControllerV2Dependencies;

  constructor(
    repository: V2Repository,
    taxCalculator: TaxCalculator,
    playerIdFactory: () => string = () => `player_${randomUUID()}`,
    timeControllerDependencies: TimeControllerV2Dependencies = {},
  ) {
    this.#repository = repository;
    this.#taxCalculator = taxCalculator;
    this.#playerIdFactory = playerIdFactory;
    this.#timeControllerDependencies = timeControllerDependencies;
  }

  async advanceTime(
    runId: string,
    accessSecret: string,
    request: AdvanceTimeV2Request,
  ): Promise<AdvanceTimeV2Response> {
    const current = await this.#repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    );
    const requestFingerprint = sha256Canonical(request);
    const accepted = this.#repository.loadAcceptedTimeAdvanceV2
      ? await this.#repository.loadAcceptedTimeAdvanceV2(
          runId,
          accessSecret,
          request.id,
          requestFingerprint,
        )
      : null;
    if (accepted) {
      return publicTimeAdvanceResponse(accepted);
    }
    if (current.revision !== request.expectedRevision) {
      throw new RunApiV2Error(
        "STALE_REVISION",
        "time advance revision is stale",
      );
    }
    if (current.currentMonth !== request.effectiveMonth) {
      throw new RunApiV2Error(
        "INVALID_EFFECTIVE_MONTH",
        "time advance month does not match the run",
      );
    }
    if (!this.#repository.applyTimeAdvanceV2) {
      throw new Error("time advance persistence is unavailable");
    }

    const openingChecksum = sha256Canonical(current);
    const result = await this.#prepareTimeAdvance(
      runId,
      accessSecret,
      request,
      current,
    );
    const finalStateChecksum = sha256Canonical(result.state);
    const applied = await this.#repository.applyTimeAdvanceV2(
      runId,
      accessSecret,
      Object.freeze({
        controllerVersion: TIME_CONTROLLER_V2_VERSION,
        engineVersion: current.engineVersion,
        request: Object.freeze(structuredClone(request)),
        batchId: request.id,
        requestFingerprint,
        openingRevision: current.revision,
        openingStateChecksum: openingChecksum,
        steps: result.steps,
        controllerResult: result,
        finalStateChecksum,
      }),
    );
    return publicTimeAdvanceResponse(applied);
  }

  async #prepareTimeAdvance(
    runId: string,
    accessSecret: string,
    request: AdvanceTimeV2Request,
    opening: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>,
  ): Promise<TimeControllerV2Result> {
    const probe = advanceTimeV2(
      opening,
      {
        schemaVersion: 2,
        id: request.id,
        type: "advance_time_v2",
        maxMonths: request.maxMonths,
        mode: { kind: "stop" },
        monthlyInputs: [],
      },
      this.#timeControllerDependencies,
    );
    if (
      request.mode.kind === "stop" ||
      probe.pauseReason.kind !== "explicit_user_stop"
    ) {
      return probe;
    }

    const requestedMonths =
      request.mode.kind === "one_month"
        ? 1
        : request.mode.kind === "months" || request.mode.kind === "resume"
          ? request.mode.months
          : request.maxMonths;
    const checkpointMonths =
      request.mode.kind === "until_checkpoint"
        ? request.mode.intervalMonths
        : (request.checkpointIntervalMonths ?? null);
    const processingLimit = Math.min(requestedMonths, checkpointMonths ?? requestedMonths);
    let state = opening;
    const steps: TimeControllerV2Result["steps"][number][] = [];
    const segmentResults: TimeControllerV2Result[] = [];
    let lastResult = probe;
    while (steps.length < processingLimit) {
      const remaining = processingLimit - steps.length;
      const monthNumber = Number(state.currentMonth.slice(5, 7));
      const careerTransitionMonths = state.gameplay.careerDevelopment.pending
        .map(({ completesMonth }) =>
          monthsBetween(state.currentMonth, completesMonth),
        )
        .filter((months) => months > 0)
        .reduce<number | null>(
          (earliest, months) =>
            earliest === null ? months : Math.min(earliest, months),
          null,
        );
      const segmentMonths = Math.min(
        remaining,
        13 - monthNumber,
        careerTransitionMonths ?? remaining,
      );
      const firstCommandId = monthlyBatchCommandId(request.id, steps.length + 1);
      const taxRequest = buildTaxRequest(state, firstCommandId);
      const fingerprint = fingerprintAnnualTaxContext(taxRequest);
      const evidence = await resolveMonthlyTaxEvidence({
        state,
        runId,
        accessSecret,
        commandId: firstCommandId,
        repository: this.#repository,
        taxCalculator: this.#taxCalculator,
      });
      const monthlyInputs = Array.from({ length: segmentMonths }, (_, offset) => {
        const commandId = monthlyBatchCommandId(
          request.id,
          steps.length + offset + 1,
        );
        return Object.freeze({
          commandId,
          payload: {
            financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
            outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
            taxEvidence:
              offset === 0
                ? evidence
                : Object.freeze({
                    ...evidence,
                    traceId: `tax.cache.${commandId}`,
                    contextFingerprint: fingerprint,
                  }),
            taxableLiquidationCostRatePpm:
              AUTOMATIC_LIQUIDATION_COST_RATE_PPM,
            resolvedCashFlows: [],
          },
        });
      });
      const segmentIsFinal = segmentMonths === remaining;
      const segmentMode = timeAdvanceSegmentMode(
        request,
        segmentMonths,
        segmentIsFinal,
        steps.length === 0,
      );
      const checkpointIsFinal =
        checkpointMonths !== null &&
        processingLimit === checkpointMonths &&
        segmentIsFinal;
      lastResult = advanceTimeV2(
        state,
        {
          schemaVersion: 2,
          id: request.id,
          type: "advance_time_v2",
          maxMonths: segmentMonths,
          mode: segmentMode,
          ...(checkpointIsFinal
            ? { checkpointIntervalMonths: segmentMonths }
            : {}),
          monthlyInputs,
        },
        this.#timeControllerDependencies,
      );
      segmentResults.push(lastResult);
      steps.push(...lastResult.steps);
      state = lastResult.state;
      const transportPause =
        !segmentIsFinal &&
        (lastResult.pauseReason.kind === "bounded_limit" ||
          lastResult.pauseReason.kind === "requested_duration");
      if (!transportPause) {
        const pauseReason =
          lastResult.pauseReason.kind === "requested_duration"
            ? Object.freeze({
                kind: "requested_duration" as const,
                requestedMonths,
              })
            : lastResult.pauseReason;
        const checkpointInput =
          lastResult.pauseReason.kind === "periodic_checkpoint" &&
          steps.length !== lastResult.steps.length
            ? buildCheckpointEvidenceV2(
                opening,
                state,
                steps.map(({ record }) => record),
              )
            : lastResult.checkpointInput;
        return aggregateTimeAdvanceResult(
          opening,
          lastResult,
          steps,
          pauseReason,
          checkpointInput,
          segmentResults,
        );
      }
    }
    return aggregateTimeAdvanceResult(
      opening,
      lastResult,
      steps,
      lastResult.pauseReason,
      lastResult.checkpointInput,
      segmentResults,
    );
  }

  async createRun(request: CreateRunV2Request): Promise<CreateRunV2Response> {
    if (request.catalogVersion !== US_2026_SCENARIO_CATALOG_VERSION) {
      throw new TypeError("unsupported scenario catalog version");
    }
    const resolvedScenario = resolveScenarioCatalogSelection(
      US_2026_SCENARIO_CATALOG,
      {
        catalogVersion: request.catalogVersion,
        locationId: request.locationId,
        careerId: request.careerId,
        householdId: request.householdId,
        benefitsPackageId: request.benefitsPackageId,
        healthPlanId: request.healthPlanId,
        retirementPlanId: request.retirementPlanId,
        insuranceCoverageIds: request.insuranceCoverageIds,
        scenarioId: request.scenarioId,
      },
    );
    const created = await this.#repository.createRunV2((runId) =>
      createNativeGameStateV2({
        runId,
        playerId: this.#playerIdFactory(),
        birthMonth: simulationMonth(request.birthMonth),
        startMonth: simulationMonth(request.startMonth),
        randomSeed: String(request.randomSeed),
        resolvedScenario,
        annualGrossSalaryCents: moneyCents(request.annualGrossSalaryCents),
        ...(request.financialGoal
          ? {
              financialGoal: {
                ...request.financialGoal,
                desiredAnnualSpendingCents: moneyCents(
                  request.financialGoal.desiredAnnualSpendingCents,
                ),
                safeWithdrawalRatePpm: ratePpm(
                  request.financialGoal.safeWithdrawalRatePpm,
                ),
              },
            }
          : {}),
        finances: {
          ...request.finances,
          cashCents: moneyCents(request.finances.cashCents),
          taxableBroadIndexCents: moneyCents(
            request.finances.taxableBroadIndexCents,
          ),
          taxableSectorCents: moneyCents(
            request.finances.taxableSectorCents,
          ),
          taxableSpeculativeCents: moneyCents(
            request.finances.taxableSpeculativeCents,
          ),
          retirement401kCents: moneyCents(
            request.finances.retirement401kCents,
          ),
          retirementIraCents: moneyCents(
            request.finances.retirementIraCents,
          ),
          hsaCents: moneyCents(request.finances.hsaCents),
          homeValueCents: moneyCents(request.finances.homeValueCents),
          otherAssetsCents: moneyCents(request.finances.otherAssetsCents),
          termDebts: request.finances.termDebts.map((debt) => ({
            ...debt,
            principalCents: moneyCents(debt.principalCents),
            annualInterestRatePpm: ratePpm(debt.annualInterestRatePpm),
            minimumPaymentCents: moneyCents(debt.minimumPaymentCents),
          })),
          revolvingCreditLimitCents: moneyCents(
            request.finances.revolvingCreditLimitCents,
          ),
          revolvingCreditUsedCents: moneyCents(
            request.finances.revolvingCreditUsedCents,
          ),
        },
        wellbeing: {
          burnoutPpm: ratePpm(request.wellbeing.burnoutPpm),
          happinessPpm: ratePpm(request.wellbeing.happinessPpm),
        },
        marketRegime: request.marketRegime,
      }),
    );
    return createRunV2ResponseSchema.parse({
      runId: created.runId,
      accessSecret: created.accessSecret,
      state: created.state,
      stateChecksum: created.stateChecksum,
    });
  }

  async getRun(runId: string, accessSecret: string): Promise<GetRunV2Response> {
    const state = await this.#repository.loadAuthorizedRunV2(runId, accessSecret);
    return getRunV2ResponseSchema.parse({
      state,
      stateChecksum: sha256Canonical(state),
    });
  }

  async migrateRun(
    runId: string,
    accessSecret: string,
  ): Promise<MigrateRunV2Response> {
    return migrateRunV2ResponseSchema.parse(
      await this.#repository.migrateRunStateToV2(runId, accessSecret),
    );
  }

  async getCheckpoint(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ) {
    return {
      evidence: await this.#repository.loadCheckpointEvidenceV2(
        runId,
        accessSecret,
        fromRevision,
      ),
    };
  }

  async submitCommand(
    runId: string,
    accessSecret: string,
    command: GameCommandV2Public,
  ): Promise<CommandV2Response> {
    if (command.type !== "process_month") {
      const result = await this.#repository.applyCommandV2(
        runId,
        accessSecret,
        mapPlayerCommand(command),
      );
      return commandV2ResponseSchema.parse({ ...result, monthlyRecord: null });
    }

    const current = await this.#repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    );
    const acceptedReplay = current.acceptedCommandIds.includes(command.id)
      ? await this.#repository.loadAcceptedMonthlyCommandV2(
          runId,
          accessSecret,
          command.id,
        )
      : null;
    this.#validateMonthlyCommand(current, command, acceptedReplay !== null);
    let internal: ProcessMonthV2Command;
    if (acceptedReplay) {
      this.#validateMonthlyReplayEnvelope(command, acceptedReplay);
      internal = acceptedReplay;
    } else {
      const evidence = await resolveMonthlyTaxEvidence({
        state: current,
        runId,
        accessSecret,
        commandId: command.id,
        repository: this.#repository,
        taxCalculator: this.#taxCalculator,
      });
      internal = {
        schemaVersion: 2,
        id: command.id,
        type: "process_month_v2",
        expectedRevision: command.expectedRevision,
        effectiveMonth: simulationMonth(command.effectiveMonth),
        payload: {
          financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
          outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
          taxEvidence: evidence,
          taxableLiquidationCostRatePpm: AUTOMATIC_LIQUIDATION_COST_RATE_PPM,
          resolvedCashFlows: [],
        },
      };
    }
    const applied = await this.#repository.applyCommandV2(
      runId,
      accessSecret,
      internal,
    );
    return commandV2ResponseSchema.parse({
      ...applied,
      monthlyRecord: applied.monthlyRecord
        ? summarizeMonthlyRecord(applied.monthlyRecord)
        : null,
    });
  }

  #validateMonthlyCommand(
    current: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>,
    command: Extract<GameCommandV2Public, { type: "process_month" }>,
    isReplay: boolean,
  ): void {
    if (isReplay) return;
    if (current.outcome) {
      throw new RunApiV2Error(
        "RUN_TERMINAL",
        "terminal runs reject monthly commands",
      );
    }
    if (current.gameplay.eventLifecycle.pending) {
      throw new RunApiV2Error(
        "PENDING_EVENT",
        "pending event choice must be resolved before monthly progression",
      );
    }
    if (command.expectedRevision !== current.revision) {
      throw new RunApiV2Error(
        "STALE_REVISION",
        "monthly command revision is stale",
      );
    }
    if (command.effectiveMonth !== current.currentMonth) {
      throw new RunApiV2Error(
        "INVALID_EFFECTIVE_MONTH",
        "monthly command month does not match the run",
      );
    }
  }

  #validateMonthlyReplayEnvelope(
    command: Extract<GameCommandV2Public, { type: "process_month" }>,
    accepted: ProcessMonthV2Command,
  ): void {
    if (command.expectedRevision !== accepted.expectedRevision) {
      throw new RunApiV2Error(
        "STALE_REVISION",
        "replayed monthly command must use its accepted revision",
      );
    }
    if (simulationMonth(command.effectiveMonth) !== accepted.effectiveMonth) {
      throw new RunApiV2Error(
        "INVALID_EFFECTIVE_MONTH",
        "replayed monthly command must use its accepted effective month",
      );
    }
  }
}

function monthlyBatchCommandId(batchId: string, sequence: number): string {
  const candidate = `${batchId}.month.${sequence}`;
  return candidate.length <= 96
    ? candidate
    : `advance.${sha256Canonical({ batchId, sequence }).slice(0, 64)}`;
}

function timeAdvanceSegmentMode(
  request: AdvanceTimeV2Request,
  segmentMonths: number,
  segmentIsFinal: boolean,
  firstSegment: boolean,
): TimeAdvanceModeV2 {
  switch (request.mode.kind) {
    case "one_month":
      return Object.freeze({ kind: "one_month" });
    case "months":
      return segmentIsFinal
        ? Object.freeze({ kind: "months", months: segmentMonths })
        : Object.freeze({ kind: "until_end" });
    case "resume":
      if (firstSegment) {
        return Object.freeze({
          kind: "resume",
          resolvedDecisionId: request.mode.resolvedDecisionId,
          months: segmentMonths,
        });
      }
      return segmentIsFinal
        ? Object.freeze({ kind: "months", months: segmentMonths })
        : Object.freeze({ kind: "until_end" });
    case "until_event":
    case "until_decision":
    case "until_end":
      return request.mode;
    case "until_checkpoint":
      return segmentIsFinal
        ? Object.freeze({
            kind: "until_checkpoint",
            intervalMonths: segmentMonths,
          })
        : Object.freeze({ kind: "until_end" });
    case "stop":
      return Object.freeze({ kind: "stop" });
  }
}

function sumSegmentMoney(
  results: readonly TimeControllerV2Result[],
  select: (result: TimeControllerV2Result) => number,
  label: string,
) {
  return moneyCents(
    safeBigIntToNumber(
      results.reduce(
        (sum, result) => sum + BigInt(select(result)),
        BigInt(0),
      ),
      label,
    ),
  );
}

function aggregateTimeAdvanceResult(
  opening: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>,
  lastResult: TimeControllerV2Result,
  steps: readonly TimeControllerV2Result["steps"][number][],
  pauseReason: PauseReasonV2,
  checkpointInput: TimeControllerV2Result["checkpointInput"],
  segmentResults: readonly TimeControllerV2Result[],
): TimeControllerV2Result {
  const records = Object.freeze(steps.map(({ record }) => record));
  return Object.freeze({
    monthsAdvanced: steps.length,
    state: lastResult.state,
    pauseReason,
    pendingEvent: lastResult.pendingEvent,
    pendingDecision: lastResult.pendingDecision,
    checkpointInput,
    endCondition: lastResult.endCondition,
    steps: Object.freeze([...steps]),
    records,
    uiChanges: Object.freeze({
      kind: "time_advance_summary_v2",
      fromMonth: opening.currentMonth,
      toMonth: lastResult.state.currentMonth,
      monthsAdvanced: steps.length,
      pauseKind: pauseReason.kind,
      cashChangeCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.cashChangeCents,
        "time advance aggregate cash change",
      ),
      netWorthChangeCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.netWorthChangeCents,
        "time advance aggregate net worth change",
      ),
      totalGrossIncomeCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.totalGrossIncomeCents,
        "time advance aggregate gross income",
      ),
      totalTaxCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.totalTaxCents,
        "time advance aggregate tax",
      ),
      totalAfterTaxCashIncomeCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.totalAfterTaxCashIncomeCents,
        "time advance aggregate after-tax income",
      ),
      totalRequiredCashCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.totalRequiredCashCents,
        "time advance aggregate required cash",
      ),
      totalMarketValueChangeCents: sumSegmentMoney(
        segmentResults,
        (result) => result.uiChanges.totalMarketValueChangeCents,
        "time advance aggregate market change",
      ),
    }),
  });
}

function publicTimeAdvanceResponse(
  result: TimeControllerV2Result &
    Readonly<{ stateChecksum: string; idempotentReplay: boolean }>,
): AdvanceTimeV2Response {
  return advanceTimeV2ResponseSchema.parse({
    state: result.state,
    stateChecksum: result.stateChecksum,
    idempotentReplay: result.idempotentReplay,
    monthsAdvanced: result.monthsAdvanced,
    pauseReason: result.pauseReason,
    pendingEvent: result.pendingEvent,
    pendingDecision: result.pendingDecision,
    checkpointInput: result.checkpointInput,
    endCondition: result.endCondition,
    uiChanges: result.uiChanges,
  });
}
