import { monthsBetween, type SimulationMonth } from "../../core/domain/month";

export const RUN_STATE_SNAPSHOT_KINDS = [
  "run_start",
  "checkpoint",
  "before_event",
  "after_event",
  "before_milestone",
  "after_milestone",
  "terminal",
  "migration",
  "legacy_command_result",
] as const;

export type RunStateSnapshotKind = (typeof RUN_STATE_SNAPSHOT_KINDS)[number];

export const RUN_STATE_SNAPSHOT_KIND_PRIORITY: Readonly<
  Record<RunStateSnapshotKind, number>
> = Object.freeze({
  legacy_command_result: 0,
  run_start: 100,
  checkpoint: 200,
  before_event: 300,
  after_event: 400,
  before_milestone: 500,
  after_milestone: 600,
  terminal: 700,
  migration: 800,
});

export type SnapshotPolicyStateV2 = Readonly<{
  revision: number;
  startMonth: SimulationMonth;
  currentMonth: SimulationMonth;
  outcome: unknown | null;
  gameplay: Readonly<{
    eventLifecycle: Readonly<{
      pending: Readonly<{ eventId: string }> | null;
    }>;
  }>;
}>;

export type SnapshotPolicyCommandV2 = Readonly<{
  id: string;
  type: string;
}>;

export type SnapshotRequestV2<
  TState extends SnapshotPolicyStateV2 = SnapshotPolicyStateV2,
> = Readonly<{
  state: TState;
  snapshotKind: RunStateSnapshotKind;
  causalCommandId: string | null;
}>;

export function snapshotRequestForRunStartV2<
  TState extends SnapshotPolicyStateV2,
>(state: TState): SnapshotRequestV2<TState> {
  return Object.freeze({
    state,
    snapshotKind: "run_start",
    causalCommandId: null,
  });
}

export function snapshotRequestForMigrationV2<
  TState extends SnapshotPolicyStateV2,
>(state: TState): SnapshotRequestV2<TState> {
  return Object.freeze({
    state,
    snapshotKind: "migration",
    causalCommandId: null,
  });
}

export function snapshotRequestsForAcceptedCommandV2<
  TState extends SnapshotPolicyStateV2,
>(
  previousState: TState,
  nextState: TState,
  command: SnapshotPolicyCommandV2,
): readonly SnapshotRequestV2<TState>[] {
  const requests: SnapshotRequestV2<TState>[] = [];
  const eventChanged =
    previousState.gameplay.eventLifecycle.pending?.eventId !==
    nextState.gameplay.eventLifecycle.pending?.eventId;

  if (eventChanged) {
    requests.push(
      request(previousState, "before_event", command.id),
      request(nextState, "after_event", command.id),
    );
  }

  if (command.type === "manage_life_milestone") {
    requests.push(
      request(previousState, "before_milestone", command.id),
      request(nextState, "after_milestone", command.id),
    );
  }

  const processedMonths = monthsBetween(
    nextState.startMonth,
    nextState.currentMonth,
  );
  if (
    command.type === "process_month_v2" &&
    processedMonths > 0 &&
    processedMonths % 12 === 0
  ) {
    requests.push(request(nextState, "checkpoint", command.id));
  }

  if (previousState.outcome === null && nextState.outcome !== null) {
    requests.push(request(nextState, "terminal", command.id));
  }

  return deduplicateSnapshotRequestsV2(requests);
}

export function deduplicateSnapshotRequestsV2<
  TState extends SnapshotPolicyStateV2,
>(
  requests: readonly SnapshotRequestV2<TState>[],
): readonly SnapshotRequestV2<TState>[] {
  const byRevision = new Map<number, SnapshotRequestV2<TState>>();
  for (const candidate of requests) {
    const existing = byRevision.get(candidate.state.revision);
    if (!existing || outranks(candidate, existing)) {
      byRevision.set(candidate.state.revision, candidate);
    }
  }
  return Object.freeze(
    [...byRevision.values()].toSorted(
      (left, right) => left.state.revision - right.state.revision,
    ),
  );
}

function request<TState extends SnapshotPolicyStateV2>(
  state: TState,
  snapshotKind: RunStateSnapshotKind,
  causalCommandId: string | null,
): SnapshotRequestV2<TState> {
  return Object.freeze({ state, snapshotKind, causalCommandId });
}

function outranks<TState extends SnapshotPolicyStateV2>(
  candidate: SnapshotRequestV2<TState>,
  existing: SnapshotRequestV2<TState>,
): boolean {
  const priorityDifference =
    RUN_STATE_SNAPSHOT_KIND_PRIORITY[candidate.snapshotKind] -
    RUN_STATE_SNAPSHOT_KIND_PRIORITY[existing.snapshotKind];
  if (priorityDifference !== 0) return priorityDifference > 0;
  return (candidate.causalCommandId ?? "") < (existing.causalCommandId ?? "");
}
