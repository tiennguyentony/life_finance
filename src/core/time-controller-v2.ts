import { buildCheckpointEvidenceV2, type CheckpointEvidenceV2 } from "./checkpoint-v2";
import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents } from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import { calculateMonthlyCashFlowDeficitV2 } from "./financial-kernel-v2";
import { calculateNetWorth, type GameOutcome } from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PendingEventV2,
} from "./game-state-v2";
import {
  dueLifeMilestones,
  lifeMilestoneState,
  type ScheduledLifeMilestoneV1,
} from "./life-milestones-v2";
import {
  processMonthlyTurnV2,
  type MonthlyTurnV2Record,
  type ProcessMonthV2Command,
} from "./monthly-turn-v2";

export const MAX_TIME_CONTROLLER_MONTHS_V2 = 480;
export const TIME_CONTROLLER_V2_VERSION = "time-controller-v2.0.0" as const;

export type TimeAdvanceModeV2 =
  | Readonly<{ kind: "one_month" }>
  | Readonly<{ kind: "months"; months: number }>
  | Readonly<{ kind: "until_event" }>
  | Readonly<{ kind: "until_checkpoint"; intervalMonths: number }>
  | Readonly<{ kind: "until_decision" }>
  | Readonly<{ kind: "until_end" }>
  | Readonly<{
      kind: "resume";
      resolvedDecisionId: string;
      months: number;
    }>
  | Readonly<{ kind: "stop" }>;

export type AdvanceTimeV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "advance_time_v2";
  maxMonths: number;
  mode: TimeAdvanceModeV2;
  checkpointIntervalMonths?: number;
  monthlyInputs: readonly Readonly<{
    commandId: string;
    payload: ProcessMonthV2Command["payload"];
  }>[];
}>;

export type PendingDecisionV2 = Readonly<{
  kind: "life_milestone";
  milestones: readonly ScheduledLifeMilestoneV1[];
}>;

export type FinancialWarningV2 = Readonly<{
  kind: "monthly_cash_flow_deficit";
  cashFlowDeficitCents: MoneyCents;
}>;

export type PauseReasonV2 =
  | Readonly<{ kind: "requested_duration"; requestedMonths: number }>
  | Readonly<{
      kind: "periodic_checkpoint";
      checkpointMonth: SimulationMonth;
    }>
  | Readonly<{ kind: "event_response"; eventId: string }>
  | Readonly<{
      kind: "policy_decision";
      decisionKind: PendingDecisionV2["kind"];
    }>
  | Readonly<{
      kind: "financial_warning";
      warning: FinancialWarningV2;
    }>
  | Readonly<{ kind: "financial_independence" }>
  | Readonly<{ kind: "retirement" }>
  | Readonly<{ kind: "bankruptcy" }>
  | Readonly<{ kind: "explicit_user_stop" }>
  | Readonly<{ kind: "bounded_limit"; maxMonths: number }>;

export type TimeControllerStepV2 = Readonly<{
  command: ProcessMonthV2Command;
  record: MonthlyTurnV2Record;
  resultingMonth: SimulationMonth;
  resultingRevision: number;
}>;

export type TimeControllerUiChangesV2 = Readonly<{
  kind: "time_advance_summary_v2";
  fromMonth: SimulationMonth;
  toMonth: SimulationMonth;
  monthsAdvanced: number;
  pauseKind: PauseReasonV2["kind"];
  cashChangeCents: MoneyCents;
  netWorthChangeCents: MoneyCents;
  totalGrossIncomeCents: MoneyCents;
  totalTaxCents: MoneyCents;
  totalAfterTaxCashIncomeCents: MoneyCents;
  totalRequiredCashCents: MoneyCents;
  totalMarketValueChangeCents: MoneyCents;
}>;

export type TimeControllerV2Result = Readonly<{
  monthsAdvanced: number;
  state: GameStateV2;
  pauseReason: PauseReasonV2;
  pendingEvent: PendingEventV2 | null;
  pendingDecision: PendingDecisionV2 | null;
  checkpointInput: CheckpointEvidenceV2 | null;
  endCondition: GameOutcome | null;
  steps: readonly TimeControllerStepV2[];
  records: readonly MonthlyTurnV2Record[];
  uiChanges: TimeControllerUiChangesV2;
}>;

type MonthlyTurnDependencies = NonNullable<
  Parameters<typeof processMonthlyTurnV2>[2]
>;

export type TimeControllerV2Dependencies = MonthlyTurnDependencies &
  Readonly<{
    processMonth?: typeof processMonthlyTurnV2;
  }>;

export class TimeControllerV2Error extends Error {
  readonly code: "INVALID_COMMAND" | "INPUT_COUNT_MISMATCH";

  constructor(code: TimeControllerV2Error["code"], message: string) {
    super(message);
    this.name = "TimeControllerV2Error";
    this.code = code;
  }
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;

type ValidatedCommand = Readonly<{
  processingLimit: number;
  checkpointInterval: number | null;
  requestedDuration: number | null;
}>;

function boundedMonths(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_TIME_CONTROLLER_MONTHS_V2
  );
}

function validateCommand(command: AdvanceTimeV2Command): ValidatedCommand {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "advance_time_v2" ||
    !IDENTIFIER.test(command.id) ||
    !boundedMonths(command.maxMonths) ||
    !Array.isArray(command.monthlyInputs)
  ) {
    throw new TimeControllerV2Error(
      "INVALID_COMMAND",
      "invalid time-controller command envelope",
    );
  }

  const inputIds = command.monthlyInputs.map(({ commandId }) => commandId);
  if (
    inputIds.some((id) => !IDENTIFIER.test(id)) ||
    new Set(inputIds).size !== inputIds.length
  ) {
    throw new TimeControllerV2Error(
      "INVALID_COMMAND",
      "monthly input command ids must be unique safe identifiers",
    );
  }

  let processingLimit = command.maxMonths;
  let requestedDuration: number | null = null;
  let checkpointInterval: number | null = null;
  const mode = command.mode;
  switch (mode.kind) {
    case "one_month":
      processingLimit = 1;
      requestedDuration = 1;
      break;
    case "months":
      if (!boundedMonths(mode.months) || mode.months > command.maxMonths) {
        throw new TimeControllerV2Error(
          "INVALID_COMMAND",
          "requested duration must fit within maxMonths",
        );
      }
      processingLimit = mode.months;
      requestedDuration = mode.months;
      break;
    case "resume":
      if (
        !IDENTIFIER.test(mode.resolvedDecisionId) ||
        !boundedMonths(mode.months) ||
        mode.months > command.maxMonths
      ) {
        throw new TimeControllerV2Error(
          "INVALID_COMMAND",
          "resume requires a resolved decision id and bounded duration",
        );
      }
      processingLimit = mode.months;
      requestedDuration = mode.months;
      break;
    case "until_checkpoint":
      if (!boundedMonths(mode.intervalMonths) || mode.intervalMonths > 12) {
        throw new TimeControllerV2Error(
          "INVALID_COMMAND",
          "checkpoint interval must be between 1 and 12 months",
        );
      }
      checkpointInterval = mode.intervalMonths;
      processingLimit = Math.min(processingLimit, checkpointInterval);
      break;
    case "until_event":
    case "until_decision":
    case "until_end":
    case "stop":
      break;
    default:
      throw new TimeControllerV2Error(
        "INVALID_COMMAND",
        "unsupported time advance mode",
      );
  }

  if (command.checkpointIntervalMonths !== undefined) {
    if (
      !boundedMonths(command.checkpointIntervalMonths) ||
      command.checkpointIntervalMonths > 12
    ) {
      throw new TimeControllerV2Error(
        "INVALID_COMMAND",
        "checkpoint interval must be between 1 and 12 months",
      );
    }
    if (
      checkpointInterval !== null &&
      checkpointInterval !== command.checkpointIntervalMonths
    ) {
      throw new TimeControllerV2Error(
        "INVALID_COMMAND",
        "time command has conflicting checkpoint intervals",
      );
    }
    checkpointInterval = command.checkpointIntervalMonths;
    processingLimit = Math.min(processingLimit, checkpointInterval);
  }

  return Object.freeze({
    processingLimit: mode.kind === "stop" ? 0 : processingLimit,
    checkpointInterval,
    requestedDuration,
  });
}

function pendingDecision(state: GameStateV2): PendingDecisionV2 | null {
  const milestones = dueLifeMilestones(state);
  return milestones.length === 0
    ? null
    : Object.freeze({
        kind: "life_milestone",
        milestones: Object.freeze([...milestones]),
      });
}

function terminalPause(outcome: GameOutcome): PauseReasonV2 {
  switch (outcome.kind) {
    case "financial_independence":
      return Object.freeze({ kind: "financial_independence" });
    case "retirement_age":
      return Object.freeze({ kind: "retirement" });
    case "bankruptcy":
      return Object.freeze({ kind: "bankruptcy" });
  }
}

function interruption(
  state: GameStateV2,
): Readonly<{
  reason: PauseReasonV2;
  event: PendingEventV2 | null;
  decision: PendingDecisionV2 | null;
}> | null {
  if (state.outcome !== null) {
    return Object.freeze({
      reason: terminalPause(state.outcome),
      event: null,
      decision: null,
    });
  }
  const event = state.gameplay.eventLifecycle.pending;
  if (event !== null) {
    return Object.freeze({
      reason: Object.freeze({ kind: "event_response", eventId: event.eventId }),
      event,
      decision: null,
    });
  }
  const decision = pendingDecision(state);
  return decision === null
    ? null
    : Object.freeze({
        reason: Object.freeze({
          kind: "policy_decision",
          decisionKind: decision.kind,
        }),
        event: null,
        decision,
      });
}

function sumMoney(
  records: readonly MonthlyTurnV2Record[],
  select: (record: MonthlyTurnV2Record) => MoneyCents,
  label: string,
): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      records.reduce(
        (sum, record) => sum + BigInt(select(record)),
        BigInt(0),
      ),
      label,
    ),
  );
}

function difference(left: MoneyCents, right: MoneyCents, label: string) {
  return moneyCents(
    safeBigIntToNumber(BigInt(left) - BigInt(right), label),
  );
}

function uiChanges(
  opening: GameStateV2,
  ending: GameStateV2,
  records: readonly MonthlyTurnV2Record[],
  pauseReason: PauseReasonV2,
): TimeControllerUiChangesV2 {
  return Object.freeze({
    kind: "time_advance_summary_v2",
    fromMonth: opening.currentMonth,
    toMonth: ending.currentMonth,
    monthsAdvanced: records.length,
    pauseKind: pauseReason.kind,
    cashChangeCents: difference(
      ending.finances.cashCents,
      opening.finances.cashCents,
      "time controller cash change",
    ),
    netWorthChangeCents: difference(
      calculateNetWorth(ending.finances),
      calculateNetWorth(opening.finances),
      "time controller net worth change",
    ),
    totalGrossIncomeCents: sumMoney(
      records,
      (record) => record.grossIncomeCents,
      "time controller gross income",
    ),
    totalTaxCents: sumMoney(
      records,
      (record) => record.totalTaxCents,
      "time controller tax",
    ),
    totalAfterTaxCashIncomeCents: sumMoney(
      records,
      (record) => record.afterTaxCashIncomeCents,
      "time controller cash income",
    ),
    totalRequiredCashCents: sumMoney(
      records,
      (record) => record.requiredCashCents,
      "time controller required cash",
    ),
    totalMarketValueChangeCents: sumMoney(
      records,
      (record) => record.marketValueChangeCents,
      "time controller market change",
    ),
  });
}

function immutableState(state: GameStateV2): GameStateV2 {
  return Object.isFrozen(state)
    ? state
    : finalizeGameStateV2(structuredClone(state));
}

function deepFreezeCopy<T>(value: T): T {
  const copied = structuredClone(value);
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) {
      return;
    }
    for (const nested of Object.values(entry)) freeze(nested);
    Object.freeze(entry);
  };
  freeze(copied);
  return copied;
}

function isLatestResolvedDecision(
  state: GameStateV2,
  commandId: string,
): boolean {
  if (state.acceptedCommandIds.at(-1) !== commandId) return false;
  return (
    state.gameplay.eventLifecycle.history.some(
      (entry) => entry.commandId === commandId,
    ) ||
    lifeMilestoneState(state).history.some(
      (entry) => entry.commandId === commandId,
    )
  );
}

function financialWarning(
  record: MonthlyTurnV2Record,
): FinancialWarningV2 | null {
  const deficit = calculateMonthlyCashFlowDeficitV2({
    afterTaxCashIncomeCents: record.afterTaxCashIncomeCents,
    resolvedIncomeCents: record.resolvedIncomeCents ?? moneyCents(0),
    requiredCashCents: record.requiredCashCents,
  });
  if (deficit === null) return null;
  return Object.freeze({
    kind: "monthly_cash_flow_deficit",
    cashFlowDeficitCents: deficit,
  });
}

function result(
  opening: GameStateV2,
  state: GameStateV2,
  pauseReason: PauseReasonV2,
  steps: readonly TimeControllerStepV2[],
  checkpointInput: CheckpointEvidenceV2 | null,
): TimeControllerV2Result {
  const finalState = immutableState(state);
  const records = Object.freeze(steps.map(({ record }) => record));
  const decision = pendingDecision(finalState);
  return Object.freeze({
    monthsAdvanced: records.length,
    state: finalState,
    pauseReason,
    pendingEvent: finalState.gameplay.eventLifecycle.pending,
    pendingDecision: decision,
    checkpointInput,
    endCondition: finalState.outcome,
    steps: Object.freeze([...steps]),
    records,
    uiChanges: uiChanges(opening, finalState, records, pauseReason),
  });
}

export function advanceTimeV2(
  state: GameStateV2,
  command: AdvanceTimeV2Command,
  dependencies: TimeControllerV2Dependencies = {},
): TimeControllerV2Result {
  const validated = validateCommand(command);
  const initialInterruption = interruption(state);
  if (initialInterruption !== null) {
    return result(state, state, initialInterruption.reason, [], null);
  }
  if (command.mode.kind === "stop") {
    return result(
      state,
      state,
      Object.freeze({ kind: "explicit_user_stop" }),
      [],
      null,
    );
  }
  if (
    command.mode.kind === "resume" &&
    !isLatestResolvedDecision(state, command.mode.resolvedDecisionId)
  ) {
    throw new TimeControllerV2Error(
      "INVALID_COMMAND",
      "resume decision id must be the latest resolved event or milestone decision",
    );
  }
  if (command.monthlyInputs.length < validated.processingLimit) {
    throw new TimeControllerV2Error(
      "INPUT_COUNT_MISMATCH",
      "time advance does not include enough pre-resolved monthly inputs",
    );
  }

  const { processMonth = processMonthlyTurnV2, ...monthlyDependencies } =
    dependencies;
  let current = state;
  const steps: TimeControllerStepV2[] = [];
  for (let index = 0; index < validated.processingLimit; index += 1) {
    const input = command.monthlyInputs[index]!;
    const monthlyCommand: ProcessMonthV2Command = Object.freeze({
      schemaVersion: 2,
      id: input.commandId,
      type: "process_month_v2",
      expectedRevision: current.revision,
      effectiveMonth: current.currentMonth,
      payload: deepFreezeCopy(input.payload),
    });
    const processed = processMonth(
      current,
      monthlyCommand,
      monthlyDependencies,
    );
    current = processed.state;
    steps.push(
      Object.freeze({
        command: monthlyCommand,
        record: processed.record,
        resultingMonth: current.currentMonth,
        resultingRevision: current.revision,
      }),
    );

    const stopped = interruption(current);
    if (stopped !== null) {
      return result(state, current, stopped.reason, steps, null);
    }
    const warning = financialWarning(processed.record);
    if (warning !== null) {
      return result(
        state,
        current,
        Object.freeze({ kind: "financial_warning", warning }),
        steps,
        null,
      );
    }
    if (
      validated.checkpointInterval !== null &&
      steps.length === validated.checkpointInterval
    ) {
      const records = steps.map(({ record }) => record);
      return result(
        state,
        current,
        Object.freeze({
          kind: "periodic_checkpoint",
          checkpointMonth: current.currentMonth,
        }),
        steps,
        buildCheckpointEvidenceV2(state, current, records),
      );
    }
    if (
      validated.requestedDuration !== null &&
      steps.length === validated.requestedDuration
    ) {
      return result(
        state,
        current,
        Object.freeze({
          kind: "requested_duration",
          requestedMonths: validated.requestedDuration,
        }),
        steps,
        null,
      );
    }
  }

  return result(
    state,
    current,
    Object.freeze({ kind: "bounded_limit", maxMonths: command.maxMonths }),
    steps,
    null,
  );
}
