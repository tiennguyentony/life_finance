import { and, asc, eq, gt, lte } from "drizzle-orm";

import {
  buildCausalHistoryV1,
  causalNodeV1,
  type CausalAffectedValueV1,
  type CausalHistoryLinkInputV1,
  type CausalHistoryV1,
  type CausalMissingEvidenceV1,
  type CausalNodeV1,
  type CausalRuleCodeV1,
  type CausalStateDigestV1,
  type VerifiedRunTransitionV1,
} from "../../core/causal-history-v1";
import { sha256Canonical } from "../../core/canonical";
import { projectFinancialGoal } from "../../core/financial-goals-v2";
import { calculateNetWorth } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { MonthlyTurnV2Record } from "../../core/monthly-turn-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import {
  selectTurningPointsV1,
  TURNING_POINT_POLICY_V1,
} from "../../core/turning-points-v1";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import type { RunSecretCodec } from "../auth/run-secret";
import type { LifeFinanceDatabase } from "./client";
import { loadAuthorizedRunV2 } from "./run-repository-read";
import type { GameCommandV2 } from "./run-repository-contracts";
import { RunRepositoryError } from "./run-repository-contracts";
import {
  acceptedCommands,
  monthlyTurnRecords,
  runStateMigrations,
  runStateSnapshots,
} from "./schema";
import {
  visitAcceptedCommandsV2,
  type AcceptedCommandReplayRowV2,
  type AcceptedCommandReplayTransitionV2,
  type RunStateReplayAnchorV2,
} from "./run-state-replay-v2";

export type VerifiedRunReplayHistoryV1 = Readonly<{
  anchor: RunStateReplayAnchorV2;
  rows: readonly AcceptedCommandReplayRowV2[];
  targetRevision: number;
  targetStateChecksum: string;
  storedMonthlyRecords?: readonly StoredMonthlyRecordEvidenceV1[];
  /** Public range boundary. Replay may begin earlier at the verified anchor. */
  responseFromRevision?: number;
  /** Exclusive boundary before which records are summarized instead of detailed. */
  detailFromRevision?: number;
}>;

export type CausalHistoryRevisionRangeV1 = Readonly<{
  fromRevision?: number;
  toRevision?: number;
}>;

export type StoredMonthlyRecordEvidenceV1 = Readonly<{
  commandId: string;
  processedMonth: string;
  resultingRevision: number;
  taxTraceId: string;
  recordChecksum: string;
  record: MonthlyTurnV2Record;
}>;

export const CAUSAL_HISTORY_DETAIL_COMMAND_LIMIT_V1 = 120 as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareText));
}

function stateEvidenceId(state: GameStateV2, checksum: string): string {
  return `state:${state.revision}:${checksum}`;
}

function debtCents(state: GameStateV2): number {
  return state.finances.nonCreditLiabilitiesCents + state.finances.creditUsedCents;
}

function stateDigest(
  state: GameStateV2,
  checksum: string,
): CausalStateDigestV1 {
  const risk = analyzeRiskV1(state);
  const balance = state.gameplay.runtimeBalance;
  const recovery = balance?.version === 2 && balance.recovery !== null
    ? Object.freeze({
        sourceEvidenceId: `runtime-balance:${balance.recovery.sourceEventId}`,
        sourceTier: balance.recovery.sourceTier,
        remainingMonths: balance.recovery.remainingMonths,
      })
    : null;
  return Object.freeze({
    stateEvidenceId: stateEvidenceId(state, checksum),
    month: state.currentMonth,
    netWorthCents: calculateNetWorth(state.finances),
    liquidResourceCoveragePpm:
      risk.metrics.liquid_resource_coverage.normalizedInput,
    liquidResourceBand: risk.metrics.liquid_resource_coverage.band,
    highInterestDebtBurdenPpm:
      risk.metrics.high_interest_debt_burden.normalizedInput,
    fiProgressPpm: projectFinancialGoal(
      state.finances,
      state.gameplay.financialGoal,
    ).progressPpm,
    recovery,
    outcomeReasonCode: state.outcome?.reasonCode ?? null,
  });
}

function affectedValue(
  metricId: string,
  unit: CausalAffectedValueV1["unit"],
  before: number | null,
  after: number | null,
  factIds: readonly string[],
): CausalAffectedValueV1 | null {
  if (before === after) return null;
  return Object.freeze({
    metricId,
    unit,
    before,
    after,
    delta:
      before === null || after === null ? null : after - before,
    factIds: unique(factIds),
  });
}

export function assertImmutableLedgerPrefixV1(
  before: GameStateV2,
  after: GameStateV2,
): void {
  if (
    after.ledger.transactions.length < before.ledger.transactions.length ||
    before.ledger.transactions.some(
      (transaction, index) =>
        sha256Canonical(transaction) !==
        sha256Canonical(after.ledger.transactions[index]),
    )
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "causal replay detected a rewritten ledger prefix",
    );
  }
}

function newlyAddedLedgerEvidence(
  before: GameStateV2,
  after: GameStateV2,
): readonly string[] {
  assertImmutableLedgerPrefixV1(before, after);
  const beforeIds = new Set(before.ledger.transactions.map(({ id }) => id));
  return unique(
    after.ledger.transactions
      .filter(({ id }) => !beforeIds.has(id))
      .map(({ id }) => `ledger:${id}`),
  );
}

function newlyAddedLedgerTransactions(
  before: GameStateV2,
  after: GameStateV2,
) {
  const beforeIds = new Set(before.ledger.transactions.map(({ id }) => id));
  return after.ledger.transactions.filter(({ id }) => !beforeIds.has(id));
}

function newlyResolvedMilestoneEvidence(
  before: GameStateV2,
  after: GameStateV2,
): readonly string[] {
  const beforeIds = new Set(
    (before.gameplay.lifeMilestones?.history ?? []).map(({ milestoneId }) =>
      milestoneId
    ),
  );
  return unique(
    (after.gameplay.lifeMilestones?.history ?? [])
      .filter(({ milestoneId }) => !beforeIds.has(milestoneId))
      .map(({ milestoneId }) => `milestone:${milestoneId}`),
  );
}

function financialEffects(
  transition: AcceptedCommandReplayTransitionV2,
  primaryEvidenceId: string,
) {
  const plan = transition.monthlyRecord?.fundingPlan;
  return Object.freeze([
    Object.freeze({
      sourceEvidenceId: primaryEvidenceId,
      forcedSaleGrossCents:
        transition.monthlyRecord?.funding?.grossLiquidationCents ?? 0,
      newRevolvingCreditCents:
        transition.monthlyRecord?.funding?.creditDrawnCents ?? 0,
      residualShortfallCents: plan?.residualShortfallCents ?? 0,
    }),
  ]);
}

function lessonTags(
  command: GameCommandV2,
  monthlyRecord: MonthlyTurnV2Record | null,
  before: GameStateV2,
  after: GameStateV2,
): readonly string[] {
  if (command.type === "resolve_event_choice") {
    const resolved = after.gameplay.eventLifecycle.history.find(
      ({ commandId }) => commandId === command.id,
    );
    return unique(
      resolved?.lessonTags
        ? [resolved.lessonTags.primary, ...resolved.lessonTags.secondary]
        : [],
    );
  }
  const scheduled = monthlyRecord?.scheduledEvent;
  if (scheduled?.lessonTags) {
    return unique([
      scheduled.lessonTags.primary,
      ...scheduled.lessonTags.secondary,
    ]);
  }
  return unique(
    before.gameplay.eventLifecycle.pending?.lessonTags
      ? [
          before.gameplay.eventLifecycle.pending.lessonTags.primary,
          ...before.gameplay.eventLifecycle.pending.lessonTags.secondary,
        ]
      : [],
  );
}

function approvedParameterValues(
  templateId: string,
  templateVersion: number,
  parameters: Readonly<Record<string, number>>,
  factIds: readonly string[],
): readonly CausalAffectedValueV1[] {
  const template = PERSONAL_EVENT_TEMPLATES_V2.find(
    (candidate) =>
      candidate.id === templateId && candidate.version === templateVersion,
  );
  if (!template) return Object.freeze([]);
  const kinds = new Map(
    template.parameters.map((parameter) => [parameter.id, parameter.kind]),
  );
  return Object.freeze(
    Object.entries(parameters)
      .sort(([left], [right]) => compareText(left, right))
      .flatMap(([parameterId, value]) => {
        const kind = kinds.get(parameterId);
        if (!kind || !Number.isSafeInteger(value)) return [];
        return [Object.freeze({
          metricId: `event_parameter.${parameterId}`,
          unit: kind === "money_cents" ? "money_cents" as const : "ratio_ppm" as const,
          before: null,
          after: value,
          delta: null,
          factIds: unique(factIds),
        })];
      }),
  );
}

function recurringPolicyAffectedValues(
  command: Extract<GameCommandV2, { type: "set_recurring_strategy" }>,
  before: GameStateV2,
  commandEvidence: string,
  afterEvidence: string,
): readonly CausalAffectedValueV1[] {
  const values: CausalAffectedValueV1[] = [];
  for (const [field, value] of Object.entries(command.payload.strategy).sort(
    ([left], [right]) => compareText(left, right),
  )) {
    if (Array.isArray(value)) {
      const beforeCount =
        before.gameplay.recurringStrategy.insuranceCoverageIds?.length ?? 0;
      values.push(Object.freeze({
        metricId: `recurring_strategy.${field}.count`,
        unit: "count",
        before: beforeCount,
        after: value.length,
        delta: value.length - beforeCount,
        factIds: unique([commandEvidence, afterEvidence]),
      }));
      continue;
    }
    const beforeValue = before.gameplay.recurringStrategy[
      field as keyof typeof before.gameplay.recurringStrategy
    ];
    if (typeof value !== "number" || typeof beforeValue !== "number") continue;
    values.push(Object.freeze({
      metricId: `recurring_strategy.${field}`,
      unit:
        field === "emergencyFundTargetMonthsPpm"
          ? "months_ppm"
          : "ratio_ppm",
      before: beforeValue,
      after: value,
      delta: value - beforeValue,
      factIds: unique([commandEvidence, afterEvidence]),
    }));
  }
  return Object.freeze(values);
}

type GraphAccumulator = {
  nodes: CausalNodeV1[];
  links: CausalHistoryLinkInputV1[];
  nodeIds: Set<string>;
};

function addNode(
  graph: GraphAccumulator,
  node: CausalNodeV1,
): CausalNodeV1 {
  if (!graph.nodeIds.has(node.id)) {
    graph.nodeIds.add(node.id);
    graph.nodes.push(node);
  }
  return node;
}

function addLink(
  graph: GraphAccumulator,
  parent: CausalNodeV1,
  child: CausalNodeV1,
  ruleCode: CausalRuleCodeV1,
  evidenceIds: readonly string[],
): void {
  graph.links.push(Object.freeze({
    parentNodeId: parent.id,
    childNodeId: child.id,
    ruleCode,
    sourceEvidenceIds: unique(evidenceIds),
  }));
}

function nodeFor(
  transition: AcceptedCommandReplayTransitionV2,
  kind: CausalNodeV1["kind"],
  primarySourceEvidenceId: string,
  sourceEvidenceIds: readonly string[],
  tags: readonly string[],
  affectedValues: readonly CausalAffectedValueV1[],
): CausalNodeV1 {
  return causalNodeV1({
    kind,
    primarySourceEvidenceId,
    month: transition.command.effectiveMonth,
    resultingRevision: transition.row.resultingRevision,
    sourceEvidenceIds: unique([primarySourceEvidenceId, ...sourceEvidenceIds]),
    lessonTags: tags,
    affectedValues,
  });
}

function appendTransition(
  graph: GraphAccumulator,
  transition: AcceptedCommandReplayTransitionV2,
  compact: VerifiedRunTransitionV1[],
  missingEvidence: CausalMissingEvidenceV1[],
): void {
  const { command, before, after, monthlyRecord } = transition;
  const commandEvidence = `command:${command.id}`;
  const beforeEvidence = stateEvidenceId(before, transition.beforeStateChecksum);
  const afterEvidence = stateEvidenceId(after, transition.afterStateChecksum);
  const ledgerTransactions = newlyAddedLedgerTransactions(before, after);
  const ledgerEvidence = newlyAddedLedgerEvidence(before, after);
  const beforeRisk = analyzeRiskV1(before);
  const afterRisk = analyzeRiskV1(after);
  const tags = lessonTags(command, monthlyRecord, before, after);
  const evidence = unique([
    commandEvidence,
    beforeEvidence,
    afterEvidence,
    ...ledgerEvidence,
  ]);
  let responseNode: CausalNodeV1 | null = null;
  let responseEvidenceId: string | null = null;
  const decision = command.type === "process_month_v2" ||
      command.type === "record_learning_interaction_v2"
    ? null
    : addNode(
        graph,
        nodeFor(transition, "decision", commandEvidence, evidence, tags, []),
      );

  let financial: CausalNodeV1 | null = null;
  const financialValues = [
    affectedValue(
      "cash_cents",
      "money_cents",
      before.finances.cashCents,
      after.finances.cashCents,
      evidence,
    ),
    affectedValue(
      "net_worth_cents",
      "money_cents",
      calculateNetWorth(before.finances),
      calculateNetWorth(after.finances),
      evidence,
    ),
    affectedValue(
      "debt_cents",
      "money_cents",
      debtCents(before),
      debtCents(after),
      evidence,
    ),
  ].filter((value): value is CausalAffectedValueV1 => value !== null);
  if (financialValues.length > 0) {
    const primary = command.type === "process_month_v2"
      ? `monthly:${command.id}`
      : (ledgerEvidence[0] ?? null);
    if (primary === null) {
      missingEvidence.push(Object.freeze({
        code: "ledger_provenance_absent",
        fromRevision: after.revision,
        toRevision: after.revision,
        sourceEvidenceIds: Object.freeze([
          commandEvidence,
          beforeEvidence,
          afterEvidence,
        ]),
      }));
    } else {
      financial = addNode(
        graph,
        nodeFor(
          transition,
          "financial_effect",
          primary,
          unique([primary, ...evidence]),
          tags,
          financialValues,
        ),
      );
      if (decision && command.type !== "resolve_event_choice") {
        addLink(
          graph,
          decision,
          financial,
          "decision_applied_financial_transaction",
          [commandEvidence],
        );
      }
    }
  }

  if (command.type === "set_recurring_strategy" && decision) {
    const policy = addNode(
      graph,
      nodeFor(
        transition,
        "policy_change",
        commandEvidence,
        evidence,
        tags,
        recurringPolicyAffectedValues(
          command,
          before,
          commandEvidence,
          afterEvidence,
        ),
      ),
    );
    addLink(
      graph,
      decision,
      policy,
      "policy_command_changed_strategy",
      [commandEvidence],
    );
  }

  if (command.type === "resolve_event_choice") {
    const resolvedEvent = after.gameplay.eventLifecycle.history.find(
      ({ commandId }) => commandId === command.id,
    );
    const pendingEvent =
      before.gameplay.eventLifecycle.pending?.eventId === command.payload.eventId
        ? before.gameplay.eventLifecycle.pending
        : null;
    const verifiedEventId = resolvedEvent?.eventId ?? pendingEvent?.eventId;
    if (!verifiedEventId) {
      missingEvidence.push(Object.freeze({
        code: "event_response_evidence_absent",
        fromRevision: after.revision,
        toRevision: after.revision,
        sourceEvidenceIds: Object.freeze([commandEvidence]),
      }));
    } else {
    const responseEvidence = `event-response:${verifiedEventId}:${command.id}`;
    responseEvidenceId = responseEvidence;
    const response = addNode(
      graph,
      nodeFor(
        transition,
        "response",
        responseEvidence,
        unique([responseEvidence, ...evidence]),
        tags,
        [],
      ),
    );
    responseNode = response;
    const eventEvidence = `event:${verifiedEventId}`;
    const existingEvent = graph.nodes.find(
      (node) => node.kind === "event" && node.sourceEvidenceIds[0] === eventEvidence,
    );
    const event = existingEvent ?? addNode(
      graph,
      causalNodeV1({
        kind: "event",
        primarySourceEvidenceId: eventEvidence,
        month: resolvedEvent?.scheduledMonth ?? pendingEvent!.scheduledMonth,
        resultingRevision: before.revision,
        sourceEvidenceIds: unique([eventEvidence, beforeEvidence]),
        lessonTags: tags,
        affectedValues: [],
      }),
    );
    addLink(
      graph,
      event,
      response,
      "event_presented_response_context",
      [eventEvidence, responseEvidence],
    );
    if (financial) {
      addLink(
        graph,
        response,
        financial,
        "event_response_declared_effect",
        [responseEvidence],
      );
    }
    if (!resolvedEvent) {
      missingEvidence.push(Object.freeze({
        code: "event_response_evidence_absent",
        fromRevision: after.revision,
        toRevision: after.revision,
        sourceEvidenceIds: Object.freeze([commandEvidence]),
      }));
    }
    }
  }

  const milestones = newlyResolvedMilestoneEvidence(before, after);
  for (const milestoneEvidence of milestones) {
    const milestone = addNode(
      graph,
      nodeFor(
        transition,
        "milestone",
        milestoneEvidence,
        unique([milestoneEvidence, ...evidence]),
        tags,
        financial?.affectedValues ?? [],
      ),
    );
    if (financial) {
      addLink(
        graph,
        milestone,
        financial,
        "milestone_resolution_applied",
        [milestoneEvidence],
      );
    }
  }

  const beforeBalance = before.gameplay.runtimeBalance;
  const afterBalance = after.gameplay.runtimeBalance;
  const beforeRecovery = beforeBalance?.version === 2
    ? beforeBalance.recovery
    : null;
  const afterRecovery = afterBalance?.version === 2
    ? afterBalance.recovery
    : null;
  if (
    beforeRecovery?.sourceEventId !== afterRecovery?.sourceEventId ||
    beforeRecovery?.remainingMonths !== afterRecovery?.remainingMonths
  ) {
    const sourceEventId = afterRecovery?.sourceEventId ?? beforeRecovery?.sourceEventId;
    if (sourceEventId) {
      const recoveryEvidence = `runtime-balance:${sourceEventId}:${command.id}`;
      const recoveryNode = addNode(
        graph,
        nodeFor(
          transition,
          "recovery",
          recoveryEvidence,
          unique([recoveryEvidence, beforeEvidence, afterEvidence, commandEvidence]),
          tags,
          [
            Object.freeze({
              metricId: "recovery_remaining_months",
              unit: "months",
              before: beforeRecovery?.remainingMonths ?? null,
              after: afterRecovery?.remainingMonths ?? null,
              delta:
                beforeRecovery && afterRecovery
                  ? afterRecovery.remainingMonths - beforeRecovery.remainingMonths
                  : null,
              factIds: unique([recoveryEvidence, beforeEvidence, afterEvidence]),
            }),
          ],
        ),
      );
      if (
        responseNode &&
        responseEvidenceId &&
        command.type === "resolve_event_choice" &&
        sourceEventId === command.payload.eventId
      ) {
        addLink(
          graph,
          responseNode,
          recoveryNode,
          "event_response_declared_effect",
          [responseEvidenceId, recoveryEvidence],
        );
      }
    }
  }

  if (command.type === "process_month_v2") {
    const monthlyEvidence = `monthly:${command.id}`;
    const runtimeEvidence = `runtime-balance:${command.id}`;
    const directorEvidence = `scenario-director:${command.id}`;
    const balanceDecision = monthlyRecord?.runtimeBalanceDecision;
    const directorDecision = monthlyRecord?.scenarioDirectorDecision;
    let approval: CausalNodeV1 | null = null;
    let directorRanking: CausalNodeV1 | null = null;
    if (balanceDecision && balanceDecision.evaluatedCandidateCount > 0) {
      const approvedParameters = balanceDecision.approved
        ? approvedParameterValues(
            balanceDecision.approved.templateId,
            balanceDecision.approved.templateVersion,
            balanceDecision.approved.parameters,
            [runtimeEvidence, monthlyEvidence],
          )
        : [];
      const opportunity = addNode(
        graph,
        nodeFor(
          transition,
          "event_opportunity",
          monthlyEvidence,
          unique([monthlyEvidence, runtimeEvidence, ...evidence]),
          tags,
          [],
        ),
      );
      if (balanceDecision.status === "approved") {
        approval = addNode(
          graph,
          nodeFor(
            transition,
            "event_approval",
            runtimeEvidence,
            unique([runtimeEvidence, monthlyEvidence, ...evidence]),
            tags,
            approvedParameters,
          ),
        );
        addLink(
          graph,
          opportunity,
          approval,
          "causal_opportunity_reached_controller",
          [monthlyEvidence, runtimeEvidence],
        );
      }
    } else if (!balanceDecision) {
      missingEvidence.push(Object.freeze({
        code: "runtime_balance_decision_absent",
        fromRevision: after.revision,
        toRevision: after.revision,
        sourceEvidenceIds: Object.freeze([monthlyEvidence]),
      }));
    }
    if (directorDecision) {
      directorRanking = addNode(
        graph,
        nodeFor(
          transition,
          "director_ranking",
          directorEvidence,
          unique([directorEvidence, monthlyEvidence, ...evidence]),
          tags,
          [],
        ),
      );
      if (approval) {
        addLink(
          graph,
          directorRanking,
          approval,
          "ranking_order_shaped_controller_review",
          [directorEvidence],
        );
      }
    } else {
      missingEvidence.push(Object.freeze({
        code: "scenario_director_decision_absent",
        fromRevision: after.revision,
        toRevision: after.revision,
        sourceEvidenceIds: Object.freeze([monthlyEvidence]),
      }));
    }
    if (approval && balanceDecision?.status === "approved" && monthlyRecord?.scheduledEvent) {
      const eventEvidence = `event:${monthlyRecord.scheduledEvent.eventId}`;
      const event = addNode(
        graph,
        nodeFor(
          transition,
          "event",
          eventEvidence,
          unique([eventEvidence, runtimeEvidence, ...evidence]),
          tags,
          approvedParameterValues(
            monthlyRecord.scheduledEvent.templateId,
            monthlyRecord.scheduledEvent.templateVersion,
            monthlyRecord.scheduledEvent.parameters,
            [eventEvidence, runtimeEvidence],
          ),
        ),
      );
      addLink(
        graph,
        approval,
        event,
        "controller_approved_queued_event",
        [runtimeEvidence, eventEvidence],
      );
    }
    // Director ranking consumes this transition's verified post-finance risk.
    // The stored ranking currently proves aggregate weakness relevance, not
    // which exact Risk v1 metric supplied it. No metric-to-ranking edge is
    // emitted until that per-metric contribution is part of the decision.
    void directorRanking;

    if (financial) {
      const allocationTransaction = ledgerTransactions.find(
        (transaction) =>
          transaction.commandId === command.id &&
          transaction.reasonCode === "monthly_after_tax_strategy_v2" &&
          transaction.category === "allocation.after_tax_strategy" &&
          monthlyRecord?.recurringAllocations !== null,
      );
      const activePolicy = [...graph.nodes]
        .reverse()
        .find(
          (node) =>
            node.kind === "policy_change" &&
            node.resultingRevision < transition.row.resultingRevision,
        );
      if (activePolicy && allocationTransaction) {
        addLink(
          graph,
          activePolicy,
          financial,
          "policy_shaped_monthly_allocation",
          [
            activePolicy.sourceEvidenceIds[0]!,
            `ledger:${allocationTransaction.id}`,
          ],
        );
      }

      const responseFlowEvidence = new Map<CausalNodeV1, string[]>();
      for (const transaction of ledgerTransactions) {
        const flowId =
          transaction.commandId === command.id &&
          transaction.causalReference?.kind === "system"
            ? transaction.causalReference.id
            : null;
        if (!flowId) continue;
        const resolved = [...before.gameplay.eventLifecycle.history]
          .reverse()
          .find(({ scheduledCashFlows }) =>
            scheduledCashFlows?.some(({ id }) => id === flowId),
          );
        if (!resolved) continue;
        const responseEvidence = `event-response:${resolved.eventId}:${resolved.commandId}`;
        const response = graph.nodes.find(
          (node) =>
            node.kind === "response" &&
            node.sourceEvidenceIds[0] === responseEvidence,
        );
        if (!response) continue;
        const ledgerId = `ledger:${transaction.id}`;
        responseFlowEvidence.set(response, [
          ...(responseFlowEvidence.get(response) ?? []),
          ledgerId,
        ]);
      }
      for (const [response, flowLedgerEvidence] of responseFlowEvidence) {
        addLink(
          graph,
          response,
          financial,
          "scheduled_flow_applied_by_financial_engine",
          [response.sourceEvidenceIds[0]!, ...flowLedgerEvidence],
        );
      }

      const fundingConsequence =
        (monthlyRecord?.funding?.grossLiquidationCents ?? 0) > 0 ||
        (monthlyRecord?.funding?.creditDrawnCents ?? 0) > 0 ||
        (monthlyRecord?.fundingPlan?.residualShortfallCents ?? 0) > 0;
      const priorLiquidityRisk = [...graph.nodes]
        .reverse()
        .find(
          (node) =>
            node.kind === "risk_change" &&
            node.resultingRevision < transition.row.resultingRevision &&
            node.affectedValues.some(
              ({ metricId }) => metricId === "liquid_resource_coverage",
            ),
        );
      if (
        fundingConsequence &&
        priorLiquidityRisk &&
        (beforeRisk.metrics.liquid_resource_coverage.band === "high" ||
          beforeRisk.metrics.liquid_resource_coverage.band === "severe")
      ) {
        addLink(
          graph,
          priorLiquidityRisk,
          financial,
          "liquidity_limited_recovery",
          [priorLiquidityRisk.sourceEvidenceIds[0]!, monthlyEvidence],
        );
      }
    }
  }

  const riskValues = [
    affectedValue(
      "liquid_resource_coverage",
      "months_ppm",
      beforeRisk.metrics.liquid_resource_coverage.normalizedInput,
      afterRisk.metrics.liquid_resource_coverage.normalizedInput,
      [`risk:${after.currentMonth}:${command.id}`, afterEvidence],
    ),
    affectedValue(
      "high_interest_debt_burden",
      "ratio_ppm",
      beforeRisk.metrics.high_interest_debt_burden.normalizedInput,
      afterRisk.metrics.high_interest_debt_burden.normalizedInput,
      [`risk:${after.currentMonth}:${command.id}`, afterEvidence],
    ),
  ].filter((value): value is CausalAffectedValueV1 => value !== null);
  let riskNode: CausalNodeV1 | null = null;
  if (riskValues.length > 0) {
    const riskEvidence = `risk:${after.currentMonth}:${command.id}`;
    riskNode = addNode(
      graph,
      nodeFor(
        transition,
        "risk_change",
        riskEvidence,
        unique([riskEvidence, afterEvidence, commandEvidence]),
        tags,
        riskValues,
      ),
    );
    if (financial) {
      addLink(
        graph,
        financial,
        riskNode,
        "financial_change_updated_risk_measurement",
        [afterEvidence],
      );
    }
  }

  const beforeFiProgress = projectFinancialGoal(
    before.finances,
    before.gameplay.financialGoal,
  ).progressPpm;
  const afterFiProgress = projectFinancialGoal(
    after.finances,
    after.gameplay.financialGoal,
  ).progressPpm;
  const fiCrossedTarget =
    beforeFiProgress < 1_000_000 && afterFiProgress >= 1_000_000;
  const meaningfulFiChange =
    Math.abs(afterFiProgress - beforeFiProgress) >=
      TURNING_POINT_POLICY_V1.fiProgressMaterialChangePpm ||
    fiCrossedTarget;
  let checkpointNode: CausalNodeV1 | null = null;
  if (meaningfulFiChange) {
    checkpointNode = addNode(
      graph,
      nodeFor(
        transition,
        "checkpoint_change",
        afterEvidence,
        unique([afterEvidence, commandEvidence]),
        tags,
        [Object.freeze({
          metricId: "fi_progress",
          unit: "ratio_ppm",
          before: beforeFiProgress,
          after: afterFiProgress,
          delta: afterFiProgress - beforeFiProgress,
          factIds: unique([afterEvidence, commandEvidence]),
        })],
      ),
    );
    if (financial) {
      addLink(
        graph,
        financial,
        checkpointNode,
        "financial_change_updated_checkpoint",
        [financial.sourceEvidenceIds[0]!, afterEvidence],
      );
    }
  }

  if (before.outcome === null && after.outcome !== null) {
    const outcomeEvidence = `outcome:${after.revision}:${after.outcome.reasonCode}`;
    const outcome = addNode(
      graph,
      nodeFor(
        transition,
        "end_condition",
        outcomeEvidence,
        unique([outcomeEvidence, afterEvidence, commandEvidence]),
        tags,
        [],
      ),
    );
    if (financial && after.outcome.kind === "bankruptcy") {
      addLink(
        graph,
        financial,
        outcome,
        "shortfall_caused_bankruptcy",
        [afterEvidence],
      );
    } else if (
      checkpointNode &&
      after.outcome.kind === "financial_independence"
    ) {
      addLink(
        graph,
        checkpointNode,
        outcome,
        "fi_target_reached",
        [afterEvidence],
      );
    }
  }

  const primaryFinancialEvidence = command.type === "process_month_v2"
    ? `monthly:${command.id}`
    : (ledgerEvidence[0] ?? afterEvidence);
  compact.push(Object.freeze({
    commandId: command.id,
    expectedRevision: command.expectedRevision,
    resultingRevision: transition.row.resultingRevision,
    effectiveMonth: command.effectiveMonth,
    before: stateDigest(before, transition.beforeStateChecksum),
    after: stateDigest(after, transition.afterStateChecksum),
    financialEffects: financialEffects(transition, primaryFinancialEvidence),
    newlyResolvedMilestoneEvidenceIds: milestones,
  }));
}

export function deriveCausalHistoryFromReplayV1(
  input: VerifiedRunReplayHistoryV1,
): CausalHistoryV1 {
  const graph: GraphAccumulator = { nodes: [], links: [], nodeIds: new Set() };
  const transitions: VerifiedRunTransitionV1[] = [];
  const missingEvidence: CausalMissingEvidenceV1[] = [];
  const storedMonthlyRecords = input.storedMonthlyRecords === undefined
    ? null
    : new Map(input.storedMonthlyRecords.map((record) => [record.commandId, record]));
  const responseFromRevision = Math.max(
    input.anchor.revision,
    input.responseFromRevision ?? input.anchor.revision,
  );
  const detailedFromRevision = Math.max(
    responseFromRevision,
    input.detailFromRevision ??
      input.targetRevision - CAUSAL_HISTORY_DETAIL_COMMAND_LIMIT_V1,
  );
  if (
    responseFromRevision > input.targetRevision ||
    detailedFromRevision > input.targetRevision
  ) {
    throw new RunRepositoryError(
      "INVALID_RANGE",
      "causal history range is outside the verified replay target",
    );
  }
  const replayed = visitAcceptedCommandsV2(
    input.anchor,
    input.rows,
    input.targetRevision,
    (transition) => {
      // This check intentionally runs before detail pruning so summarized rows
      // receive the same immutable-ledger-prefix verification as visible rows.
      assertImmutableLedgerPrefixV1(transition.before, transition.after);
      if (transition.command.type === "process_month_v2" && storedMonthlyRecords) {
        const stored = storedMonthlyRecords.get(transition.command.id);
        if (
          !stored ||
          transition.monthlyRecord === null ||
          stored.processedMonth !== transition.monthlyRecord.processedMonth ||
          stored.resultingRevision !== transition.after.revision ||
          stored.taxTraceId !== transition.monthlyRecord.taxTraceId ||
          sha256Canonical(stored.record) !== stored.recordChecksum ||
          sha256Canonical(transition.monthlyRecord) !== stored.recordChecksum
        ) {
          throw new RunRepositoryError(
            "CORRUPT_STATE",
            "stored monthly record does not match production replay",
          );
        }
      }
      if (transition.row.resultingRevision > detailedFromRevision) {
        appendTransition(graph, transition, transitions, missingEvidence);
      }
    },
  );
  if (replayed.stateChecksum !== input.targetStateChecksum) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "causal replay target checksum does not match the authorized run",
    );
  }
  if (
    input.anchor.revision > 0 &&
    responseFromRevision === input.anchor.revision
  ) {
    missingEvidence.push(Object.freeze({
      code: "pre_migration_history_unavailable",
      fromRevision: input.anchor.revision,
      toRevision: input.anchor.revision,
      sourceEvidenceIds: Object.freeze([
        stateEvidenceId(
          input.anchor.state as GameStateV2,
          input.anchor.stateChecksum,
        ),
      ]),
    }));
  }
  const turningPoints = selectTurningPointsV1({
    nodes: graph.nodes,
    transitions,
  });
  const summarizedRows = input.rows.filter(
    ({ resultingRevision }) =>
      resultingRevision > responseFromRevision &&
      resultingRevision <= detailedFromRevision,
  );
  const summarizedCommandRanges = summarizedRows.length === 0
    ? Object.freeze([])
    : Object.freeze([
        Object.freeze({
          firstRevision: summarizedRows[0]!.resultingRevision,
          lastRevision: summarizedRows.at(-1)!.resultingRevision,
          commandIds: unique([
            summarizedRows[0]!.commandId,
            summarizedRows.at(-1)!.commandId,
          ]),
          aggregateMetricIds: Object.freeze(["causal_detail_pruned"]),
          sourceChecksum: sha256Canonical(summarizedRows),
        }),
      ]);
  return buildCausalHistoryV1({
    runId: input.anchor.runId,
    fromRevision: responseFromRevision,
    toRevision: input.targetRevision,
    sourceStateChecksum: replayed.stateChecksum,
    nodes: graph.nodes,
    links: graph.links,
    turningPoints,
    coverage: Object.freeze({
      beginsAtRevision: responseFromRevision,
      endsAtRevision: input.targetRevision,
      preMigrationHistoryAvailable: input.anchor.revision === 0,
      summarizedCommandRanges,
      missingEvidence: Object.freeze(missingEvidence),
    }),
  });
}

function earliestAnchor(
  snapshot: RunStateReplayAnchorV2 | undefined,
  migration: RunStateReplayAnchorV2 | undefined,
): RunStateReplayAnchorV2 {
  if (!snapshot && !migration) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "causal replay has no compatible v2 state anchor",
    );
  }
  if (!snapshot) return migration!;
  if (!migration) return snapshot;
  return snapshot.revision <= migration.revision ? snapshot : migration;
}

export async function loadCausalHistoryV1(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  range: CausalHistoryRevisionRangeV1 = {},
): Promise<CausalHistoryV1> {
  return deriveCausalHistoryFromReplayV1(
    await loadVerifiedRunReplayHistoryV1(
      db,
      secretCodec,
      runId,
      accessSecret,
      range,
    ),
  );
}

export async function loadVerifiedRunReplayHistoryV1(
  db: LifeFinanceDatabase,
  secretCodec: RunSecretCodec,
  runId: string,
  accessSecret: string,
  range: CausalHistoryRevisionRangeV1 = {},
): Promise<VerifiedRunReplayHistoryV1> {
  const authorized = await loadAuthorizedRunV2(
    db,
    secretCodec,
    runId,
    accessSecret,
  );
  const targetRevision = range.toRevision ?? authorized.revision;
  if (
    !Number.isSafeInteger(targetRevision) ||
    targetRevision < 0 ||
    targetRevision > authorized.revision
  ) {
    throw new RunRepositoryError(
      "INVALID_RANGE",
      "causal history target revision is outside the run",
    );
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
          eq(runStateSnapshots.engineVersion, authorized.engineVersion),
          lte(runStateSnapshots.revision, targetRevision),
        ),
      )
      .orderBy(asc(runStateSnapshots.revision))
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
          eq(runStateMigrations.targetEngineVersion, authorized.engineVersion),
          lte(runStateMigrations.sourceRevision, targetRevision),
        ),
      )
      .orderBy(asc(runStateMigrations.sourceRevision))
      .limit(1),
  ]);
  const anchor = earliestAnchor(snapshot, migration);
  const detailFromRevision = range.fromRevision ?? Math.max(
    anchor.revision,
    targetRevision - CAUSAL_HISTORY_DETAIL_COMMAND_LIMIT_V1,
  );
  if (
    !Number.isSafeInteger(detailFromRevision) ||
    detailFromRevision < anchor.revision ||
    detailFromRevision > targetRevision ||
    targetRevision - detailFromRevision >
      CAUSAL_HISTORY_DETAIL_COMMAND_LIMIT_V1
  ) {
    throw new RunRepositoryError(
      "INVALID_RANGE",
      "causal history range must be ordered and span at most 120 revisions",
    );
  }
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
  const storedMonthlyRecords = await db
    .select({
      commandId: monthlyTurnRecords.commandId,
      processedMonth: monthlyTurnRecords.processedMonth,
      resultingRevision: monthlyTurnRecords.resultingRevision,
      taxTraceId: monthlyTurnRecords.taxTraceId,
      recordChecksum: monthlyTurnRecords.recordChecksum,
      record: monthlyTurnRecords.record,
    })
    .from(monthlyTurnRecords)
    .where(
      and(
        eq(monthlyTurnRecords.runId, runId),
        gt(monthlyTurnRecords.resultingRevision, anchor.revision),
        lte(monthlyTurnRecords.resultingRevision, targetRevision),
      ),
    )
    .orderBy(asc(monthlyTurnRecords.resultingRevision));
  return Object.freeze({
    anchor,
    rows: Object.freeze(rows),
    targetRevision,
    targetStateChecksum:
      targetRevision === authorized.revision
        ? sha256Canonical(authorized)
        : rows.at(-1)?.resultingStateChecksum ?? anchor.stateChecksum,
    storedMonthlyRecords: Object.freeze(storedMonthlyRecords),
    responseFromRevision: range.fromRevision ?? anchor.revision,
    detailFromRevision,
  });
}
