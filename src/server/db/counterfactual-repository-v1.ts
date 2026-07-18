import { sha256Canonical } from "../../core/canonical";
import {
  COUNTERFACTUAL_EXECUTION_POLICY_V1,
  CounterfactualV1Error,
  executeCounterfactualV1,
  planCounterfactualV1,
  type CounterfactualMonthlyOutcomeV1,
  type CounterfactualRequestV1,
  type CounterfactualResultV1,
  type CounterfactualSeedEvidenceV1,
  type CounterfactualStateOutcomeV1,
  type CounterfactualTaxCompatibilityV1,
} from "../../core/counterfactual-v1";
import { safeBigIntToNumber } from "../../core/domain/integer";
import { projectFinancialGoal } from "../../core/financial-goals-v2";
import { calculateNetWorth } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { MonthlyTurnV2Record } from "../../core/monthly-turn-v2";
import type { RunSecretCodec } from "../auth/run-secret";
import { fingerprintAnnualTaxContext } from "../tax/context-cache";
import { buildTaxRequest } from "../api/tax-orchestrator";
import type { LifeFinanceDatabase } from "./client";
import { loadVerifiedRunReplayHistoryV1 } from "./causal-history-repository-v1";
import type { VerifiedRunReplayHistoryV1 } from "./causal-history-repository-v1";
import type { GameCommandV2 } from "./run-repository-contracts";
import { reduceGameCommandV2 } from "./run-repository-support";
import { visitAcceptedCommandsV2 } from "./run-state-replay-v2";

function stateEvidence(state: GameStateV2): string {
  return `state:${state.revision}:${sha256Canonical(state)}`;
}

function sharedCursorEvidence(
  state: GameStateV2,
): CounterfactualSeedEvidenceV1 {
  return Object.freeze({
    mode: "shared_cursor" as const,
    stateEvidenceId: stateEvidence(state),
    randomStateChecksum: sha256Canonical(state.random),
  });
}

function summarizeState(state: GameStateV2): CounterfactualStateOutcomeV1 {
  const balance = state.gameplay.runtimeBalance;
  return Object.freeze({
    revision: state.revision,
    month: state.currentMonth,
    cashCents: state.finances.cashCents,
    totalDebtCents: safeBigIntToNumber(
      BigInt(state.finances.nonCreditLiabilitiesCents) +
        BigInt(state.finances.creditUsedCents),
      "counterfactual total debt",
    ),
    netWorthCents: calculateNetWorth(state.finances),
    recoveryRemainingMonths:
      balance?.version === 2 && balance.recovery !== null
        ? balance.recovery.remainingMonths
        : null,
    fiProgressPpm: projectFinancialGoal(
      state.finances,
      state.gameplay.financialGoal,
    ).progressPpm,
    outcomeKind: state.outcome?.kind ?? null,
    outcomeReasonCode: state.outcome?.reasonCode ?? null,
  });
}

function summarizeMonthlyRecord(
  record: MonthlyTurnV2Record,
): CounterfactualMonthlyOutcomeV1 {
  const liquidatedBuckets = record.funding?.liquidatedBuckets;
  const forcedSaleCount = liquidatedBuckets
    ? Object.values(liquidatedBuckets).filter((amount) => amount > 0).length
    : 0;
  return Object.freeze({
    forcedSaleGrossCents: record.funding?.grossLiquidationCents ?? 0,
    forcedSaleCount,
    newRevolvingCreditCents: record.funding?.creditDrawnCents ?? 0,
    residualShortfallCents: record.fundingPlan?.residualShortfallCents ?? 0,
  });
}

function taxCompatibility(
  actualState: GameStateV2,
  alternativeState: GameStateV2,
  command: GameCommandV2,
): CounterfactualTaxCompatibilityV1 {
  if (command.type !== "process_month_v2") {
    return Object.freeze({ compatible: false, reason: "missing_fingerprint" });
  }
  const persisted = command.payload.taxEvidence.contextFingerprint;
  if (!persisted) {
    return Object.freeze({ compatible: false, reason: "missing_fingerprint" });
  }
  const actualContextFingerprint = fingerprintAnnualTaxContext(
    buildTaxRequest(actualState, command.id),
  );
  const alternativeContextFingerprint = fingerprintAnnualTaxContext(
    buildTaxRequest(alternativeState, command.id),
  );
  if (
    persisted !== actualContextFingerprint ||
    persisted !== alternativeContextFingerprint
  ) {
    return Object.freeze({ compatible: false, reason: "context_mismatch" });
  }
  return Object.freeze({
    compatible: true,
    actualContextFingerprint,
    alternativeContextFingerprint,
    taxEvidenceId: `tax:${command.payload.taxEvidence.traceId}`,
  });
}

export async function runCounterfactualV1(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  request: CounterfactualRequestV1,
): Promise<CounterfactualResultV1> {
  const history = await loadVerifiedRunReplayHistoryV1(
    db,
    secretCodec,
    runId,
    accessSecret,
  );
  return runCounterfactualFromReplayV1(history, request);
}

export function runCounterfactualFromReplayV1(
  history: VerifiedRunReplayHistoryV1,
  request: CounterfactualRequestV1,
): CounterfactualResultV1 {
  let openingState: GameStateV2 | null = null;
  let sourceCommand: GameCommandV2 | null = null;
  const futureCommands: GameCommandV2[] = [];
  let sourceSeen = false;
  visitAcceptedCommandsV2(
    history.anchor,
    history.rows,
    history.targetRevision,
    (transition) => {
      if (transition.command.id === request.sourceCommandId) {
        openingState = transition.before;
        sourceCommand = transition.command;
        sourceSeen = true;
        return;
      }
      if (
        sourceSeen &&
        futureCommands.length <
          COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumAcceptedCommands
      ) {
        futureCommands.push(transition.command);
      }
    },
  );
  if (
    openingState === null ||
    sourceCommand === null ||
    (sourceCommand as GameCommandV2).type !== "set_recurring_strategy" &&
      (sourceCommand as GameCommandV2).type !== "resolve_event_choice"
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_COMMAND_NOT_FOUND",
      "request.sourceCommandId",
      "must identify an accepted strategy or event-response command in verified replay",
    );
  }
  const opening = openingState as GameStateV2;
  const source = sourceCommand as Extract<
    GameCommandV2,
    { type: "set_recurring_strategy" | "resolve_event_choice" }
  >;
  const pending = opening.gameplay.eventLifecycle.pending;
  const availableEventChoiceIds =
    source.type === "resolve_event_choice" &&
    pending?.eventId === source.payload.eventId
      ? pending.choiceIds
      : [];
  const availableInsuranceCoverageIds = uniqueCoverageIds(opening);
  const seedEvidence = sharedCursorEvidence(opening);
  const plan = planCounterfactualV1({
    request,
    sourceCommand: source,
    seedEvidence,
    availableEventChoiceIds,
    availableInsuranceCoverageIds,
  });
  return executeCounterfactualV1(
    {
      plan,
      openingState: opening,
      sourceCommand: source,
      futureCommands,
    },
    {
      reduceProductionCommand: reduceGameCommandV2,
      canonicalStateChecksum: sha256Canonical,
      commandMetadata: (command) => Object.freeze({
        id: command.id,
        expectedRevision: command.expectedRevision,
        effectiveMonth: command.effectiveMonth,
        isMonthlyCommand: command.type === "process_month_v2",
      }),
      summarizeState,
      summarizeMonthlyRecord,
      taxCompatibilityBeforeMonthlyCommand: taxCompatibility,
      seedEvidenceAtMonthlyOpening: (actual, alternative) => Object.freeze({
        actual: sharedCursorEvidence(actual),
        alternative: sharedCursorEvidence(alternative),
      }),
    },
  );
}

function uniqueCoverageIds(state: GameStateV2): readonly string[] {
  const snapshot = state.gameplay.catalogSnapshot;
  const available = snapshot?.selected.benefitsPackage.insuranceCoverageIds ??
    state.gameplay.benefits.insuranceCoverageIds;
  return Object.freeze([...new Set(available)].sort());
}
