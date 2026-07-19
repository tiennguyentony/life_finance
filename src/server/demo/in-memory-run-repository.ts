import { randomUUID } from "node:crypto";

import { canonicalJson, sha256Canonical } from "@/core/canonical";
import {
  buildCheckpointEvidenceV2,
  type CheckpointEvidenceV2,
} from "@/core/checkpoint-v2";
import { projectFinancialGoal } from "@/core/financial-goals-v2";
import type { GameStateV2 } from "@/core/game-state-v2";
import { assertValidGameStateV2 } from "@/core/game-state-v2-validation";
import type { MonthlyTurnV2Record } from "@/core/monthly-turn-v2";
import type { MonthlyTaxEvidence } from "@/core/payroll-v2";
import { analyzeRiskV1 } from "@/core/risk-v1";
import type {
  TeachingCheckpointOwnerBundleV2,
  TeachingMonthlyOwnerRecordV2,
} from "@/core/teaching-checkpoint-owner-v2";
import { RunSecretCodec, isRunSecret } from "@/server/auth/run-secret";
import type { V2Repository } from "@/server/api/run-repository-port";
import {
  type AppliedCommandV2,
  type CreatedRunV2,
  type GameCommandV2,
  RunRepositoryError,
} from "@/server/db/run-repository-contracts";
import { reduceGameCommandV2 } from "@/server/db/run-repository-support";

const secretCodec = new RunSecretCodec(new Uint8Array(32).fill(73));

type StoredDemoCommand = Readonly<{
  command: GameCommandV2;
  monthlyRecord: AppliedCommandV2["monthlyRecord"];
  resultingRevision: number;
}>;

/**
 * A checkpoint aggregates at most twelve months. Revisions are not months — a
 * plan and an event response can each add a revision without moving time — so
 * retaining an arbitrary revision count can evict the state at the beginning
 * of an otherwise valid 12-month window. Keep the latest state for each month
 * instead, plus two spare months, which is both smaller and semantically exact.
 */
const RETAINED_STATE_MONTHS = 14;

type StoredDemoRun = {
  readonly accessSecret: string;
  state: GameStateV2;
  readonly acceptedCommands: Map<string, StoredDemoCommand>;
  /** Trailing window of states by revision, for checkpoint evidence. */
  readonly stateByRevision: Map<number, GameStateV2>;
  /** Revision of the latest retained state for each simulation month. */
  readonly stateRevisionByMonth: Map<string, number>;
  readonly taxEvidenceByCommand: Map<string, MonthlyTaxEvidence>;
  readonly taxEvidenceByContext: Map<string, MonthlyTaxEvidence>;
  lastAccessedAt: number;
};

type InMemoryRunRepositoryOptions = Readonly<{
  runIdFactory?: () => string;
  accessSecretFactory?: () => string;
  clock?: () => number;
  maxRuns?: number;
  ttlMs?: number;
}>;

export class InMemoryRunRepository implements V2Repository {
  readonly #runs = new Map<string, StoredDemoRun>();
  readonly #runIdFactory: () => string;
  readonly #accessSecretFactory: () => string;
  readonly #clock: () => number;
  readonly #maxRuns: number;
  readonly #ttlMs: number;

  constructor(options: InMemoryRunRepositoryOptions = {}) {
    this.#runIdFactory = options.runIdFactory ?? randomUUID;
    this.#accessSecretFactory =
      options.accessSecretFactory ?? (() => secretCodec.create().secret);
    this.#clock = options.clock ?? Date.now;
    this.#maxRuns = options.maxRuns ?? 16;
    this.#ttlMs = options.ttlMs ?? 2 * 60 * 60 * 1_000;
    if (!Number.isInteger(this.#maxRuns) || this.#maxRuns < 1) {
      throw new TypeError("demo maxRuns must be a positive integer");
    }
  }

  hasRun(runId: string): boolean {
    return this.#findRun(runId) !== null;
  }

  async createRunV2(
    initialStateFactory: (runId: string) => GameStateV2,
  ): Promise<CreatedRunV2> {
    const runId = this.#runIdFactory();
    const accessSecret = this.#accessSecretFactory();
    if (this.#runs.has(runId)) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "demo run id was already created",
      );
    }
    if (!isRunSecret(accessSecret)) {
      throw new TypeError("demo access secret is invalid");
    }
    const state = initialStateFactory(runId);
    assertValidGameStateV2(state);
    if (state.runId !== runId || state.revision !== 0) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "demo state must use the generated run id and revision zero",
      );
    }
    this.#runs.set(runId, {
      accessSecret,
      state,
      acceptedCommands: new Map(),
      stateByRevision: new Map([[state.revision, state]]),
      stateRevisionByMonth: new Map([[state.currentMonth, state.revision]]),
      taxEvidenceByCommand: new Map(),
      taxEvidenceByContext: new Map(),
      lastAccessedAt: this.#clock(),
    });
    this.#prune();
    return Object.freeze({
      runId,
      accessSecret,
      state,
      stateChecksum: sha256Canonical(state),
    });
  }

  async loadAuthorizedRunV2(
    runId: string,
    accessSecret: string,
  ): Promise<GameStateV2> {
    return this.#authorize(runId, accessSecret).state;
  }

  async loadAcceptedCommandV2(
    runId: string,
    accessSecret: string,
    commandId: string,
  ): Promise<GameCommandV2 | null> {
    return (
      this.#authorize(runId, accessSecret).acceptedCommands.get(commandId)
        ?.command ?? null
    );
  }

  async loadAcceptedMonthlyCommandV2(
    runId: string,
    accessSecret: string,
    commandId: string,
  ) {
    const command = this.#authorize(
      runId,
      accessSecret,
    ).acceptedCommands.get(commandId)?.command;
    if (command?.type !== "process_month_v2") {
      throw new RunRepositoryError(
        "CORRUPT_STATE",
        "accepted demo monthly command is missing",
      );
    }
    return command;
  }

  async loadMonthlyTaxEvidenceForCommand(
    runId: string,
    accessSecret: string,
    commandId: string,
  ): Promise<MonthlyTaxEvidence | null> {
    return (
      this.#authorize(runId, accessSecret).taxEvidenceByCommand.get(commandId) ??
      null
    );
  }

  async loadMonthlyTaxEvidenceForContext(
    runId: string,
    accessSecret: string,
    contextFingerprint: string,
  ): Promise<MonthlyTaxEvidence | null> {
    return (
      this.#authorize(runId, accessSecret).taxEvidenceByContext.get(
        contextFingerprint,
      ) ?? null
    );
  }

  async applyCommandV2(
    runId: string,
    accessSecret: string,
    command: GameCommandV2,
  ): Promise<AppliedCommandV2> {
    const run = this.#authorize(runId, accessSecret);
    const accepted = run.acceptedCommands.get(command.id);
    if (accepted) {
      if (canonicalJson(accepted.command) !== canonicalJson(command)) {
        throw new RunRepositoryError(
          "IDEMPOTENCY_MISMATCH",
          "command id belongs to a different demo command payload",
        );
      }
      return Object.freeze({
        state: run.state,
        stateChecksum: sha256Canonical(run.state),
        idempotentReplay: true,
        monthlyRecord: accepted.monthlyRecord,
      });
    }

    const reduced = reduceGameCommandV2(run.state, command);
    run.state = reduced.state;
    run.acceptedCommands.set(command.id, {
      command: structuredClone(command),
      monthlyRecord: reduced.monthlyRecord,
      resultingRevision: reduced.state.revision,
    });
    const replacedRevision = run.stateRevisionByMonth.get(
      reduced.state.currentMonth,
    );
    if (replacedRevision !== undefined) {
      run.stateByRevision.delete(replacedRevision);
    }
    run.stateByRevision.set(reduced.state.revision, reduced.state);
    run.stateRevisionByMonth.set(
      reduced.state.currentMonth,
      reduced.state.revision,
    );
    this.#pruneStates(run);
    if (command.type === "process_month_v2") {
      const evidence = command.payload.taxEvidence;
      run.taxEvidenceByCommand.set(command.id, evidence);
      if (evidence.contextFingerprint) {
        run.taxEvidenceByContext.set(evidence.contextFingerprint, evidence);
      }
    }
    return Object.freeze({
      state: run.state,
      stateChecksum: sha256Canonical(run.state),
      idempotentReplay: false,
      monthlyRecord: reduced.monthlyRecord,
    });
  }

  async loadCheckpointEvidenceV2(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ): Promise<CheckpointEvidenceV2> {
    const { startingState, endingState, records } = this.#checkpointRange(
      runId,
      accessSecret,
      fromRevision,
    );
    return buildCheckpointEvidenceV2(startingState, endingState, records);
  }

  /**
   * Mirrors the database bundle so the demo path serves the same year-one
   * report card the persistent path does, from the same engine evidence.
   */
  async loadTeachingCheckpointOwnerBundleV2(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ): Promise<TeachingCheckpointOwnerBundleV2> {
    const { startingState, endingState, monthlyRecords, records } =
      this.#checkpointRange(runId, accessSecret, fromRevision);

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

  async loadTrailingMonthlyStartRevisionV2(
    runId: string,
    accessSecret: string,
    months: number,
  ): Promise<number> {
    if (!Number.isSafeInteger(months) || months < 1 || months > 12) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "trailing checkpoint months must be between one and twelve",
      );
    }
    const run = this.#authorize(runId, accessSecret);
    const monthly = [...run.acceptedCommands.values()]
      .filter(
        (stored) => stored.monthlyRecord !== null && stored.monthlyRecord !== undefined,
      )
      .sort((left, right) => right.resultingRevision - left.resultingRevision)
      .slice(0, months);
    if (monthly.length !== months) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "run does not contain the requested number of completed months",
      );
    }
    return monthly.at(-1)!.resultingRevision - 1;
  }

  #checkpointRange(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ): Readonly<{
    startingState: GameStateV2;
    endingState: GameStateV2;
    monthlyRecords: readonly TeachingMonthlyOwnerRecordV2[];
    records: readonly MonthlyTurnV2Record[];
  }> {
    if (!Number.isSafeInteger(fromRevision) || fromRevision < 0) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "checkpoint start revision must be a non-negative safe integer",
      );
    }
    const run = this.#authorize(runId, accessSecret);
    const endingState = run.state;
    if (fromRevision > endingState.revision) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "checkpoint start revision cannot exceed current revision",
      );
    }
    const startingState = run.stateByRevision.get(fromRevision);
    if (!startingState) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "demo runs retain only the latest state for each trailing checkpoint month",
      );
    }

    const monthlyRecords = [...run.acceptedCommands.values()]
      .filter(
        (stored): stored is StoredDemoCommand & { monthlyRecord: MonthlyTurnV2Record } =>
          stored.monthlyRecord !== null &&
          stored.monthlyRecord !== undefined &&
          stored.resultingRevision > fromRevision &&
          stored.resultingRevision <= endingState.revision,
      )
      .sort((left, right) =>
        left.monthlyRecord.processedMonth.localeCompare(
          right.monthlyRecord.processedMonth,
        ),
      )
      .map((stored) =>
        Object.freeze({
          resultingRevision: stored.resultingRevision,
          recordChecksum: sha256Canonical(stored.monthlyRecord),
          record: stored.monthlyRecord,
        }),
      );

    return {
      startingState,
      endingState,
      monthlyRecords,
      records: monthlyRecords.map(({ record }) => record),
    };
  }

  #pruneStates(run: StoredDemoRun): void {
    if (run.stateRevisionByMonth.size <= RETAINED_STATE_MONTHS) return;
    const months = [...run.stateRevisionByMonth.keys()].sort();
    for (const month of months.slice(
      0,
      months.length - RETAINED_STATE_MONTHS,
    )) {
      const revision = run.stateRevisionByMonth.get(month);
      run.stateRevisionByMonth.delete(month);
      if (revision !== undefined) run.stateByRevision.delete(revision);
    }
  }

  async migrateRunStateToV2(runId: string, accessSecret: string) {
    const state = this.#authorize(runId, accessSecret).state;
    return Object.freeze({
      state,
      stateChecksum: sha256Canonical(state),
      idempotentReplay: true,
    });
  }

  #authorize(runId: string, accessSecret: string): StoredDemoRun {
    const run = this.#findRun(runId);
    if (!run || run.accessSecret !== accessSecret) {
      throw new RunRepositoryError(
        "NOT_FOUND_OR_UNAUTHORIZED",
        "run was not found or the credential is invalid",
      );
    }
    return run;
  }

  #findRun(runId: string): StoredDemoRun | null {
    const run = this.#runs.get(runId);
    if (!run) return null;
    const now = this.#clock();
    if (now - run.lastAccessedAt > this.#ttlMs) {
      this.#runs.delete(runId);
      return null;
    }
    run.lastAccessedAt = now;
    this.#runs.delete(runId);
    this.#runs.set(runId, run);
    return run;
  }

  #prune(): void {
    const now = this.#clock();
    for (const [runId, run] of this.#runs) {
      if (now - run.lastAccessedAt > this.#ttlMs) this.#runs.delete(runId);
    }
    while (this.#runs.size > this.#maxRuns) {
      const oldestRunId = this.#runs.keys().next().value as string | undefined;
      if (!oldestRunId) break;
      this.#runs.delete(oldestRunId);
    }
  }
}
