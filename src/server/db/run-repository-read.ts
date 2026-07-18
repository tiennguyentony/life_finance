import { and, asc, desc, eq, gt, lte } from "drizzle-orm";

import { canonicalJson, sha256Canonical } from "../../core/canonical";
import {
  buildCheckpointEvidenceV2,
  type CheckpointEvidenceV2,
} from "../../core/checkpoint-v2";
import type { GameState } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import { projectFinancialGoal } from "../../core/financial-goals-v2";
import type { ProcessMonthV2Command } from "../../core/monthly-turn-v2";
import type { MonthlyTaxEvidence } from "../../core/payroll-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import type { TeachingCheckpointOwnerBundleV2 } from "../../core/teaching-checkpoint-owner-v2";
import { RunSecretCodec } from "../auth/run-secret";
import type { LifeFinanceDatabase } from "./client";
import {
  RunRepositoryError,
  type GameCommandV2,
} from "./run-repository-contracts";
import {
  loadRunStateAtRevisionV2,
  rebuildGameCommandV2,
} from "./run-state-replay-v2";
import {
  assertPersistedState,
  assertScenarioSnapshotRecord,
  assertUuid,
  isAuthorized,
  requireV1State,
  requireV2State,
} from "./run-repository-support";
import {
  acceptedCommands,
  gameRuns,
  monthlyTaxEvidence,
  monthlyTurnRecords,
  runScenarioSnapshots,
} from "./schema";

export async function loadAuthorizedRun(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string, accessSecret: string): Promise<GameState> {
  assertUuid(runId);
  const [row] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);
  if (
    !row ||
    !isAuthorized(
      secretCodec,
      accessSecret,
      row.accessSecretHash,
      row.accessSecretHashVersion,
      row.ownerUserId,
    )
  ) {
    throw new RunRepositoryError(
      "NOT_FOUND_OR_UNAUTHORIZED",
      "run was not found or the credential is invalid",
    );
  }
  return requireV1State(
    assertPersistedState(row.currentState, {
      runId,
      checksum: row.currentStateChecksum,
      schemaVersion: row.stateSchemaVersion,
      engineVersion: row.engineVersion,
      revision: row.currentRevision,
      currentMonth: row.currentMonth,
    }),
  );
}

export async function loadAuthorizedRunV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  
  runId: string,
  accessSecret: string,
): Promise<GameStateV2> {
  assertUuid(runId);
  const [row] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);
  if (
    !row ||
    !isAuthorized(
      secretCodec,
      accessSecret,
      row.accessSecretHash,
      row.accessSecretHashVersion,
      row.ownerUserId,
    )
  ) {
    throw new RunRepositoryError(
      "NOT_FOUND_OR_UNAUTHORIZED",
      "run was not found or the credential is invalid",
    );
  }
  const state = requireV2State(
    assertPersistedState(row.currentState, {
      runId,
      checksum: row.currentStateChecksum,
      schemaVersion: row.stateSchemaVersion,
      engineVersion: row.engineVersion,
      revision: row.currentRevision,
      currentMonth: row.currentMonth,
    }),
  );
  const [catalogRow] = await db
    .select()
    .from(runScenarioSnapshots)
    .where(eq(runScenarioSnapshots.runId, runId))
    .limit(1);
  assertScenarioSnapshotRecord(state, catalogRow);
  return state;
}

export async function loadCheckpointEvidenceV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  
  runId: string,
  accessSecret: string,
  fromRevision: number,
): Promise<CheckpointEvidenceV2> {
  return (
    await loadTeachingCheckpointOwnerBundleV2(
      db,
      secretCodec,
      runId,
      accessSecret,
      fromRevision,
    )
  ).evidence;
}

export async function loadTeachingCheckpointOwnerBundleV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  fromRevision: number,
): Promise<TeachingCheckpointOwnerBundleV2> {
  if (!Number.isSafeInteger(fromRevision) || fromRevision < 0) {
    throw new RunRepositoryError(
      "PERSISTENCE_INVARIANT",
      "checkpoint start revision must be a non-negative safe integer",
    );
  }
  const endingState = await loadAuthorizedRunV2(db, secretCodec, runId, accessSecret);
  if (fromRevision > endingState.revision) {
    throw new RunRepositoryError(
      "PERSISTENCE_INVARIANT",
      "checkpoint start revision cannot exceed current revision",
    );
  }
  const { state: startingState } = await loadRunStateAtRevisionV2(
    db,
    runId,
    fromRevision,
    endingState.engineVersion,
  );
  const rows = await db
    .select()
    .from(monthlyTurnRecords)
    .where(
      and(
        eq(monthlyTurnRecords.runId, runId),
        gt(monthlyTurnRecords.resultingRevision, fromRevision),
        lte(monthlyTurnRecords.resultingRevision, endingState.revision),
      ),
    )
    .orderBy(asc(monthlyTurnRecords.processedMonth));
  const monthlyRecords = rows.map((row) => {
    if (
      sha256Canonical(row.record) !== row.recordChecksum ||
      row.record.commandId !== row.commandId ||
      row.record.processedMonth !== row.processedMonth ||
      row.record.taxTraceId !== row.taxTraceId
    ) {
      throw new RunRepositoryError(
        "CORRUPT_STATE",
        "checkpoint monthly evidence failed checksum or identity validation",
      );
    }
    return Object.freeze({
      resultingRevision: row.resultingRevision,
      recordChecksum: row.recordChecksum,
      record: row.record,
    });
  });
  const records = monthlyRecords.map(({ record }) => record);
  return Object.freeze({
    evidence: buildCheckpointEvidenceV2(startingState, endingState, records),
    fromRevision,
    toRevision: endingState.revision,
    endingStateChecksum: sha256Canonical(endingState),
    monthlyRecords: Object.freeze(monthlyRecords),
    startRisk: analyzeRiskV1(startingState),
    endRisk: analyzeRiskV1(endingState),
    endGoal: projectFinancialGoal(
      endingState.finances,
      endingState.gameplay.financialGoal,
    ),
  });
}

async function findAcceptedMonthlyCommandV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  commandId: string,
): Promise<ProcessMonthV2Command | null> {
  assertUuid(runId);
  const [run] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);
  if (
    !run ||
    !isAuthorized(
      secretCodec,
      accessSecret,
      run.accessSecretHash,
      run.accessSecretHashVersion,
      run.ownerUserId,
    )
  ) {
    throw new RunRepositoryError(
      "NOT_FOUND_OR_UNAUTHORIZED",
      "run was not found or the credential is invalid",
    );
  }
  const [accepted] = await db
    .select()
    .from(acceptedCommands)
    .where(
      and(
        eq(acceptedCommands.runId, runId),
        eq(acceptedCommands.commandId, commandId),
      ),
    )
    .limit(1);
  if (!accepted) return null;
  if (accepted.commandSchemaVersion !== 2 || accepted.commandType !== "process_month_v2") {
    throw new RunRepositoryError(
      "IDEMPOTENCY_MISMATCH",
      "command id belongs to a different accepted command",
    );
  }
  const command = rebuildGameCommandV2(accepted);
  if (command.type !== "process_month_v2") {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "accepted monthly command decoded to the wrong command type",
    );
  }
  const [stored] = await db
    .select()
    .from(monthlyTaxEvidence)
    .where(
      and(
        eq(monthlyTaxEvidence.runId, runId),
        eq(monthlyTaxEvidence.commandId, commandId),
      ),
    )
    .limit(1);
  if (
    !stored ||
    sha256Canonical(stored.evidence) !== stored.evidenceChecksum ||
    canonicalJson(stored.evidence) !== canonicalJson(command.payload.taxEvidence)
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "accepted monthly command is missing consistent tax evidence",
    );
  }
  return command;
}

export async function loadAcceptedCommandV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  commandId: string,
): Promise<GameCommandV2 | null> {
  assertUuid(runId);
  const [run] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);
  if (
    !run ||
    !isAuthorized(
      secretCodec,
      accessSecret,
      run.accessSecretHash,
      run.accessSecretHashVersion,
      run.ownerUserId,
    )
  ) {
    throw new RunRepositoryError(
      "NOT_FOUND_OR_UNAUTHORIZED",
      "run was not found or the credential is invalid",
    );
  }
  const [accepted] = await db
    .select()
    .from(acceptedCommands)
    .where(
      and(
        eq(acceptedCommands.runId, runId),
        eq(acceptedCommands.commandId, commandId),
      ),
    )
    .limit(1);
  if (!accepted) return null;
  if (accepted.commandSchemaVersion !== 2) {
    throw new RunRepositoryError(
      "IDEMPOTENCY_MISMATCH",
      "command id belongs to a different accepted command schema",
    );
  }
  return rebuildGameCommandV2(accepted);
}

export async function loadAcceptedMonthlyCommandV2(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  commandId: string,
): Promise<ProcessMonthV2Command> {
  const command = await findAcceptedMonthlyCommandV2(
    db,
    secretCodec,
    runId,
    accessSecret,
    commandId,
  );
  if (!command) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "accepted monthly command is missing from persisted command history",
    );
  }
  return command;
}

export async function loadMonthlyTaxEvidenceForCommand(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  commandId: string,
): Promise<MonthlyTaxEvidence | null> {
  const command = await findAcceptedMonthlyCommandV2(
    db,
    secretCodec,
    runId,
    accessSecret,
    commandId,
  );
  return command?.payload.taxEvidence ?? null;
}

export async function loadMonthlyTaxEvidenceForContext(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  
  runId: string,
  accessSecret: string,
  contextFingerprint: string,
): Promise<MonthlyTaxEvidence | null> {
  assertUuid(runId);
  if (!/^[0-9a-f]{64}$/.test(contextFingerprint)) {
    throw new TypeError("tax context fingerprint must be canonical SHA-256");
  }
  const [run] = await db
    .select()
    .from(gameRuns)
    .where(eq(gameRuns.id, runId))
    .limit(1);
  if (
    !run ||
    !isAuthorized(
      secretCodec,
      accessSecret,
      run.accessSecretHash,
      run.accessSecretHashVersion,
      run.ownerUserId,
    )
  ) {
    throw new RunRepositoryError(
      "NOT_FOUND_OR_UNAUTHORIZED",
      "run was not found or the credential is invalid",
    );
  }
  const [stored] = await db
    .select()
    .from(monthlyTaxEvidence)
    .where(
      and(
        eq(monthlyTaxEvidence.runId, runId),
        eq(monthlyTaxEvidence.taxContextFingerprint, contextFingerprint),
      ),
    )
    .orderBy(desc(monthlyTaxEvidence.createdAt))
    .limit(1);
  if (!stored) return null;
  if (
    stored.evidence.contextFingerprint !== contextFingerprint ||
    sha256Canonical(stored.evidence) !== stored.evidenceChecksum
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "cached tax evidence failed fingerprint or checksum validation",
    );
  }
  return stored.evidence;
}
