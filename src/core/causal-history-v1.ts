import { sha256Canonical } from "./canonical";
import { simulationMonth, type SimulationMonth } from "./domain/month";

export const CAUSAL_HISTORY_V1_VERSION = "causal-history-v1" as const;

export const CAUSAL_NODE_KINDS_V1 = [
  "decision",
  "policy_change",
  "event_opportunity",
  "director_ranking",
  "event_approval",
  "event",
  "response",
  "financial_effect",
  "risk_change",
  "milestone",
  "checkpoint_change",
  "recovery",
  "end_condition",
] as const;

export type CausalNodeKindV1 = (typeof CAUSAL_NODE_KINDS_V1)[number];
export type CausalRoleV1 =
  | "direct_cause"
  | "contributing_condition"
  | "correlation";

export type CausalAffectedValueUnitV1 =
  | "money_cents"
  | "ratio_ppm"
  | "months_ppm"
  | "months"
  | "count"
  | "integer"
  | "boolean";

export type CausalAffectedValueV1 = Readonly<{
  metricId: string;
  unit: CausalAffectedValueUnitV1;
  before: number | null;
  after: number | null;
  delta: number | null;
  factIds: readonly string[];
}>;

export type CausalNodeV1 = Readonly<{
  id: string;
  kind: CausalNodeKindV1;
  month: SimulationMonth;
  resultingRevision: number;
  sourceEvidenceIds: readonly string[];
  lessonTags: readonly string[];
  affectedValues: readonly CausalAffectedValueV1[];
}>;

export const CAUSAL_RULE_CODES_V1 = [
  "decision_applied_financial_transaction",
  "policy_command_changed_strategy",
  "policy_shaped_monthly_allocation",
  "milestone_resolution_applied",
  "causal_opportunity_reached_controller",
  "ranking_order_shaped_controller_review",
  "risk_relevance_shaped_ranking",
  "shared_sector_exposure_correlation",
  "controller_approved_queued_event",
  "event_presented_response_context",
  "event_response_declared_effect",
  "scheduled_flow_applied_by_financial_engine",
  "market_step_applied_revaluation",
  "financial_change_updated_risk_measurement",
  "financial_change_updated_checkpoint",
  "liquidity_limited_recovery",
  "coverage_gap_increased_uncovered_impact",
  "shortfall_caused_bankruptcy",
  "liquidity_exhaustion_contributed_bankruptcy",
  "fi_target_reached",
  "retirement_age_reached",
] as const;

export type CausalRuleCodeV1 = (typeof CAUSAL_RULE_CODES_V1)[number];

export type CausalEdgeV1 = Readonly<{
  id: string;
  parentNodeId: string;
  childNodeId: string;
  role: CausalRoleV1;
  ruleCode: CausalRuleCodeV1;
  sourceEvidenceIds: readonly string[];
}>;

export type CausalTurningPointSignatureV1 =
  | "net_worth_reversal"
  | "liquidity_drop"
  | "high_interest_debt"
  | "forced_sale"
  | "new_revolving_credit"
  | "fi_progress"
  | "recovery_start"
  | "recovery"
  | "life_milestone"
  | "terminal_outcome";

export type CausalTurningPointReasonV1 =
  | "three_month_net_worth_reversal"
  | "liquid_resource_band_worsened"
  | "high_interest_debt_material_change"
  | "first_forced_taxable_sale"
  | "new_revolving_credit_use"
  | "fi_progress_material_change"
  | "large_recovery_window_started"
  | "verified_recovery_completed"
  | "milestone_with_financial_effect"
  | "terminal_outcome_reached";

export type CausalTurningPointV1 = Readonly<{
  version: "turning-points-v1";
  nodeId: string;
  primarySignature: CausalTurningPointSignatureV1;
  resultingRevision: number;
  month: SimulationMonth;
  score: number;
  reasonCodes: readonly CausalTurningPointReasonV1[];
  sourceEvidenceIds: readonly string[];
}>;

export type CausalMissingEvidenceCodeV1 =
  | "pre_migration_history_unavailable"
  | "stable_source_id_absent"
  | "monthly_record_absent"
  | "runtime_balance_decision_absent"
  | "scenario_director_decision_absent"
  | "risk_snapshot_unavailable"
  | "event_response_evidence_absent"
  | "ledger_provenance_absent";

export type CausalMissingEvidenceV1 = Readonly<{
  code: CausalMissingEvidenceCodeV1;
  fromRevision: number;
  toRevision: number;
  sourceEvidenceIds: readonly string[];
}>;

export type CausalSummarizedCommandRangeV1 = Readonly<{
  firstRevision: number;
  lastRevision: number;
  commandIds: readonly string[];
  aggregateMetricIds: readonly string[];
  sourceChecksum: string;
}>;

export type CausalHistoryCoverageV1 = Readonly<{
  beginsAtRevision: number;
  endsAtRevision: number;
  preMigrationHistoryAvailable: boolean;
  summarizedCommandRanges: readonly CausalSummarizedCommandRangeV1[];
  missingEvidence: readonly CausalMissingEvidenceV1[];
}>;

export type CausalHistoryV1 = Readonly<{
  version: typeof CAUSAL_HISTORY_V1_VERSION;
  runId: string;
  fromRevision: number;
  toRevision: number;
  sourceStateChecksum: string;
  historyChecksum: string;
  nodes: readonly CausalNodeV1[];
  edges: readonly CausalEdgeV1[];
  turningPoints: readonly CausalTurningPointV1[];
  coverage: CausalHistoryCoverageV1;
}>;

export type CausalHistoryLinkInputV1 = Readonly<{
  parentNodeId: string;
  childNodeId: string;
  ruleCode: CausalRuleCodeV1;
  sourceEvidenceIds: readonly string[];
}>;

export type CausalHistoryBuildInputV1 = Readonly<{
  runId: string;
  fromRevision: number;
  toRevision: number;
  sourceStateChecksum: string;
  nodes: readonly CausalNodeV1[];
  links: readonly CausalHistoryLinkInputV1[];
  turningPoints: readonly CausalTurningPointV1[];
  coverage: CausalHistoryCoverageV1;
}>;

export type CausalHistoryV1ErrorCode =
  | "INVALID_HISTORY_RANGE"
  | "INVALID_SOURCE_CHECKSUM"
  | "INVALID_NODE"
  | "INVALID_NODE_ID"
  | "INVALID_SOURCE_EVIDENCE"
  | "INVALID_AFFECTED_VALUE"
  | "DUPLICATE_NODE"
  | "UNKNOWN_NODE"
  | "UNKNOWN_RULE"
  | "RULE_KIND_MISMATCH"
  | "INVALID_EDGE_EVIDENCE"
  | "DUPLICATE_EDGE"
  | "FORWARD_CAUSE"
  | "CAUSAL_CYCLE"
  | "INVALID_COVERAGE"
  | "INVALID_TURNING_POINT";

export class CausalHistoryV1Error extends Error {
  constructor(
    readonly code: CausalHistoryV1ErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "CausalHistoryV1Error";
  }
}

type CausalRuleDefinitionV1 = Readonly<{
  role: CausalRoleV1;
  parentKinds: readonly CausalNodeKindV1[];
  childKinds: readonly CausalNodeKindV1[];
}>;

export const CAUSAL_RULES_V1 = Object.freeze({
  decision_applied_financial_transaction: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["decision"],
    childKinds: ["financial_effect"],
  }),
  policy_command_changed_strategy: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["decision"],
    childKinds: ["policy_change"],
  }),
  policy_shaped_monthly_allocation: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["policy_change"],
    childKinds: ["financial_effect"],
  }),
  milestone_resolution_applied: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["milestone"],
    childKinds: ["financial_effect"],
  }),
  causal_opportunity_reached_controller: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["event_opportunity"],
    childKinds: ["event_approval"],
  }),
  ranking_order_shaped_controller_review: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["director_ranking"],
    childKinds: ["event_approval"],
  }),
  risk_relevance_shaped_ranking: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["risk_change"],
    childKinds: ["director_ranking"],
  }),
  shared_sector_exposure_correlation: Object.freeze<CausalRuleDefinitionV1>({
    role: "correlation",
    parentKinds: ["risk_change"],
    childKinds: ["risk_change"],
  }),
  controller_approved_queued_event: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["event_approval"],
    childKinds: ["event"],
  }),
  event_presented_response_context: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["event"],
    childKinds: ["response"],
  }),
  event_response_declared_effect: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["response"],
    childKinds: ["financial_effect", "recovery"],
  }),
  scheduled_flow_applied_by_financial_engine: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["response", "financial_effect"],
    childKinds: ["financial_effect"],
  }),
  market_step_applied_revaluation: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["financial_effect"],
    childKinds: ["financial_effect"],
  }),
  financial_change_updated_risk_measurement: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["financial_effect"],
    childKinds: ["risk_change"],
  }),
  financial_change_updated_checkpoint: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["financial_effect"],
    childKinds: ["checkpoint_change"],
  }),
  liquidity_limited_recovery: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["risk_change"],
    childKinds: ["financial_effect", "recovery"],
  }),
  coverage_gap_increased_uncovered_impact: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["risk_change"],
    childKinds: ["financial_effect"],
  }),
  shortfall_caused_bankruptcy: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["financial_effect"],
    childKinds: ["end_condition"],
  }),
  liquidity_exhaustion_contributed_bankruptcy: Object.freeze<CausalRuleDefinitionV1>({
    role: "contributing_condition",
    parentKinds: ["financial_effect", "risk_change"],
    childKinds: ["end_condition"],
  }),
  fi_target_reached: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["risk_change", "checkpoint_change"],
    childKinds: ["end_condition"],
  }),
  retirement_age_reached: Object.freeze<CausalRuleDefinitionV1>({
    role: "direct_cause",
    parentKinds: ["checkpoint_change"],
    childKinds: ["end_condition"],
  }),
} satisfies Record<CausalRuleCodeV1, CausalRuleDefinitionV1>);

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;
const CHECKSUM = /^[a-f0-9]{64}$/;
const SOURCE_EVIDENCE = [
  /^command:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^state:\d+:[a-f0-9]{64}$/,
  /^monthly:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^tax:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^ledger:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^event:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^event-response:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^runtime-balance:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^scenario-director:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^milestone:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^risk:\d{4}-(?:0[1-9]|1[0-2]):[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
  /^outcome:\d+:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/,
] as const;
const NODE_PRIMARY_SOURCE_PREFIXES: Readonly<
  Record<CausalNodeKindV1, readonly string[]>
> = Object.freeze({
  decision: ["command:"],
  policy_change: ["command:"],
  event_opportunity: ["monthly:", "runtime-balance:"],
  director_ranking: ["scenario-director:"],
  event_approval: ["runtime-balance:"],
  event: ["event:"],
  response: ["event-response:"],
  financial_effect: ["ledger:", "monthly:"],
  risk_change: ["risk:"],
  milestone: ["milestone:"],
  checkpoint_change: ["command:", "state:"],
  recovery: ["runtime-balance:"],
  end_condition: ["outcome:"],
});
const AFFECTED_UNITS = new Set<CausalAffectedValueUnitV1>([
  "money_cents",
  "ratio_ppm",
  "months_ppm",
  "months",
  "count",
  "integer",
  "boolean",
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(
  values: readonly string[],
  path: string,
  validator: (value: string) => boolean,
  code: CausalHistoryV1ErrorCode,
): readonly string[] {
  if (values.length === 0) {
    throw new CausalHistoryV1Error(code, path, "must not be empty");
  }
  const result = [...new Set(values)].sort(compareText);
  if (result.length !== values.length || result.some((value) => !validator(value))) {
    throw new CausalHistoryV1Error(
      code,
      path,
      "must contain unique stable structured identifiers",
    );
  }
  return Object.freeze(result);
}

export function isCausalSourceEvidenceIdV1(value: string): boolean {
  return SOURCE_EVIDENCE.some((pattern) => pattern.test(value));
}

function validateAffectedValue(
  value: CausalAffectedValueV1,
  path: string,
): CausalAffectedValueV1 {
  if (!IDENTIFIER.test(value.metricId) || !AFFECTED_UNITS.has(value.unit)) {
    throw new CausalHistoryV1Error(
      "INVALID_AFFECTED_VALUE",
      path,
      "metric and unit must be allow-listed structured identifiers",
    );
  }
  for (const [key, amount] of Object.entries({
    before: value.before,
    after: value.after,
    delta: value.delta,
  })) {
    if (amount !== null && !Number.isSafeInteger(amount)) {
      throw new CausalHistoryV1Error(
        "INVALID_AFFECTED_VALUE",
        `${path}.${key}`,
        "must be a safe integer or null",
      );
    }
  }
  if (value.before === null || value.after === null) {
    if (value.delta !== null) {
      throw new CausalHistoryV1Error(
        "INVALID_AFFECTED_VALUE",
        `${path}.delta`,
        "must be null when either endpoint is unavailable",
      );
    }
  } else if (
    !Number.isSafeInteger(value.after - value.before) ||
    value.delta !== value.after - value.before
  ) {
    throw new CausalHistoryV1Error(
      "INVALID_AFFECTED_VALUE",
      `${path}.delta`,
      "must exactly equal after minus before",
    );
  }
  const factIds = uniqueSorted(
    value.factIds,
    `${path}.factIds`,
    (factId) => IDENTIFIER.test(factId) || isCausalSourceEvidenceIdV1(factId),
    "INVALID_AFFECTED_VALUE",
  );
  return Object.freeze({ ...value, factIds });
}

export type CausalNodeInputV1 = Readonly<{
  kind: CausalNodeKindV1;
  primarySourceEvidenceId: string;
  month: SimulationMonth;
  resultingRevision: number;
  sourceEvidenceIds: readonly string[];
  lessonTags: readonly string[];
  affectedValues: readonly CausalAffectedValueV1[];
}>;

export function causalNodeIdV1(
  kind: CausalNodeKindV1,
  primarySourceEvidenceId: string,
): string {
  return `node:${kind}:${primarySourceEvidenceId}`;
}

export function causalNodeV1(input: CausalNodeInputV1): CausalNodeV1 {
  if (!CAUSAL_NODE_KINDS_V1.includes(input.kind)) {
    throw new CausalHistoryV1Error("INVALID_NODE", "kind", "is unsupported");
  }
  try {
    simulationMonth(input.month);
  } catch (error) {
    throw new CausalHistoryV1Error(
      "INVALID_NODE",
      "month",
      error instanceof Error ? error.message : "is invalid",
    );
  }
  if (!Number.isSafeInteger(input.resultingRevision) || input.resultingRevision < 0) {
    throw new CausalHistoryV1Error(
      "INVALID_NODE",
      "resultingRevision",
      "must be a non-negative safe integer",
    );
  }
  if (!isCausalSourceEvidenceIdV1(input.primarySourceEvidenceId)) {
    throw new CausalHistoryV1Error(
      "INVALID_SOURCE_EVIDENCE",
      "primarySourceEvidenceId",
      "must use a stable source namespace",
    );
  }
  if (
    !NODE_PRIMARY_SOURCE_PREFIXES[input.kind].some((prefix) =>
      input.primarySourceEvidenceId.startsWith(prefix)
    )
  ) {
    throw new CausalHistoryV1Error(
      "INVALID_SOURCE_EVIDENCE",
      "primarySourceEvidenceId",
      `is not authoritative for node kind ${input.kind}`,
    );
  }
  const allEvidenceIds = uniqueSorted(
    input.sourceEvidenceIds,
    "sourceEvidenceIds",
    isCausalSourceEvidenceIdV1,
    "INVALID_SOURCE_EVIDENCE",
  );
  if (!allEvidenceIds.includes(input.primarySourceEvidenceId)) {
    throw new CausalHistoryV1Error(
      "INVALID_SOURCE_EVIDENCE",
      "sourceEvidenceIds",
      "must contain the primary evidence identifier",
    );
  }
  const sourceEvidenceIds = Object.freeze([
    input.primarySourceEvidenceId,
    ...allEvidenceIds.filter((id) => id !== input.primarySourceEvidenceId),
  ]);
  const lessonTags = input.lessonTags.length === 0
    ? Object.freeze([] as string[])
    : uniqueSorted(
        input.lessonTags,
        "lessonTags",
        (tag) => IDENTIFIER.test(tag),
        "INVALID_NODE",
      );
  const affectedValues = Object.freeze(
    input.affectedValues
      .map((value, index) => validateAffectedValue(value, `affectedValues.${index}`))
      .sort((left, right) =>
        compareText(left.metricId, right.metricId) || compareText(left.unit, right.unit)
      ),
  );
  const node = {
    id: causalNodeIdV1(input.kind, input.primarySourceEvidenceId),
    kind: input.kind,
    month: input.month,
    resultingRevision: input.resultingRevision,
    sourceEvidenceIds,
    lessonTags,
    affectedValues,
  } satisfies CausalNodeV1;
  return deepFreeze(node) as CausalNodeV1;
}

export function causalEdgeIdV1(
  ruleCode: CausalRuleCodeV1,
  parentNodeId: string,
  childNodeId: string,
): string {
  return `edge:${ruleCode}:${parentNodeId}:${childNodeId}`;
}

function normalizedNode(node: CausalNodeV1, path: string): CausalNodeV1 {
  const primarySourceEvidenceId = node.sourceEvidenceIds[0];
  if (!primarySourceEvidenceId) {
    throw new CausalHistoryV1Error(
      "INVALID_SOURCE_EVIDENCE",
      `${path}.sourceEvidenceIds`,
      "must not be empty",
    );
  }
  const normalized = causalNodeV1({
    kind: node.kind,
    primarySourceEvidenceId,
    month: node.month,
    resultingRevision: node.resultingRevision,
    sourceEvidenceIds: node.sourceEvidenceIds,
    lessonTags: node.lessonTags,
    affectedValues: node.affectedValues,
  });
  if (normalized.id !== node.id) {
    throw new CausalHistoryV1Error(
      "INVALID_NODE_ID",
      `${path}.id`,
      "must derive from kind and primary source evidence",
    );
  }
  return normalized;
}

function normalizedCoverage(
  coverage: CausalHistoryCoverageV1,
  fromRevision: number,
  toRevision: number,
): CausalHistoryCoverageV1 {
  if (
    !Number.isSafeInteger(coverage.beginsAtRevision) ||
    !Number.isSafeInteger(coverage.endsAtRevision) ||
    coverage.beginsAtRevision < fromRevision ||
    coverage.endsAtRevision > toRevision ||
    coverage.beginsAtRevision > coverage.endsAtRevision
  ) {
    throw new CausalHistoryV1Error(
      "INVALID_COVERAGE",
      "coverage",
      "must be a valid sub-range of the requested revisions",
    );
  }
  const missingEvidence = coverage.missingEvidence.map((missing, index) => {
    if (
      !Number.isSafeInteger(missing.fromRevision) ||
      !Number.isSafeInteger(missing.toRevision) ||
      missing.fromRevision < coverage.beginsAtRevision ||
      missing.toRevision > coverage.endsAtRevision ||
      missing.fromRevision > missing.toRevision
    ) {
      throw new CausalHistoryV1Error(
        "INVALID_COVERAGE",
        `coverage.missingEvidence.${index}`,
        "must be within the coverage range",
      );
    }
    const sourceEvidenceIds = missing.sourceEvidenceIds.length === 0
      ? Object.freeze([] as string[])
      : uniqueSorted(
          missing.sourceEvidenceIds,
          `coverage.missingEvidence.${index}.sourceEvidenceIds`,
          isCausalSourceEvidenceIdV1,
          "INVALID_COVERAGE",
        );
    return Object.freeze({ ...missing, sourceEvidenceIds });
  }).sort((left, right) =>
    left.fromRevision - right.fromRevision ||
    left.toRevision - right.toRevision ||
    compareText(left.code, right.code)
  );
  const summarizedCommandRanges = coverage.summarizedCommandRanges.map(
    (range, index) => {
      if (
        !Number.isSafeInteger(range.firstRevision) ||
        !Number.isSafeInteger(range.lastRevision) ||
        range.firstRevision < coverage.beginsAtRevision ||
        range.lastRevision > coverage.endsAtRevision ||
        range.firstRevision > range.lastRevision ||
        !CHECKSUM.test(range.sourceChecksum)
      ) {
        throw new CausalHistoryV1Error(
          "INVALID_COVERAGE",
          `coverage.summarizedCommandRanges.${index}`,
          "contains an invalid range or checksum",
        );
      }
      return Object.freeze({
        ...range,
        commandIds: uniqueSorted(
          range.commandIds,
          `coverage.summarizedCommandRanges.${index}.commandIds`,
          (id) => IDENTIFIER.test(id),
          "INVALID_COVERAGE",
        ),
        aggregateMetricIds: uniqueSorted(
          range.aggregateMetricIds,
          `coverage.summarizedCommandRanges.${index}.aggregateMetricIds`,
          (id) => IDENTIFIER.test(id),
          "INVALID_COVERAGE",
        ),
      });
    },
  ).sort((left, right) => left.firstRevision - right.firstRevision);
  return deepFreeze({
    ...coverage,
    missingEvidence,
    summarizedCommandRanges,
  }) as CausalHistoryCoverageV1;
}

function assertAcyclic(
  nodes: readonly CausalNodeV1[],
  edges: readonly CausalEdgeV1[],
): void {
  const children = new Map<string, string[]>();
  for (const node of nodes) children.set(node.id, []);
  for (const edge of edges) children.get(edge.parentNodeId)!.push(edge.childNodeId);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      throw new CausalHistoryV1Error(
        "CAUSAL_CYCLE",
        "edges",
        `cycle includes ${nodeId}`,
      );
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const childId of children.get(nodeId) ?? []) visit(childId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);
}

function normalizeTurningPoints(
  turningPoints: readonly CausalTurningPointV1[],
  nodesById: ReadonlyMap<string, CausalNodeV1>,
): readonly CausalTurningPointV1[] {
  const seen = new Set<string>();
  const normalized = turningPoints.map((turningPoint, index) => {
    const node = nodesById.get(turningPoint.nodeId);
    if (
      turningPoint.version !== "turning-points-v1" ||
      !node ||
      turningPoint.resultingRevision !== node.resultingRevision ||
      turningPoint.month !== node.month ||
      !Number.isSafeInteger(turningPoint.score) ||
      turningPoint.score < 0 ||
      seen.has(turningPoint.nodeId)
    ) {
      throw new CausalHistoryV1Error(
        "INVALID_TURNING_POINT",
        `turningPoints.${index}`,
        "must reference one unique graph node with matching time and safe score",
      );
    }
    seen.add(turningPoint.nodeId);
    const sourceEvidenceIds = uniqueSorted(
      turningPoint.sourceEvidenceIds,
      `turningPoints.${index}.sourceEvidenceIds`,
      isCausalSourceEvidenceIdV1,
      "INVALID_TURNING_POINT",
    );
    if (sourceEvidenceIds.some((id) => !node.sourceEvidenceIds.includes(id))) {
      throw new CausalHistoryV1Error(
        "INVALID_TURNING_POINT",
        `turningPoints.${index}.sourceEvidenceIds`,
        "must be present on the referenced graph node",
      );
    }
    return deepFreeze({ ...turningPoint, sourceEvidenceIds }) as CausalTurningPointV1;
  });
  return Object.freeze(normalized);
}

export function buildCausalHistoryV1(
  input: CausalHistoryBuildInputV1,
): CausalHistoryV1 {
  if (
    !IDENTIFIER.test(input.runId) ||
    !Number.isSafeInteger(input.fromRevision) ||
    !Number.isSafeInteger(input.toRevision) ||
    input.fromRevision < 0 ||
    input.fromRevision > input.toRevision
  ) {
    throw new CausalHistoryV1Error(
      "INVALID_HISTORY_RANGE",
      "history",
      "requires a stable run ID and ordered non-negative revisions",
    );
  }
  if (!CHECKSUM.test(input.sourceStateChecksum)) {
    throw new CausalHistoryV1Error(
      "INVALID_SOURCE_CHECKSUM",
      "sourceStateChecksum",
      "must be a canonical SHA-256 checksum",
    );
  }
  const coverage = normalizedCoverage(
    input.coverage,
    input.fromRevision,
    input.toRevision,
  );
  const nodes = input.nodes.map((item, index) => normalizedNode(item, `nodes.${index}`));
  const nodesById = new Map<string, CausalNodeV1>();
  for (const item of nodes) {
    if (nodesById.has(item.id)) {
      throw new CausalHistoryV1Error(
        "DUPLICATE_NODE",
        "nodes",
        `duplicate node ${item.id}`,
      );
    }
    if (
      item.resultingRevision < coverage.beginsAtRevision ||
      item.resultingRevision > coverage.endsAtRevision
    ) {
      throw new CausalHistoryV1Error(
        "INVALID_NODE",
        item.id,
        "revision is outside verified causal coverage",
      );
    }
    nodesById.set(item.id, item);
  }
  nodes.sort((left, right) =>
    left.resultingRevision - right.resultingRevision ||
    compareText(left.month, right.month) ||
    compareText(left.kind, right.kind) ||
    compareText(left.id, right.id)
  );

  const edgeIds = new Set<string>();
  const edges = input.links.map((link, index) => {
    const parent = nodesById.get(link.parentNodeId);
    const child = nodesById.get(link.childNodeId);
    if (!parent || !child) {
      throw new CausalHistoryV1Error(
        "UNKNOWN_NODE",
        `links.${index}`,
        "must reference existing parent and child nodes",
      );
    }
    const rule: CausalRuleDefinitionV1 | undefined = (
      CAUSAL_RULES_V1 as Readonly<Record<string, CausalRuleDefinitionV1>>
    )[link.ruleCode];
    if (!rule) {
      throw new CausalHistoryV1Error(
        "UNKNOWN_RULE",
        `links.${index}.ruleCode`,
        "is not in the closed causal rule table",
      );
    }
    if (
      !rule.parentKinds.includes(parent.kind) ||
      !rule.childKinds.includes(child.kind)
    ) {
      throw new CausalHistoryV1Error(
        "RULE_KIND_MISMATCH",
        `links.${index}`,
        `${link.ruleCode} cannot connect ${parent.kind} to ${child.kind}`,
      );
    }
    if (parent.resultingRevision > child.resultingRevision) {
      throw new CausalHistoryV1Error(
        "FORWARD_CAUSE",
        `links.${index}`,
        "a cause cannot occur after its consequence",
      );
    }
    const sourceEvidenceIds = uniqueSorted(
      link.sourceEvidenceIds,
      `links.${index}.sourceEvidenceIds`,
      isCausalSourceEvidenceIdV1,
      "INVALID_EDGE_EVIDENCE",
    );
    const endpointEvidence = new Set([
      ...parent.sourceEvidenceIds,
      ...child.sourceEvidenceIds,
    ]);
    if (sourceEvidenceIds.some((id) => !endpointEvidence.has(id))) {
      throw new CausalHistoryV1Error(
        "INVALID_EDGE_EVIDENCE",
        `links.${index}.sourceEvidenceIds`,
        "must be copied from the linked verified nodes",
      );
    }
    const id = causalEdgeIdV1(link.ruleCode, parent.id, child.id);
    if (edgeIds.has(id)) {
      throw new CausalHistoryV1Error(
        "DUPLICATE_EDGE",
        `links.${index}`,
        `duplicates ${id}`,
      );
    }
    edgeIds.add(id);
    return Object.freeze({
      id,
      parentNodeId: parent.id,
      childNodeId: child.id,
      role: rule.role,
      ruleCode: link.ruleCode,
      sourceEvidenceIds,
    }) satisfies CausalEdgeV1;
  });
  edges.sort((left, right) =>
    compareText(left.childNodeId, right.childNodeId) ||
    compareText(left.role, right.role) ||
    compareText(left.ruleCode, right.ruleCode) ||
    compareText(left.parentNodeId, right.parentNodeId)
  );
  assertAcyclic(nodes, edges);
  const turningPoints = normalizeTurningPoints(input.turningPoints, nodesById);
  const checksumInput = {
    version: CAUSAL_HISTORY_V1_VERSION,
    runId: input.runId,
    fromRevision: input.fromRevision,
    toRevision: input.toRevision,
    sourceStateChecksum: input.sourceStateChecksum,
    nodes,
    edges,
    turningPoints,
    coverage,
  };
  return deepFreeze({
    ...checksumInput,
    historyChecksum: sha256Canonical(checksumInput),
  }) as CausalHistoryV1;
}

export type CausalRecoveryDigestV1 = Readonly<{
  sourceEvidenceId: string;
  sourceTier: "large" | "catastrophe";
  remainingMonths: number;
}>;

export type CausalStateDigestV1 = Readonly<{
  stateEvidenceId: string;
  month: SimulationMonth;
  netWorthCents: number;
  liquidResourceCoveragePpm: number | null;
  liquidResourceBand: "low" | "moderate" | "high" | "severe" | "unknown";
  highInterestDebtBurdenPpm: number | null;
  fiProgressPpm: number;
  recovery: CausalRecoveryDigestV1 | null;
  outcomeReasonCode: string | null;
}>;

export type CausalFinancialEffectDigestV1 = Readonly<{
  sourceEvidenceId: string;
  forcedSaleGrossCents: number;
  newRevolvingCreditCents: number;
  residualShortfallCents: number;
}>;

/**
 * Compact, derived replay adapter input. It carries no full state and is never a
 * second persisted history authority.
 */
export type VerifiedRunTransitionV1 = Readonly<{
  commandId: string;
  expectedRevision: number;
  resultingRevision: number;
  effectiveMonth: SimulationMonth;
  before: CausalStateDigestV1;
  after: CausalStateDigestV1;
  financialEffects: readonly CausalFinancialEffectDigestV1[];
  newlyResolvedMilestoneEvidenceIds: readonly string[];
}>;
