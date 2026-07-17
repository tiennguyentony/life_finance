import type { CheckpointEvidenceV2 } from "../../core/checkpoint-v2";
import { getEducationConcept } from "../../data/education-content";
import { sha256Canonical } from "../../core/canonical";
import type { CausalHistoryV1 } from "../../core/causal-history-v1";
import type {
  CounterfactualRequestV1,
  CounterfactualResultV1,
} from "../../core/counterfactual-v1";
import {
  COUNTERFACTUAL_EXECUTION_POLICY_V1,
  CounterfactualV1Error,
} from "../../core/counterfactual-v1";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { RecordLearningInteractionV2Command } from "../../core/learning-interaction-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import type { TeachingFactPacketV2 } from "../../core/teaching-facts-v2";
import {
  buildTeachingCheckpointFromOwnersV2,
  type TeachingCheckpointOwnerBundleV2,
} from "../../core/teaching-checkpoint-owner-v2";
import {
  buildTeachingDebriefV2,
  type TeachingDebriefV2,
} from "../../core/teaching-debrief-v2";
import {
  selectTeachingMomentV2,
  type TeachingMomentTriggerV2,
} from "../../core/teaching-relevance-v2";
import {
  type TeachingCheckpointV2,
  type TeachingMomentV2,
} from "../../core/teaching-presentation-v2";
import type { GameCommandV2 } from "../db/run-repository-contracts";

const TEACHING_COUNTERFACTUAL_FIELDS_V2 = Object.freeze([
  "emergencyFundTargetMonthsPpm",
  "afterTaxBroadIndexRatePpm",
  "afterTaxSectorRatePpm",
  "afterTaxSpeculativeRatePpm",
  "afterTaxIraRatePpm",
  "afterTaxExtraDebtRatePpm",
] as const);

export function buildDeterministicTeachingCounterfactualRequestV2(
  command: GameCommandV2,
): CounterfactualRequestV1 | null {
  if (command.type !== "set_recurring_strategy") return null;
  const field = TEACHING_COUNTERFACTUAL_FIELDS_V2.find((candidate) => {
    const value = command.payload.strategy[candidate];
    return Number.isSafeInteger(value) && value !== undefined && value > 0;
  });
  if (!field) return null;
  return Object.freeze({
    version: "counterfactual-v1",
    sourceCommandId: command.id,
    intervention: Object.freeze({
      kind: "recurring_strategy_field",
      commandId: command.id,
      field,
      value: 0,
    }),
    horizonMonths: Math.min(
      12,
      COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumHorizonMonths,
    ),
  });
}

export type TeachingCheckpointRepositoryV2 = Readonly<{
  loadAuthorizedRunV2: (
    runId: string,
    accessSecret: string,
  ) => Promise<Readonly<{ runId: string; revision: number; currentMonth: string }>>;
  loadCheckpointEvidenceV2: (
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ) => Promise<CheckpointEvidenceV2>;
  loadTeachingCheckpointOwnerBundleV2?: (
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ) => Promise<TeachingCheckpointOwnerBundleV2>;
  applyCommandV2?: (
    runId: string,
    accessSecret: string,
    command: RecordLearningInteractionV2Command,
  ) => Promise<Readonly<{ state: GameStateV2 }>>;
  loadCausalHistoryV1?: (
    runId: string,
    accessSecret: string,
  ) => Promise<CausalHistoryV1>;
  runCounterfactualV1?: (
    runId: string,
    accessSecret: string,
    request: CounterfactualRequestV1,
  ) => Promise<CounterfactualResultV1>;
  loadAcceptedCommandV2?: (
    runId: string,
    accessSecret: string,
    commandId: string,
  ) => Promise<GameCommandV2 | null>;
}>;

export type TeachingCheckpointRequestV2 = Readonly<{
  expectedRevision: number;
  fromRevision: number;
}>;

export type TeachingCheckpointResponseV2 = Readonly<{
  source: "deterministic_template";
  checkpoint: TeachingCheckpointV2;
}>;

export type TeachingMomentRequestV2 = Readonly<{
  expectedRevision: number;
  trigger: "automatic" | "requested_help";
  conceptId?: string;
}>;

export type TeachingMomentResponseV2 = Readonly<{
  source: "deterministic_template";
  moment: TeachingMomentV2 | null;
  facts: TeachingFactPacketV2 | null;
  state: GameStateV2;
  stateChecksum: string;
}>;

export type TeachingDebriefRequestV2 = Readonly<{
  expectedRevision: number;
  counterfactuals: readonly CounterfactualRequestV1[];
}>;

export type TeachingDebriefResponseV2 = Readonly<{
  source: "deterministic_template";
  counterfactualRequestSource:
    | "client_requested"
    | "deterministic_default"
    | "unavailable";
  debrief: TeachingDebriefV2;
  stateChecksum: string;
}>;

export class TeachingServiceV2Error extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "STALE_REVISION") {
    super(code);
    this.name = "TeachingServiceV2Error";
  }
}

const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;

async function loadDeterministicCounterfactualDefaultV2(
  repository: TeachingCheckpointRepositoryV2,
  runId: string,
  accessSecret: string,
  history: CausalHistoryV1,
): Promise<CounterfactualRequestV1 | null> {
  if (!repository.loadAcceptedCommandV2) return null;
  const latestPolicyNode = [...history.nodes]
    .filter(({ kind }) => kind === "policy_change")
    .sort((left, right) => right.resultingRevision - left.resultingRevision)[0];
  if (!latestPolicyNode) return null;
  const commandEvidenceId = latestPolicyNode.sourceEvidenceIds.find((sourceId) =>
    sourceId.startsWith("command:"),
  );
  if (!commandEvidenceId) return null;
  const command = await repository.loadAcceptedCommandV2(
    runId,
    accessSecret,
    commandEvidenceId.slice("command:".length),
  );
  return command
    ? buildDeterministicTeachingCounterfactualRequestV2(command)
    : null;
}

function assertRequest(
  runId: string,
  request: TeachingCheckpointRequestV2,
): void {
  if (
    !RUN_ID.test(runId) ||
    !Number.isSafeInteger(request.expectedRevision) ||
    request.expectedRevision < 0 ||
    !Number.isSafeInteger(request.fromRevision) ||
    request.fromRevision < 0 ||
    request.fromRevision > request.expectedRevision
  ) {
    throw new TeachingServiceV2Error("INVALID_REQUEST");
  }
}

export class TeachingServiceV2 {
  constructor(private readonly repository: TeachingCheckpointRepositoryV2) {}

  async getCheckpoint(
    runId: string,
    accessSecret: string,
    request: TeachingCheckpointRequestV2,
  ): Promise<TeachingCheckpointResponseV2> {
    assertRequest(runId, request);
    const before = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (before.runId !== runId || before.revision !== request.expectedRevision) {
      throw new TeachingServiceV2Error("STALE_REVISION");
    }
    const loadBundle = this.repository.loadTeachingCheckpointOwnerBundleV2;
    if (!loadBundle) throw new TeachingServiceV2Error("INVALID_REQUEST");
    const bundle = await loadBundle.call(
      this.repository,
      runId,
      accessSecret,
      request.fromRevision,
    );
    const after = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (after.runId !== runId || after.revision !== request.expectedRevision) {
      throw new TeachingServiceV2Error("STALE_REVISION");
    }
    return Object.freeze({
      source: "deterministic_template",
      checkpoint: buildTeachingCheckpointFromOwnersV2(bundle),
    });
  }

  async getMoment(
    runId: string,
    accessSecret: string,
    request: TeachingMomentRequestV2,
  ): Promise<TeachingMomentResponseV2> {
    if (
      !RUN_ID.test(runId) ||
      !Number.isSafeInteger(request.expectedRevision) ||
      request.expectedRevision < 0 ||
      (request.trigger === "automatic" && request.conceptId !== undefined) ||
      (request.trigger === "requested_help" &&
        (request.conceptId === undefined ||
          !RUN_ID.test(request.conceptId) ||
          getEducationConcept(request.conceptId) === undefined))
    ) {
      throw new TeachingServiceV2Error("INVALID_REQUEST");
    }
    const initial = (await this.repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    )) as GameStateV2;
    if (initial.runId !== runId || initial.revision !== request.expectedRevision) {
      throw new TeachingServiceV2Error("STALE_REVISION");
    }
    const trigger: TeachingMomentTriggerV2 =
      request.trigger === "automatic"
        ? { kind: "automatic" }
        : { kind: "requested_help", conceptId: request.conceptId! };
    const selection = selectTeachingMomentV2(
      initial,
      analyzeRiskV1(initial),
      trigger,
    );
    if (!selection.moment) {
      return Object.freeze({
        source: "deterministic_template",
        moment: null,
        facts: null,
        state: initial,
        stateChecksum: sha256Canonical(initial),
      });
    }
    if (!this.repository.applyCommandV2) {
      throw new TeachingServiceV2Error("INVALID_REQUEST");
    }
    const command: RecordLearningInteractionV2Command = {
      schemaVersion: 2,
      id: `teaching.${request.trigger}.${initial.revision}.${selection.moment.conceptId}`,
      type: "record_learning_interaction_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: { conceptId: selection.moment.conceptId, kind: "glossary" },
    };
    const applied = await this.repository.applyCommandV2(
      runId,
      accessSecret,
      command,
    );
    return Object.freeze({
      source: "deterministic_template",
      moment: selection.moment,
      facts: selection.facts,
      state: applied.state,
      stateChecksum: sha256Canonical(applied.state),
    });
  }

  async getDebrief(
    runId: string,
    accessSecret: string,
    request: TeachingDebriefRequestV2,
  ): Promise<TeachingDebriefResponseV2> {
    if (
      !RUN_ID.test(runId) ||
      !Number.isSafeInteger(request.expectedRevision) ||
      request.expectedRevision < 0 ||
      request.counterfactuals.length > 2 ||
      request.counterfactuals.some(({ version }) => version !== "counterfactual-v1")
    ) {
      throw new TeachingServiceV2Error("INVALID_REQUEST");
    }
    const initial = (await this.repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    )) as GameStateV2;
    if (
      initial.runId !== runId ||
      initial.revision !== request.expectedRevision
    ) {
      throw new TeachingServiceV2Error("STALE_REVISION");
    }
    if (
      initial.outcome === null ||
      !("outcomePolicyVersion" in initial.outcome) ||
      !this.repository.loadCausalHistoryV1 ||
      (request.counterfactuals.length > 0 && !this.repository.runCounterfactualV1)
    ) {
      throw new TeachingServiceV2Error("INVALID_REQUEST");
    }
    const initialChecksum = sha256Canonical(initial);
    const history = await this.repository.loadCausalHistoryV1(
      runId,
      accessSecret,
    );
    let counterfactualRequestSource: TeachingDebriefResponseV2["counterfactualRequestSource"] =
      request.counterfactuals.length > 0 ? "client_requested" : "unavailable";
    let selectedCounterfactuals = request.counterfactuals;
    if (
      selectedCounterfactuals.length === 0 &&
      this.repository.runCounterfactualV1 &&
      this.repository.loadAcceptedCommandV2
    ) {
      const deterministicDefault = await loadDeterministicCounterfactualDefaultV2(
        this.repository,
        runId,
        accessSecret,
        history,
      );
      if (deterministicDefault) {
        selectedCounterfactuals = [deterministicDefault];
        counterfactualRequestSource = "deterministic_default";
      }
    }
    const counterfactuals: CounterfactualResultV1[] = [];
    for (const counterfactual of selectedCounterfactuals) {
      try {
        counterfactuals.push(
          await this.repository.runCounterfactualV1!(
            runId,
            accessSecret,
            counterfactual,
          ),
        );
      } catch (error) {
        if (
          counterfactualRequestSource === "deterministic_default" &&
          error instanceof CounterfactualV1Error
        ) {
          counterfactualRequestSource = "unavailable";
          break;
        }
        throw error;
      }
    }
    const after = (await this.repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    )) as GameStateV2;
    if (
      after.revision !== request.expectedRevision ||
      sha256Canonical(after) !== initialChecksum
    ) {
      throw new TeachingServiceV2Error("STALE_REVISION");
    }
    return Object.freeze({
      source: "deterministic_template",
      counterfactualRequestSource,
      debrief: buildTeachingDebriefV2({
        outcome: initial.outcome,
        outcomeStateChecksum: initialChecksum,
        causalHistory: history,
        counterfactuals,
      }),
      stateChecksum: initialChecksum,
    });
  }
}
