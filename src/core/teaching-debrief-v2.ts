import {
  buildCausalExplanationFactsV1,
  renderCausalExplanationV1,
} from "./causal-explanation-v1";
import type {
  CausalHistoryV1,
  CausalRoleV1,
} from "./causal-history-v1";
import { sha256Canonical } from "./canonical";
import type { CounterfactualResultV1 } from "./counterfactual-v1";
import type { DeterministicGameOutcomeV1 } from "./game-state";
import {
  createTeachingFactPacketV2,
  type TeachingFactPacketV2,
  type TeachingFactV2,
  type TeachingFactValueV2,
} from "./teaching-facts-v2";

export type TeachingDecisionResultV2 = Readonly<{
  kind: "strong_decision" | "improvement";
  edgeId: string;
  text: string;
  sourceEvidenceIds: readonly string[];
}>;

export type VerifiedCounterfactualTeachingV2 = Readonly<{
  sourceCommandId: string;
  interventionPath: string;
  originalValue: CounterfactualResultV1["originalValue"];
  alternateValue: CounterfactualResultV1["alternateValue"];
  horizonMonths: number;
  comparedMonths: number;
  stopReason: CounterfactualResultV1["stopReason"];
  difference: CounterfactualResultV1["difference"];
  sourceEvidenceIds: readonly string[];
  resultChecksum: string;
}>;

export type TeachingDebriefInputV2 = Readonly<{
  outcome: DeterministicGameOutcomeV1;
  outcomeStateChecksum: string;
  causalHistory: CausalHistoryV1;
  counterfactuals: readonly CounterfactualResultV1[];
}>;

export type TeachingDebriefV2 = Readonly<{
  version: "teaching-debrief-v2";
  facts: TeachingFactPacketV2;
  outcome: Readonly<{
    grade: DeterministicGameOutcomeV1["grade"];
    endReason: DeterministicGameOutcomeV1["kind"];
    reasonCode: DeterministicGameOutcomeV1["reasonCode"];
    reasonCodes: DeterministicGameOutcomeV1["reasonCodes"];
    reachedMonth: DeterministicGameOutcomeV1["reachedMonth"];
    sourceId: string;
  }>;
  financialDiscipline: Readonly<{
    financialIndependence: DeterministicGameOutcomeV1["financialIndependence"];
    displayedNetWorthCents: number;
    liquidSolvency: DeterministicGameOutcomeV1["automaticLiquidSolvency"];
    retirementReadiness: DeterministicGameOutcomeV1["retirementReadiness"];
    factIds: readonly string[];
  }>;
  turningPoints: CausalHistoryV1["turningPoints"];
  turningPointStatus: "verified_selection" | "insufficient_verified_history";
  causalExplanations: readonly Readonly<{
    edgeId: string;
    role: CausalRoleV1;
    text: string;
    sourceEvidenceIds: readonly string[];
  }>[];
  strongDecisions: readonly TeachingDecisionResultV2[];
  improvements: readonly TeachingDecisionResultV2[];
  decisionAssessment: Readonly<{
    status: "verified_owner_signals" | "insufficient_verified_evidence";
    reasonCode: "turning_point_reason_supported" | "no_owner_decision_quality_signal";
  }>;
  mastery: Readonly<{
    status: "not_assessed";
    reasonCode: "encounters_and_wealth_are_not_mastery";
    sourceEvidenceIds: readonly string[];
  }>;
  counterfactuals: readonly VerifiedCounterfactualTeachingV2[];
  counterfactualStatus: Readonly<
    | { status: "verified_results"; reasonCode: "supported_requests_completed" }
    | { status: "unavailable"; reasonCode: "no_supported_request_selected" }
  >;
  recommendations: readonly Readonly<{
    text: string;
    sourceEvidenceIds: readonly string[];
  }>[];
}>;

export class TeachingDebriefV2Error extends Error {
  constructor(
    readonly code:
      | "INVALID_OUTCOME_SOURCE"
      | "INVALID_COUNTERFACTUAL"
      | "INVALID_HISTORY_BINDING",
  ) {
    super(code);
    this.name = "TeachingDebriefV2Error";
  }
}

const POSITIVE_DECISION_REASONS = new Set(["verified_recovery_completed"]);
const ADVERSE_DECISION_REASONS = new Set([
  "three_month_net_worth_reversal",
  "liquid_resource_band_worsened",
  "high_interest_debt_material_change",
  "first_forced_taxable_sale",
  "new_revolving_credit_use",
  "large_recovery_window_started",
]);

function ownerDecisionSignals(history: CausalHistoryV1): readonly TeachingDecisionResultV2[] {
  const nodes = new Map(history.nodes.map((node) => [node.id, node]));
  const turningPoints = new Map(history.turningPoints.map((point) => [point.nodeId, point]));
  return history.edges.flatMap((edge) => {
    const parent = nodes.get(edge.parentNodeId);
    const point = turningPoints.get(edge.childNodeId);
    if (
      !parent ||
      !point ||
      (parent.kind !== "decision" && parent.kind !== "policy_change") ||
      edge.role === "correlation"
    ) return [];
    const positive = point.reasonCodes.find((reason) => POSITIVE_DECISION_REASONS.has(reason));
    const adverse = point.reasonCodes.find((reason) => ADVERSE_DECISION_REASONS.has(reason));
    if (!positive && !adverse) return [];
    return [{
      kind: positive ? "strong_decision" as const : "improvement" as const,
      edgeId: edge.id,
      text: positive
        ? "This decision is linked to a verified recovery turning point."
        : "Review this decision alongside the verified adverse turning point.",
      sourceEvidenceIds: [...new Set([
        ...edge.sourceEvidenceIds,
        ...point.sourceEvidenceIds,
      ])],
    }];
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function outcomeFacts(
  input: TeachingDebriefInputV2,
  outcomeSourceId: string,
): TeachingFactPacketV2 {
  const source = {
    kind: "outcome_result" as const,
    sourceId: outcomeSourceId,
    supportingSourceIds: [outcomeSourceId],
    revision: input.causalHistory.toRevision,
    month: input.outcome.reachedMonth,
  } as const;
  const fact = (
    factId: string,
    labelId: string,
    value: TeachingFactValueV2,
    field: string,
  ): TeachingFactV2 => ({
    factId,
    labelId,
    value,
    source: { ...source, field },
  });
  return createTeachingFactPacketV2({
    asOfRevision: input.causalHistory.toRevision,
    asOfMonth: input.outcome.reachedMonth,
    facts: [
      fact("outcome.grade", "final_grade", { kind: "enum", value: input.outcome.grade }, "grade"),
      fact("outcome.fi_investable_assets_cents", "investable_assets", { kind: "money_cents", value: input.outcome.financialIndependence.investableAssetsCents }, "financialIndependence.investableAssetsCents"),
      fact("outcome.fi_target_cents", "financial_independence_target", { kind: "money_cents", value: input.outcome.financialIndependence.targetCents }, "financialIndependence.targetCents"),
      fact("outcome.fi_progress_ppm", "financial_independence_progress", { kind: "rate_ppm", value: input.outcome.financialIndependence.progressPpm }, "financialIndependence.progressPpm"),
      fact("outcome.net_worth_cents", "displayed_net_worth", { kind: "money_cents", value: input.outcome.displayedNetWorthCents }, "displayedNetWorthCents"),
      fact("outcome.required_cash_cents", "required_cash", { kind: "money_cents", value: input.outcome.automaticLiquidSolvency.requiredCashCents }, "automaticLiquidSolvency.requiredCashCents"),
      fact("outcome.automatic_liquidity_cents", "automatic_liquidity", { kind: "money_cents", value: input.outcome.automaticLiquidSolvency.automaticLiquidityCents }, "automaticLiquidSolvency.automaticLiquidityCents"),
      fact("outcome.residual_shortfall_cents", "residual_shortfall", { kind: "money_cents", value: input.outcome.automaticLiquidSolvency.residualShortfallCents }, "automaticLiquidSolvency.residualShortfallCents"),
      fact("outcome.is_solvent", "liquid_solvency", { kind: "boolean", value: input.outcome.automaticLiquidSolvency.isSolvent }, "automaticLiquidSolvency.isSolvent"),
      fact("outcome.current_age_years", "current_age", { kind: "years", value: input.outcome.retirementReadiness.currentAgeYears }, "retirementReadiness.currentAgeYears"),
      fact("outcome.retirement_age_years", "retirement_age", { kind: "years", value: input.outcome.retirementReadiness.retirementAgeYears }, "retirementReadiness.retirementAgeYears"),
      fact("outcome.retirement_grade", "retirement_readiness_grade", { kind: "enum", value: input.outcome.retirementReadiness.gradeIfRetiredNow }, "retirementReadiness.gradeIfRetiredNow"),
    ],
  });
}

function verifyCounterfactual(
  result: CounterfactualResultV1,
  history: CausalHistoryV1,
): VerifiedCounterfactualTeachingV2 {
  const { resultChecksum, ...checksumInput } = result;
  const sourceEvidenceId = `command:${result.sourceCommandId}`;
  if (
    sha256Canonical(checksumInput) !== resultChecksum ||
    result.changedPaths.length !== 1 ||
    result.lastComparableRevision > history.toRevision ||
    !history.nodes.some(({ sourceEvidenceIds }) =>
      sourceEvidenceIds.includes(sourceEvidenceId),
    )
  ) {
    throw new TeachingDebriefV2Error("INVALID_COUNTERFACTUAL");
  }
  return {
    sourceCommandId: result.sourceCommandId,
    interventionPath: result.interventionPath,
    originalValue: result.originalValue,
    alternateValue: result.alternateValue,
    horizonMonths: result.requestedHorizonMonths,
    comparedMonths: result.comparedMonths,
    stopReason: result.stopReason,
    difference: { ...result.difference },
    sourceEvidenceIds: [...result.evidenceIds],
    resultChecksum,
  };
}

export function buildTeachingDebriefV2(
  input: TeachingDebriefInputV2,
): TeachingDebriefV2 {
  if (
    !/^[a-f0-9]{64}$/.test(input.outcomeStateChecksum) ||
    input.causalHistory.sourceStateChecksum !== input.outcomeStateChecksum ||
    input.counterfactuals.length > 2
  ) {
    throw new TeachingDebriefV2Error("INVALID_HISTORY_BINDING");
  }
  const explanations = renderCausalExplanationV1(
    buildCausalExplanationFactsV1(input.causalHistory, { maximumFacts: 12 }),
  );
  const outcomeNode = input.causalHistory.nodes.find(
    (node) =>
      node.kind === "end_condition" &&
      node.resultingRevision === input.causalHistory.toRevision &&
      node.month === input.outcome.reachedMonth,
  );
  const outcomeSourceId = outcomeNode?.sourceEvidenceIds.find((id) =>
    id.startsWith("outcome:"),
  );
  if (!outcomeSourceId) {
    throw new TeachingDebriefV2Error("INVALID_OUTCOME_SOURCE");
  }
  const facts = outcomeFacts(input, outcomeSourceId);
  const signals = ownerDecisionSignals(input.causalHistory);
  const strongDecisions = signals
    .filter(({ kind }) => kind === "strong_decision")
    .slice(0, 2);
  const improvements = signals
    .filter(({ kind }) => kind === "improvement")
    .slice(0, 2);
  const counterfactuals = input.counterfactuals.map((result) =>
    verifyCounterfactual(result, input.causalHistory),
  );
  const recommendationSources = improvements.length > 0
    ? improvements
    : strongDecisions.length > 0
      ? strongDecisions
      : [{ sourceEvidenceIds: [outcomeSourceId] }];
  const recommendations = recommendationSources.slice(0, 3).map((source, index) => ({
    text: improvements.length > 0
      ? "Change one verified decision at a time, then compare the bounded result."
      : strongDecisions.length > 0 && index === 0
        ? "Keep the strongest verified behavior and compare one policy change on the next run."
        : "Review the verified outcome facts and compare one supported policy change on the next run.",
    sourceEvidenceIds: [...source.sourceEvidenceIds],
  }));
  const disciplineFactIds = facts.facts.map(({ factId }) => factId);
  return deepFreeze({
    version: "teaching-debrief-v2",
    facts,
    outcome: {
      grade: input.outcome.grade,
      endReason: input.outcome.kind,
      reasonCode: input.outcome.reasonCode,
      reasonCodes: [...input.outcome.reasonCodes],
      reachedMonth: input.outcome.reachedMonth,
      sourceId: outcomeSourceId,
    },
    financialDiscipline: {
      financialIndependence: { ...input.outcome.financialIndependence },
      displayedNetWorthCents: input.outcome.displayedNetWorthCents,
      liquidSolvency: { ...input.outcome.automaticLiquidSolvency },
      retirementReadiness: { ...input.outcome.retirementReadiness },
      factIds: disciplineFactIds,
    },
    turningPoints: input.causalHistory.turningPoints.slice(0, 3).map((point) => ({
      ...point,
      reasonCodes: [...point.reasonCodes],
      sourceEvidenceIds: [...point.sourceEvidenceIds],
    })),
    turningPointStatus:
      input.causalHistory.turningPoints.length >= 2
        ? "verified_selection"
        : "insufficient_verified_history",
    causalExplanations: explanations.items.map((item) => ({
      edgeId: item.edgeId,
      role: item.role,
      text: item.text,
      sourceEvidenceIds: [...item.citedEvidenceIds],
    })),
    strongDecisions,
    improvements,
    decisionAssessment: signals.length > 0
      ? {
          status: "verified_owner_signals",
          reasonCode: "turning_point_reason_supported",
        }
      : {
          status: "insufficient_verified_evidence",
          reasonCode: "no_owner_decision_quality_signal",
        },
    mastery: {
      status: "not_assessed",
      reasonCode: "encounters_and_wealth_are_not_mastery",
      sourceEvidenceIds: [],
    },
    counterfactuals,
    counterfactualStatus: counterfactuals.length > 0
      ? { status: "verified_results", reasonCode: "supported_requests_completed" }
      : { status: "unavailable", reasonCode: "no_supported_request_selected" },
    recommendations,
  }) as TeachingDebriefV2;
}
