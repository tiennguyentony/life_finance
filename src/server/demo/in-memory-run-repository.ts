import { randomUUID } from "node:crypto";

import { canonicalJson, sha256Canonical } from "@/core/canonical";
import type { GameStateV2 } from "@/core/game-state-v2";
import { assertValidGameStateV2 } from "@/core/game-state-v2-validation";
import type { MonthlyTaxEvidence } from "@/core/payroll-v2";
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
}>;

type StoredDemoRun = {
  readonly accessSecret: string;
  state: GameStateV2;
  readonly acceptedCommands: Map<string, StoredDemoCommand>;
  readonly taxEvidenceByCommand: Map<string, MonthlyTaxEvidence>;
  readonly taxEvidenceByContext: Map<string, MonthlyTaxEvidence>;
};

type InMemoryRunRepositoryOptions = Readonly<{
  runIdFactory?: () => string;
  accessSecretFactory?: () => string;
}>;

export class InMemoryRunRepository implements V2Repository {
  readonly #runs = new Map<string, StoredDemoRun>();
  readonly #runIdFactory: () => string;
  readonly #accessSecretFactory: () => string;

  constructor(options: InMemoryRunRepositoryOptions = {}) {
    this.#runIdFactory = options.runIdFactory ?? randomUUID;
    this.#accessSecretFactory =
      options.accessSecretFactory ?? (() => secretCodec.create().secret);
  }

  hasRun(runId: string): boolean {
    return this.#runs.has(runId);
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
      taxEvidenceByCommand: new Map(),
      taxEvidenceByContext: new Map(),
    });
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
    });
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
  ): Promise<never> {
    void fromRevision;
    this.#authorize(runId, accessSecret);
    throw new Error("checkpoint evidence is unavailable for local demo runs");
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
    const run = this.#runs.get(runId);
    if (!run || run.accessSecret !== accessSecret) {
      throw new RunRepositoryError(
        "NOT_FOUND_OR_UNAUTHORIZED",
        "run was not found or the credential is invalid",
      );
    }
    return run;
  }
}
