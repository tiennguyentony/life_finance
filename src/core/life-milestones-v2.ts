import { moneyCents, type MoneyCents } from "./domain/money";
import {
  addMonths,
  compareMonths,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { reconcileFinancesWithLedger } from "./game-state";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import { appendTransaction } from "./ledger";

export const LIFE_MILESTONE_VERSION = "life-milestone-v1" as const;

export type LifeMilestoneKind =
  | "move"
  | "vehicle"
  | "wedding"
  | "child"
  | "education"
  | "travel"
  | "caregiving"
  | "custom";

export type ScheduledLifeMilestoneV1 = Readonly<{
  version: typeof LIFE_MILESTONE_VERSION;
  milestoneId: string;
  kind: LifeMilestoneKind;
  label: string;
  targetMonth: SimulationMonth;
  estimatedCostCents: MoneyCents;
  postponementCount: number;
  createdMonth: SimulationMonth;
}>;

export type ResolvedLifeMilestoneV1 = Readonly<
  Omit<ScheduledLifeMilestoneV1, "targetMonth" | "postponementCount"> & {
  plannedMonth: SimulationMonth;
  resolvedMonth: SimulationMonth;
  resolution: "paid_cash" | "cancelled";
  actualCostCents: MoneyCents;
  postponementCount: number;
  commandId: string;
  }
>;

export type LifeMilestoneStateV1 = Readonly<{
  version: typeof LIFE_MILESTONE_VERSION;
  scheduled: readonly ScheduledLifeMilestoneV1[];
  history: readonly ResolvedLifeMilestoneV1[];
}>;

export type ManageLifeMilestoneV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "manage_life_milestone";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload:
    | Readonly<{
        action: "schedule";
        milestoneId: string;
        kind: LifeMilestoneKind;
        label: string;
        targetMonth: SimulationMonth;
        estimatedCostCents: MoneyCents;
      }>
    | Readonly<{
        action: "resolve";
        milestoneId: string;
        resolution: "pay_cash" | "postpone_6_months" | "cancel";
      }>;
}>;

export class LifeMilestoneV2Error extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "DUPLICATE_MILESTONE"
    | "MILESTONE_LIMIT"
    | "MILESTONE_NOT_FOUND"
    | "MILESTONE_NOT_DUE"
    | "MILESTONE_DECISION_REQUIRED"
    | "INSUFFICIENT_CASH";

  constructor(code: LifeMilestoneV2Error["code"], message: string) {
    super(message);
    this.name = "LifeMilestoneV2Error";
    this.code = code;
  }
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const KINDS: ReadonlySet<string> = new Set<LifeMilestoneKind>([
  "move", "vehicle", "wedding", "child", "education", "travel", "caregiving", "custom",
]);

export function emptyLifeMilestoneState(): LifeMilestoneStateV1 {
  return Object.freeze({
    version: LIFE_MILESTONE_VERSION,
    scheduled: Object.freeze([]),
    history: Object.freeze([]),
  });
}

export function lifeMilestoneState(state: GameStateV2): LifeMilestoneStateV1 {
  return state.gameplay.lifeMilestones ?? emptyLifeMilestoneState();
}

export function validateLifeMilestoneState(value: LifeMilestoneStateV1): void {
  if (value.version !== LIFE_MILESTONE_VERSION || value.scheduled.length > 12) {
    throw new RangeError("life milestone state version or scheduled limit is invalid");
  }
  const all = [...value.scheduled, ...value.history];
  if (new Set(all.map(({ milestoneId }) => milestoneId)).size !== all.length) {
    throw new RangeError("life milestone ids must be unique across the run");
  }
  for (const entry of all) {
    if (
      !ID.test(entry.milestoneId) ||
      !KINDS.has(entry.kind) ||
      entry.label.trim().length < 1 ||
      entry.label.length > 80 ||
      !Number.isSafeInteger(entry.estimatedCostCents) ||
      entry.estimatedCostCents <= 0 ||
      !Number.isSafeInteger(entry.postponementCount) ||
      entry.postponementCount < 0
    ) {
      throw new RangeError("life milestone entry is invalid");
    }
    simulationMonth(entry.createdMonth);
  }
  for (const entry of value.scheduled) simulationMonth(entry.targetMonth);
  for (const entry of value.history) {
    simulationMonth(entry.plannedMonth);
    simulationMonth(entry.resolvedMonth);
    if (
      !ID.test(entry.commandId) ||
      !Number.isSafeInteger(entry.actualCostCents) ||
      entry.actualCostCents < 0 ||
      (entry.resolution === "paid_cash" && entry.actualCostCents !== entry.estimatedCostCents) ||
      (entry.resolution === "cancelled" && entry.actualCostCents !== 0)
    ) {
      throw new RangeError("resolved life milestone evidence is invalid");
    }
  }
}

export function dueLifeMilestones(
  state: GameStateV2,
): readonly ScheduledLifeMilestoneV1[] {
  return lifeMilestoneState(state).scheduled.filter(
    ({ targetMonth }) => compareMonths(targetMonth, state.currentMonth) <= 0,
  );
}

export function assertNoDueLifeMilestone(state: GameStateV2): void {
  if (dueLifeMilestones(state).length > 0) {
    throw new LifeMilestoneV2Error(
      "MILESTONE_DECISION_REQUIRED",
      "resolve, postpone, or cancel the due life milestone before advancing time",
    );
  }
}

function validateEnvelope(
  state: GameStateV2,
  command: ManageLifeMilestoneV2Command,
): void {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "manage_life_milestone" ||
    !ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    command.effectiveMonth !== state.currentMonth
  ) {
    throw new LifeMilestoneV2Error("INVALID_COMMAND", "invalid milestone command envelope");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new LifeMilestoneV2Error("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new LifeMilestoneV2Error("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome) {
    throw new LifeMilestoneV2Error("RUN_TERMINAL", "terminal runs reject milestone changes");
  }
}

function schedule(
  state: GameStateV2,
  command: ManageLifeMilestoneV2Command & { payload: Extract<ManageLifeMilestoneV2Command["payload"], { action: "schedule" }> },
): GameStateV2 {
  const current = lifeMilestoneState(state);
  const payload = command.payload;
  try {
    simulationMonth(payload.targetMonth);
  } catch {
    throw new LifeMilestoneV2Error("INVALID_COMMAND", "target month must use YYYY-MM");
  }
  if (
    !ID.test(payload.milestoneId) ||
    !KINDS.has(payload.kind) ||
    payload.label.trim().length < 1 ||
    payload.label.length > 80 ||
    !Number.isSafeInteger(payload.estimatedCostCents) ||
    payload.estimatedCostCents <= 0 ||
    compareMonths(payload.targetMonth, state.currentMonth) < 0
  ) {
    throw new LifeMilestoneV2Error("INVALID_COMMAND", "milestone fields or target month are invalid");
  }
  if ([...current.scheduled, ...current.history].some(({ milestoneId }) => milestoneId === payload.milestoneId)) {
    throw new LifeMilestoneV2Error("DUPLICATE_MILESTONE", "milestone id must be unique for the run");
  }
  if (current.scheduled.length >= 12) {
    throw new LifeMilestoneV2Error("MILESTONE_LIMIT", "at most 12 milestones may be scheduled");
  }
  return accept(state, command, {
    ...current,
    scheduled: [...current.scheduled, {
      version: LIFE_MILESTONE_VERSION,
      milestoneId: payload.milestoneId,
      kind: payload.kind,
      label: payload.label.trim(),
      targetMonth: payload.targetMonth,
      estimatedCostCents: payload.estimatedCostCents,
      postponementCount: 0,
      createdMonth: state.currentMonth,
    }].sort((left, right) => compareMonths(left.targetMonth, right.targetMonth)),
  });
}

function accept(
  state: GameStateV2,
  command: ManageLifeMilestoneV2Command,
  milestones: LifeMilestoneStateV1,
  ledger = state.ledger,
): GameStateV2 {
  return finalizeGameStateV2({
    ...state,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
    gameplay: { ...state.gameplay, lifeMilestones: milestones },
  });
}

function resolve(
  state: GameStateV2,
  command: ManageLifeMilestoneV2Command & { payload: Extract<ManageLifeMilestoneV2Command["payload"], { action: "resolve" }> },
): GameStateV2 {
  const current = lifeMilestoneState(state);
  const milestone = current.scheduled.find(({ milestoneId }) => milestoneId === command.payload.milestoneId);
  if (!milestone) throw new LifeMilestoneV2Error("MILESTONE_NOT_FOUND", "scheduled milestone was not found");
  if (compareMonths(milestone.targetMonth, state.currentMonth) > 0) {
    throw new LifeMilestoneV2Error("MILESTONE_NOT_DUE", "milestone cannot be resolved before its target month");
  }
  if (command.payload.resolution === "postpone_6_months") {
    const scheduled = current.scheduled.map((entry) => entry.milestoneId === milestone.milestoneId
      ? { ...entry, targetMonth: addMonths(state.currentMonth, 6), postponementCount: entry.postponementCount + 1 }
      : entry).sort((left, right) => compareMonths(left.targetMonth, right.targetMonth));
    return accept(state, command, { ...current, scheduled });
  }
  const paid = command.payload.resolution === "pay_cash";
  if (paid && milestone.estimatedCostCents > state.finances.cashCents) {
    throw new LifeMilestoneV2Error("INSUFFICIENT_CASH", "milestone cost exceeds available cash; postpone it or build liquidity");
  }
  const ledger = paid
    ? appendTransaction(state.ledger, {
        id: `txn.${command.id}`,
        commandId: command.id,
        effectiveMonth: state.currentMonth,
        reasonCode: `life_milestone_${milestone.kind}`,
        description: `Life milestone: ${milestone.label}`,
        sourceSystem: "life_milestones_v2",
        category: `milestone.${milestone.kind}`,
        causalReference: {
          kind: "milestone",
          id: milestone.milestoneId,
        },
        postings: [
          { accountId: "expense.living", debitCents: milestone.estimatedCostCents, creditCents: moneyCents(0) },
          { accountId: "asset.cash", debitCents: moneyCents(0), creditCents: milestone.estimatedCostCents },
        ],
      })
    : state.ledger;
  return accept(state, command, {
    ...current,
    scheduled: current.scheduled.filter(({ milestoneId }) => milestoneId !== milestone.milestoneId),
    history: [...current.history, {
      version: LIFE_MILESTONE_VERSION,
      milestoneId: milestone.milestoneId,
      kind: milestone.kind,
      label: milestone.label,
      estimatedCostCents: milestone.estimatedCostCents,
      plannedMonth: milestone.targetMonth,
      resolvedMonth: state.currentMonth,
      resolution: paid ? "paid_cash" : "cancelled",
      actualCostCents: paid ? milestone.estimatedCostCents : moneyCents(0),
      postponementCount: milestone.postponementCount,
      createdMonth: milestone.createdMonth,
      commandId: command.id,
    }],
  }, ledger);
}

export function manageLifeMilestoneV2(
  state: GameStateV2,
  command: ManageLifeMilestoneV2Command,
): GameStateV2 {
  validateEnvelope(state, command);
  return command.payload.action === "schedule"
    ? schedule(state, command as Parameters<typeof schedule>[1])
    : resolve(state, command as Parameters<typeof resolve>[1]);
}
