import { sha256Canonical } from "./canonical";
import type {
  CausalAffectedValueV1,
  CausalEdgeV1,
  CausalHistoryV1,
  CausalNodeKindV1,
  CausalRoleV1,
  CausalRuleCodeV1,
} from "./causal-history-v1";

export const CAUSAL_EXPLANATION_V1_VERSION =
  "causal-explanation-v1" as const;

export type CausalExplanationFactV1 = Readonly<{
  id: string;
  edgeId: string;
  role: CausalRoleV1;
  ruleCode: CausalRuleCodeV1;
  parentNodeId: string;
  childNodeId: string;
  parentKind: CausalNodeKindV1;
  childKind: CausalNodeKindV1;
  affectedMetricIds: readonly string[];
  affectedValues: readonly CausalAffectedValueV1[];
  sourceEvidenceIds: readonly string[];
}>;

export type CausalExplanationFactsV1 = Readonly<{
  version: typeof CAUSAL_EXPLANATION_V1_VERSION;
  historyChecksum: string;
  focusNodeId: string | null;
  facts: readonly CausalExplanationFactV1[];
  factsChecksum: string;
}>;

export type RenderedCausalExplanationItemV1 = Readonly<{
  factId: string;
  edgeId: string;
  role: CausalRoleV1;
  text: string;
  citedEvidenceIds: readonly string[];
}>;

export type RenderedCausalExplanationV1 = Readonly<{
  version: typeof CAUSAL_EXPLANATION_V1_VERSION;
  sourceFactsChecksum: string;
  items: readonly RenderedCausalExplanationItemV1[];
}>;

export class CausalExplanationV1Error extends Error {
  constructor(
    readonly code:
      | "INVALID_HISTORY_CHECKSUM"
      | "UNKNOWN_FOCUS_NODE"
      | "INVALID_FACT_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "CausalExplanationV1Error";
  }
}

const KIND_LABELS: Readonly<Record<CausalNodeKindV1, string>> = Object.freeze({
  decision: "the recorded decision",
  policy_change: "the recorded policy change",
  event_opportunity: "the verified event opportunity",
  director_ranking: "the verified scenario ranking",
  event_approval: "the Runtime Balance approval",
  event: "the recorded event",
  response: "the recorded event response",
  financial_effect: "the verified financial effect",
  risk_change: "the measured risk change",
  milestone: "the recorded life milestone",
  checkpoint_change: "the measured checkpoint change",
  recovery: "the verified recovery period",
  end_condition: "the recorded run outcome",
});

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function verifiedHistory(history: CausalHistoryV1): void {
  const { historyChecksum, ...checksumInput } = history;
  if (sha256Canonical(checksumInput) !== historyChecksum) {
    throw new CausalExplanationV1Error(
      "INVALID_HISTORY_CHECKSUM",
      "causal explanation requires an intact verified history",
    );
  }
}

function factForEdge(
  history: CausalHistoryV1,
  edge: CausalEdgeV1,
): CausalExplanationFactV1 {
  const nodes = new Map(history.nodes.map((node) => [node.id, node]));
  const parent = nodes.get(edge.parentNodeId);
  const child = nodes.get(edge.childNodeId);
  if (!parent || !child) {
    throw new CausalExplanationV1Error(
      "INVALID_HISTORY_CHECKSUM",
      "causal edge endpoint is absent from verified history",
    );
  }
  const affectedMetricIds = [
    ...new Set(
      [...parent.affectedValues, ...child.affectedValues].map(
        ({ metricId }) => metricId,
      ),
    ),
  ].sort(compareText);
  const sourceEvidenceIds = [
    ...new Set([
      ...edge.sourceEvidenceIds,
      ...parent.sourceEvidenceIds,
      ...child.sourceEvidenceIds,
    ]),
  ].sort(compareText);
  return deepFreeze({
    id: `explanation-fact:${edge.id}`,
    edgeId: edge.id,
    role: edge.role,
    ruleCode: edge.ruleCode,
    parentNodeId: parent.id,
    childNodeId: child.id,
    parentKind: parent.kind,
    childKind: child.kind,
    affectedMetricIds,
    affectedValues: child.affectedValues,
    sourceEvidenceIds,
  }) as CausalExplanationFactV1;
}

export function buildCausalExplanationFactsV1(
  history: CausalHistoryV1,
  options: Readonly<{
    focusNodeId?: string;
    maximumFacts?: number;
  }> = {},
): CausalExplanationFactsV1 {
  verifiedHistory(history);
  const maximumFacts = options.maximumFacts ?? 12;
  if (!Number.isSafeInteger(maximumFacts) || maximumFacts < 1 || maximumFacts > 24) {
    throw new CausalExplanationV1Error(
      "INVALID_FACT_LIMIT",
      "maximum facts must be an integer from 1 through 24",
    );
  }
  if (
    options.focusNodeId !== undefined &&
    !history.nodes.some(({ id }) => id === options.focusNodeId)
  ) {
    throw new CausalExplanationV1Error(
      "UNKNOWN_FOCUS_NODE",
      "focus node is absent from verified history",
    );
  }
  const facts = history.edges
    .filter(
      (edge) =>
        options.focusNodeId === undefined ||
        edge.parentNodeId === options.focusNodeId ||
        edge.childNodeId === options.focusNodeId,
    )
    .slice(0, maximumFacts)
    .map((edge) => factForEdge(history, edge));
  const checksumInput = {
    version: CAUSAL_EXPLANATION_V1_VERSION,
    historyChecksum: history.historyChecksum,
    focusNodeId: options.focusNodeId ?? null,
    facts,
  };
  return deepFreeze({
    ...checksumInput,
    factsChecksum: sha256Canonical(checksumInput),
  }) as CausalExplanationFactsV1;
}

function fallbackText(fact: CausalExplanationFactV1): string {
  const parent = KIND_LABELS[fact.parentKind];
  const child = KIND_LABELS[fact.childKind];
  if (fact.role === "direct_cause") {
    return `${parent} directly led to ${child}.`;
  }
  if (fact.role === "contributing_condition") {
    return `${parent} contributed to ${child}; it did not cause the underlying incident.`;
  }
  return `${parent} and ${child} appeared in the same verified context, but the history does not establish causation.`;
}

export function renderCausalExplanationV1(
  packet: CausalExplanationFactsV1,
): RenderedCausalExplanationV1 {
  const { factsChecksum, ...checksumInput } = packet;
  if (sha256Canonical(checksumInput) !== factsChecksum) {
    throw new CausalExplanationV1Error(
      "INVALID_HISTORY_CHECKSUM",
      "causal explanation facts were modified after verification",
    );
  }
  return deepFreeze({
    version: CAUSAL_EXPLANATION_V1_VERSION,
    sourceFactsChecksum: factsChecksum,
    items: packet.facts.map((fact) => ({
      factId: fact.id,
      edgeId: fact.edgeId,
      role: fact.role,
      text: fallbackText(fact),
      citedEvidenceIds: fact.sourceEvidenceIds,
    })),
  }) as RenderedCausalExplanationV1;
}
