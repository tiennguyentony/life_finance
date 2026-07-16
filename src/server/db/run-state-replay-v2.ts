import { and, asc, desc, eq, gt, lte } from "drizzle-orm";

import { sha256Canonical } from "../../core/canonical";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { LifeFinanceDatabase } from "./client";
import { decodePersistedGameCommandV2 } from "./persisted-command-v2";
import type { GameCommandV2 } from "./run-repository-contracts";
import { RunRepositoryError } from "./run-repository-contracts";
import {
  assertPersistedState,
  reduceGameCommandV2,
  requireV2State,
} from "./run-repository-support";
import {
  acceptedCommands,
  runStateMigrations,
  runStateSnapshots,
} from "./schema";

export type RunStateReplayAnchorV2 = Readonly<{
  runId: string;
  revision: number;
  stateSchemaVersion: number;
  engineVersion: string;
  state: unknown;
  stateChecksum: string;
}>;

export type AcceptedCommandReplayRowV2 = Readonly<{
  runId: string;
  commandId: string;
  commandSchemaVersion: number;
  commandType: string;
  expectedRevision: number;
  resultingRevision: number;
  effectiveMonth: string;
  payload: unknown;
  resultingStateChecksum: string;
}>;

export type ReplayedRunStateV2 = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
}>;

export function selectLatestRunStateReplayAnchorV2(
  snapshotAnchor: RunStateReplayAnchorV2 | null,
  migrationAnchor: RunStateReplayAnchorV2 | null,
): RunStateReplayAnchorV2 {
  if (!snapshotAnchor && !migrationAnchor) {
    throw corrupt("v2 replay target has no compatible state anchor");
  }
  if (!snapshotAnchor) return migrationAnchor!;
  if (!migrationAnchor) return snapshotAnchor;
  return migrationAnchor.revision >= snapshotAnchor.revision
    ? migrationAnchor
    : snapshotAnchor;
}

type RunStateReplayDatabase = Pick<LifeFinanceDatabase, "select">;

export async function loadRunStateAtRevisionV2(
  db: RunStateReplayDatabase,
  runId: string,
  targetRevision: number,
  engineVersion: string,
): Promise<ReplayedRunStateV2> {
  if (
    !Number.isSafeInteger(targetRevision) ||
    targetRevision < 0 ||
    engineVersion.length === 0
  ) {
    throw corrupt("v2 replay target is invalid");
  }

  const [[snapshot], [migration]] = await Promise.all([
    db
      .select({
        runId: runStateSnapshots.runId,
        revision: runStateSnapshots.revision,
        stateSchemaVersion: runStateSnapshots.stateSchemaVersion,
        engineVersion: runStateSnapshots.engineVersion,
        state: runStateSnapshots.state,
        stateChecksum: runStateSnapshots.stateChecksum,
      })
      .from(runStateSnapshots)
      .where(
        and(
          eq(runStateSnapshots.runId, runId),
          eq(runStateSnapshots.stateSchemaVersion, 2),
          eq(runStateSnapshots.engineVersion, engineVersion),
          lte(runStateSnapshots.revision, targetRevision),
        ),
      )
      .orderBy(desc(runStateSnapshots.revision))
      .limit(1),
    db
      .select({
        runId: runStateMigrations.runId,
        revision: runStateMigrations.sourceRevision,
        stateSchemaVersion: runStateMigrations.targetSchemaVersion,
        engineVersion: runStateMigrations.targetEngineVersion,
        state: runStateMigrations.targetState,
        stateChecksum: runStateMigrations.targetStateChecksum,
      })
      .from(runStateMigrations)
      .where(
        and(
          eq(runStateMigrations.runId, runId),
          eq(runStateMigrations.targetSchemaVersion, 2),
          eq(runStateMigrations.targetEngineVersion, engineVersion),
          lte(runStateMigrations.sourceRevision, targetRevision),
        ),
      )
      .orderBy(
        desc(runStateMigrations.sourceRevision),
        desc(runStateMigrations.createdAt),
      )
      .limit(1),
  ]);
  const anchor = selectLatestRunStateReplayAnchorV2(
    snapshot ?? null,
    migration ?? null,
  );
  const rows = await db
    .select({
      runId: acceptedCommands.runId,
      commandId: acceptedCommands.commandId,
      commandSchemaVersion: acceptedCommands.commandSchemaVersion,
      commandType: acceptedCommands.commandType,
      expectedRevision: acceptedCommands.expectedRevision,
      resultingRevision: acceptedCommands.resultingRevision,
      effectiveMonth: acceptedCommands.effectiveMonth,
      payload: acceptedCommands.payload,
      resultingStateChecksum: acceptedCommands.resultingStateChecksum,
    })
    .from(acceptedCommands)
    .where(
      and(
        eq(acceptedCommands.runId, runId),
        gt(acceptedCommands.resultingRevision, anchor.revision),
        lte(acceptedCommands.resultingRevision, targetRevision),
      ),
    )
    .orderBy(asc(acceptedCommands.resultingRevision));
  return replayAcceptedCommandsV2(anchor, rows, targetRevision);
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CHECKSUM = /^[0-9a-f]{64}$/;
const COMMAND_TYPES = new Set<string>(
  [
    "take_detailed_action",
    "set_recurring_strategy",
    "resolve_event_choice",
    "manage_life_milestone",
    "record_learning_interaction_v2",
    "queue_ai_world_event_v2",
    "process_month_v2",
  ] satisfies readonly GameCommandV2["type"][],
);

export function rebuildGameCommandV2(
  row: AcceptedCommandReplayRowV2,
): GameCommandV2 {
  if (
    row.commandSchemaVersion !== 2 ||
    !COMMAND_TYPES.has(row.commandType) ||
    !COMMAND_ID.test(row.commandId) ||
    !Number.isSafeInteger(row.expectedRevision) ||
    row.expectedRevision < 0 ||
    !Number.isSafeInteger(row.resultingRevision) ||
    row.resultingRevision !== row.expectedRevision + 1 ||
    !CHECKSUM.test(row.resultingStateChecksum)
  ) {
    throw corrupt("stored v2 command envelope is invalid");
  }

  try {
    return decodePersistedGameCommandV2({
      schemaVersion: row.commandSchemaVersion,
      id: row.commandId,
      type: row.commandType,
      expectedRevision: row.expectedRevision,
      effectiveMonth: row.effectiveMonth,
      payload: row.payload,
    });
  } catch (cause) {
    throw corrupt("stored v2 command payload is invalid", cause);
  }
}

export function replayAcceptedCommandsV2(
  anchor: RunStateReplayAnchorV2,
  rows: readonly AcceptedCommandReplayRowV2[],
  targetRevision: number,
): ReplayedRunStateV2 {
  if (
    !Number.isSafeInteger(targetRevision) ||
    targetRevision < 0 ||
    anchor.stateSchemaVersion !== 2 ||
    !Number.isSafeInteger(anchor.revision) ||
    anchor.revision < 0 ||
    anchor.revision > targetRevision
  ) {
    throw corrupt("v2 replay target or anchor revision is invalid");
  }

  let state: GameStateV2;
  try {
    state = requireV2State(
      assertPersistedState(anchor.state, {
        runId: anchor.runId,
        checksum: anchor.stateChecksum,
        schemaVersion: anchor.stateSchemaVersion,
        engineVersion: anchor.engineVersion,
        revision: anchor.revision,
      }),
    );
  } catch (cause) {
    throw normalizeCorruption(
      "v2 replay anchor failed identity or checksum validation",
      cause,
    );
  }

  let expectedRevision = anchor.revision;
  let checksum = anchor.stateChecksum;
  for (const row of rows) {
    if (
      row.runId !== anchor.runId ||
      row.expectedRevision !== expectedRevision ||
      row.resultingRevision !== expectedRevision + 1 ||
      row.resultingRevision > targetRevision
    ) {
      throw corrupt("accepted v2 commands are not a contiguous revision sequence");
    }
    const command = rebuildGameCommandV2(row);
    try {
      state = reduceGameCommandV2(state, command).state;
    } catch (cause) {
      throw normalizeCorruption("stored v2 command could not be replayed", cause);
    }
    checksum = sha256Canonical(state);
    if (
      state.revision !== row.resultingRevision ||
      checksum !== row.resultingStateChecksum
    ) {
      throw corrupt("replayed v2 command revision or checksum drifted");
    }
    expectedRevision = row.resultingRevision;
  }

  if (state.revision !== targetRevision) {
    throw corrupt("accepted v2 command history is missing a target revision");
  }
  return Object.freeze({ state, stateChecksum: checksum });
}

function corrupt(message: string, cause?: unknown): RunRepositoryError {
  return new RunRepositoryError("CORRUPT_STATE", message, cause);
}

function normalizeCorruption(
  message: string,
  cause: unknown,
): RunRepositoryError {
  return cause instanceof RunRepositoryError && cause.code === "CORRUPT_STATE"
    ? cause
    : corrupt(message, cause);
}
