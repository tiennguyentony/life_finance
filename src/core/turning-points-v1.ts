import {
  isCausalSourceEvidenceIdV1,
  type CausalNodeV1,
  type CausalStateDigestV1,
  type CausalTurningPointReasonV1,
  type CausalTurningPointSignatureV1,
  type CausalTurningPointV1,
  type VerifiedRunTransitionV1,
} from "./causal-history-v1";
import { monthsBetween, simulationMonth } from "./domain/month";

export const TURNING_POINTS_V1_VERSION = "turning-points-v1" as const;

export type TurningPointPolicyV1 = Readonly<{
  trendWindowMonths: number;
  sameSignatureSuppressionMonths: number;
  maximumTurningPoints: number;
  netWorthReversalMinimumCents: number;
  highInterestDebtMaterialChangePpm: number;
  fiProgressMaterialChangePpm: number;
  terminalOutcomeScore: number;
  firstForcedSaleScore: number;
  newRevolvingCreditScore: number;
  recoveryStartScore: number;
  milestoneScore: number;
  liquidityDropScore: number;
  highInterestDebtScore: number;
  netWorthReversalScore: number;
  fiProgressScore: number;
  recoveryCompleteScore: number;
}>;

export const TURNING_POINT_POLICY_V1 = Object.freeze({
  trendWindowMonths: 3,
  sameSignatureSuppressionMonths: 3,
  maximumTurningPoints: 5,
  netWorthReversalMinimumCents: 100_000,
  highInterestDebtMaterialChangePpm: 100_000,
  fiProgressMaterialChangePpm: 50_000,
  terminalOutcomeScore: 1_000,
  firstForcedSaleScore: 900,
  newRevolvingCreditScore: 850,
  recoveryStartScore: 800,
  milestoneScore: 700,
  liquidityDropScore: 675,
  highInterestDebtScore: 650,
  netWorthReversalScore: 600,
  fiProgressScore: 550,
  recoveryCompleteScore: 500,
} satisfies TurningPointPolicyV1);

export type TurningPointPolicyViolationV1 = Readonly<{
  field: keyof TurningPointPolicyV1;
  code: "invalid_bound" | "invalid_score";
}>;

export function validateTurningPointPolicyV1(
  policy: TurningPointPolicyV1,
): readonly TurningPointPolicyViolationV1[] {
  const violations: TurningPointPolicyViolationV1[] = [];
  for (const field of [
    "trendWindowMonths",
    "sameSignatureSuppressionMonths",
    "maximumTurningPoints",
    "netWorthReversalMinimumCents",
    "highInterestDebtMaterialChangePpm",
    "fiProgressMaterialChangePpm",
  ] as const) {
    const value = policy[field];
    const maximum = field === "maximumTurningPoints" ? 20 : 100_000_000;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      violations.push({ field, code: "invalid_bound" });
    }
  }
  for (const field of [
    "terminalOutcomeScore",
    "firstForcedSaleScore",
    "newRevolvingCreditScore",
    "recoveryStartScore",
    "milestoneScore",
    "liquidityDropScore",
    "highInterestDebtScore",
    "netWorthReversalScore",
    "fiProgressScore",
    "recoveryCompleteScore",
  ] as const) {
    const value = policy[field];
    if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
      violations.push({ field, code: "invalid_score" });
    }
  }
  return Object.freeze(violations);
}

const policyViolations = validateTurningPointPolicyV1(TURNING_POINT_POLICY_V1);
if (policyViolations.length > 0) {
  throw new Error(
    `Invalid Turning Point v1 policy: ${policyViolations
      .map(({ field, code }) => `${field}:${code}`)
      .join(",")}`,
  );
}

export type TurningPointSelectionInputV1 = Readonly<{
  nodes: readonly CausalNodeV1[];
  transitions: readonly VerifiedRunTransitionV1[];
}>;

export class TurningPointV1Error extends Error {
  constructor(
    readonly code: "INVALID_TRANSITION" | "DUPLICATE_TRANSITION",
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "TurningPointV1Error";
  }
}

type Candidate = Readonly<{
  node: CausalNodeV1;
  primarySignature: CausalTurningPointSignatureV1;
  score: number;
  reasonCodes: readonly CausalTurningPointReasonV1[];
}>;

const BAND_RANK: Readonly<Record<CausalStateDigestV1["liquidResourceBand"], number>> =
  Object.freeze({
    low: 0,
    moderate: 1,
    high: 2,
    severe: 3,
    unknown: -1,
  });

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSafeInteger(value: number | null, path: string): void {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new TurningPointV1Error(
      "INVALID_TRANSITION",
      path,
      "must be a safe integer or null",
    );
  }
}

function validateDigest(digest: CausalStateDigestV1, path: string): void {
  if (!isCausalSourceEvidenceIdV1(digest.stateEvidenceId)) {
    throw new TurningPointV1Error(
      "INVALID_TRANSITION",
      `${path}.stateEvidenceId`,
      "must reference a stable state source",
    );
  }
  try {
    simulationMonth(digest.month);
  } catch {
    throw new TurningPointV1Error(
      "INVALID_TRANSITION",
      `${path}.month`,
      "must be a valid simulation month",
    );
  }
  assertSafeInteger(digest.netWorthCents, `${path}.netWorthCents`);
  assertSafeInteger(
    digest.liquidResourceCoveragePpm,
    `${path}.liquidResourceCoveragePpm`,
  );
  assertSafeInteger(
    digest.highInterestDebtBurdenPpm,
    `${path}.highInterestDebtBurdenPpm`,
  );
  assertSafeInteger(digest.fiProgressPpm, `${path}.fiProgressPpm`);
  if (
    digest.outcomeReasonCode !== null &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/.test(digest.outcomeReasonCode)
  ) {
    throw new TurningPointV1Error(
      "INVALID_TRANSITION",
      `${path}.outcomeReasonCode`,
      "must be a stable reason code or null",
    );
  }
  if (
    digest.recovery !== null &&
    (!isCausalSourceEvidenceIdV1(digest.recovery.sourceEvidenceId) ||
      !Number.isSafeInteger(digest.recovery.remainingMonths) ||
      digest.recovery.remainingMonths < 0)
  ) {
    throw new TurningPointV1Error(
      "INVALID_TRANSITION",
      `${path}.recovery`,
      "must carry stable source evidence and a non-negative duration",
    );
  }
}

function normalizedTransitions(
  input: readonly VerifiedRunTransitionV1[],
): readonly VerifiedRunTransitionV1[] {
  const revisions = new Set<number>();
  const transitions = [...input].sort(
    (left, right) =>
      left.resultingRevision - right.resultingRevision ||
      compareText(left.commandId, right.commandId),
  );
  for (const [index, transition] of transitions.entries()) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/.test(transition.commandId) ||
      !Number.isSafeInteger(transition.expectedRevision) ||
      !Number.isSafeInteger(transition.resultingRevision) ||
      transition.expectedRevision < 0 ||
      transition.resultingRevision <= transition.expectedRevision
    ) {
      throw new TurningPointV1Error(
        "INVALID_TRANSITION",
        `transitions.${index}`,
        "contains an invalid command or revision envelope",
      );
    }
    if (revisions.has(transition.resultingRevision)) {
      throw new TurningPointV1Error(
        "DUPLICATE_TRANSITION",
        `transitions.${index}.resultingRevision`,
        "must be unique",
      );
    }
    revisions.add(transition.resultingRevision);
    try {
      simulationMonth(transition.effectiveMonth);
    } catch {
      throw new TurningPointV1Error(
        "INVALID_TRANSITION",
        `transitions.${index}.effectiveMonth`,
        "must be a valid simulation month",
      );
    }
    validateDigest(transition.before, `transitions.${index}.before`);
    validateDigest(transition.after, `transitions.${index}.after`);
    for (const [effectIndex, effect] of transition.financialEffects.entries()) {
      if (!isCausalSourceEvidenceIdV1(effect.sourceEvidenceId)) {
        throw new TurningPointV1Error(
          "INVALID_TRANSITION",
          `transitions.${index}.financialEffects.${effectIndex}.sourceEvidenceId`,
          "must be stable source evidence",
        );
      }
      for (const [key, amount] of Object.entries({
        forcedSaleGrossCents: effect.forcedSaleGrossCents,
        newRevolvingCreditCents: effect.newRevolvingCreditCents,
        residualShortfallCents: effect.residualShortfallCents,
      })) {
        if (!Number.isSafeInteger(amount) || amount < 0) {
          throw new TurningPointV1Error(
            "INVALID_TRANSITION",
            `transitions.${index}.financialEffects.${effectIndex}.${key}`,
            "must be a non-negative safe integer",
          );
        }
      }
    }
    if (
      transition.newlyResolvedMilestoneEvidenceIds.some(
        (evidenceId) => !isCausalSourceEvidenceIdV1(evidenceId),
      )
    ) {
      throw new TurningPointV1Error(
        "INVALID_TRANSITION",
        `transitions.${index}.newlyResolvedMilestoneEvidenceIds`,
        "must contain only stable evidence identifiers",
      );
    }
  }
  return transitions;
}

function nodesAtRevision(
  nodes: readonly CausalNodeV1[],
  resultingRevision: number,
  kind: CausalNodeV1["kind"],
): readonly CausalNodeV1[] {
  return nodes
    .filter((node) =>
      node.resultingRevision === resultingRevision && node.kind === kind
    )
    .sort((left, right) => compareText(left.id, right.id));
}

function findNode(
  nodes: readonly CausalNodeV1[],
  resultingRevision: number,
  kind: CausalNodeV1["kind"],
  sourceFragment?: string,
): CausalNodeV1 | null {
  const candidates = nodesAtRevision(nodes, resultingRevision, kind);
  if (sourceFragment) {
    const exact = candidates.find((node) =>
      node.sourceEvidenceIds.some((id) => id.includes(sourceFragment))
    );
    if (exact) return exact;
  }
  return candidates[0] ?? null;
}

function candidate(
  node: CausalNodeV1 | null,
  primarySignature: CausalTurningPointSignatureV1,
  score: number,
  reasonCode: CausalTurningPointReasonV1,
): Candidate | null {
  return node === null
    ? null
    : Object.freeze({
        node,
        primarySignature,
        score,
        reasonCodes: Object.freeze([reasonCode]),
      });
}

function collectTransitionCandidates(
  nodes: readonly CausalNodeV1[],
  transitions: readonly VerifiedRunTransitionV1[],
): Candidate[] {
  const candidates: Candidate[] = [];
  let forcedSaleSeen = false;
  const netWorthDeltas: Array<Readonly<{
    transition: VerifiedRunTransitionV1;
    delta: number;
  }>> = [];

  for (const transition of transitions) {
    const terminalStarted =
      transition.before.outcomeReasonCode === null &&
      transition.after.outcomeReasonCode !== null;
    if (terminalStarted) {
      const item = candidate(
        findNode(nodes, transition.resultingRevision, "end_condition"),
        "terminal_outcome",
        TURNING_POINT_POLICY_V1.terminalOutcomeScore,
        "terminal_outcome_reached",
      );
      if (item) candidates.push(item);
    }

    for (const effect of transition.financialEffects) {
      if (effect.forcedSaleGrossCents > 0 && !forcedSaleSeen) {
        const item = candidate(
          findNode(
            nodes,
            transition.resultingRevision,
            "financial_effect",
            effect.sourceEvidenceId,
          ),
          "forced_sale",
          TURNING_POINT_POLICY_V1.firstForcedSaleScore,
          "first_forced_taxable_sale",
        );
        if (item) candidates.push(item);
        forcedSaleSeen = true;
      }
      if (effect.newRevolvingCreditCents > 0) {
        const item = candidate(
          findNode(
            nodes,
            transition.resultingRevision,
            "financial_effect",
            effect.sourceEvidenceId,
          ),
          "new_revolving_credit",
          TURNING_POINT_POLICY_V1.newRevolvingCreditScore,
          "new_revolving_credit_use",
        );
        if (item) candidates.push(item);
      }
    }

    const beforeBand = BAND_RANK[transition.before.liquidResourceBand];
    const afterBand = BAND_RANK[transition.after.liquidResourceBand];
    if (beforeBand >= 0 && afterBand > beforeBand) {
      const item = candidate(
        findNode(
          nodes,
          transition.resultingRevision,
          "risk_change",
          "liquid_resource",
        ),
        "liquidity_drop",
        TURNING_POINT_POLICY_V1.liquidityDropScore + (afterBand - beforeBand) * 10,
        "liquid_resource_band_worsened",
      );
      if (item) candidates.push(item);
    }

    if (
      transition.before.highInterestDebtBurdenPpm !== null &&
      transition.after.highInterestDebtBurdenPpm !== null &&
      Math.abs(
        transition.after.highInterestDebtBurdenPpm -
          transition.before.highInterestDebtBurdenPpm,
      ) >= TURNING_POINT_POLICY_V1.highInterestDebtMaterialChangePpm
    ) {
      const item = candidate(
        findNode(
          nodes,
          transition.resultingRevision,
          "risk_change",
          "high_interest_debt",
        ),
        "high_interest_debt",
        TURNING_POINT_POLICY_V1.highInterestDebtScore,
        "high_interest_debt_material_change",
      );
      if (item) candidates.push(item);
    }

    if (
      Math.abs(transition.after.fiProgressPpm - transition.before.fiProgressPpm) >=
      TURNING_POINT_POLICY_V1.fiProgressMaterialChangePpm
    ) {
      const item = candidate(
        findNode(
          nodes,
          transition.resultingRevision,
          "checkpoint_change",
          "fi_progress",
        ),
        "fi_progress",
        TURNING_POINT_POLICY_V1.fiProgressScore,
        "fi_progress_material_change",
      );
      if (item) candidates.push(item);
    }

    if (
      transition.before.recovery === null &&
      transition.after.recovery !== null &&
      (transition.after.recovery.sourceTier === "large" ||
        transition.after.recovery.sourceTier === "catastrophe")
    ) {
      const item = candidate(
        findNode(
          nodes,
          transition.resultingRevision,
          "recovery",
          transition.after.recovery.sourceEvidenceId,
        ),
        "recovery_start",
        TURNING_POINT_POLICY_V1.recoveryStartScore,
        "large_recovery_window_started",
      );
      if (item) candidates.push(item);
    }

    const liquidityImproved =
      transition.before.liquidResourceCoveragePpm !== null &&
      transition.after.liquidResourceCoveragePpm !== null &&
      transition.after.liquidResourceCoveragePpm >
        transition.before.liquidResourceCoveragePpm;
    const debtImproved =
      transition.before.highInterestDebtBurdenPpm !== null &&
      transition.after.highInterestDebtBurdenPpm !== null &&
      transition.after.highInterestDebtBurdenPpm <
        transition.before.highInterestDebtBurdenPpm;
    if (
      transition.before.recovery !== null &&
      transition.after.recovery === null &&
      (liquidityImproved || debtImproved)
    ) {
      const item = candidate(
        findNode(nodes, transition.resultingRevision, "recovery"),
        "recovery",
        TURNING_POINT_POLICY_V1.recoveryCompleteScore,
        "verified_recovery_completed",
      );
      if (item) candidates.push(item);
    }

    // A trend month is an actual calendar-month advance, not an accepted
    // command. Same-month policy, event-response, and learning commands must not
    // displace or manufacture observations in the three-month window.
    if (monthsBetween(transition.before.month, transition.after.month) === 1) {
      const netWorthDelta =
        transition.after.netWorthCents - transition.before.netWorthCents;
      if (!Number.isSafeInteger(netWorthDelta)) {
        throw new TurningPointV1Error(
          "INVALID_TRANSITION",
          `transition.${transition.resultingRevision}.netWorthDelta`,
          "must remain within safe integer bounds",
        );
      }
      netWorthDeltas.push({ transition, delta: netWorthDelta });
      if (netWorthDeltas.length > TURNING_POINT_POLICY_V1.trendWindowMonths) {
        netWorthDeltas.shift();
      }
      if (netWorthDeltas.length === TURNING_POINT_POLICY_V1.trendWindowMonths) {
        const [first, second, latest] = netWorthDeltas;
        const priorDirection = Math.sign(first!.delta);
        const samePriorDirection =
          priorDirection !== 0 && Math.sign(second!.delta) === priorDirection;
        const reversed =
          samePriorDirection && Math.sign(latest!.delta) === -priorDirection;
        if (
          reversed &&
          Math.abs(latest!.delta) >=
            TURNING_POINT_POLICY_V1.netWorthReversalMinimumCents
        ) {
          const item = candidate(
            findNode(
              nodes,
              transition.resultingRevision,
              "financial_effect",
            ),
            "net_worth_reversal",
            TURNING_POINT_POLICY_V1.netWorthReversalScore,
            "three_month_net_worth_reversal",
          );
          if (item) candidates.push(item);
        }
      }
    }
  }
  return candidates;
}

function collectMilestoneCandidates(nodes: readonly CausalNodeV1[]): Candidate[] {
  return nodes
    .filter(
      (node) =>
        node.kind === "milestone" &&
        node.affectedValues.some(({ delta }) => delta !== null && delta !== 0),
    )
    .map((node) => ({
      node,
      primarySignature: "life_milestone" as const,
      score: TURNING_POINT_POLICY_V1.milestoneScore,
      reasonCodes: ["milestone_with_financial_effect" as const],
    }));
}

function candidateOrder(left: Candidate, right: Candidate): number {
  return (
    right.score - left.score ||
    left.node.resultingRevision - right.node.resultingRevision ||
    compareText(left.node.id, right.node.id)
  );
}

function suppressNearDuplicates(candidates: readonly Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  const seenNodes = new Set<string>();
  for (const item of [...candidates].sort(candidateOrder)) {
    if (seenNodes.has(item.node.id)) continue;
    const duplicate = kept.some(
      (existing) =>
        existing.primarySignature === item.primarySignature &&
        Math.abs(monthsBetween(existing.node.month, item.node.month)) <=
          TURNING_POINT_POLICY_V1.sameSignatureSuppressionMonths,
    );
    if (duplicate) continue;
    kept.push(item);
    seenNodes.add(item.node.id);
  }
  return kept;
}

export function selectTurningPointsV1(
  input: TurningPointSelectionInputV1,
): readonly CausalTurningPointV1[] {
  const transitions = normalizedTransitions(input.transitions);
  const candidates = suppressNearDuplicates([
    ...collectTransitionCandidates(input.nodes, transitions),
    ...collectMilestoneCandidates(input.nodes),
  ]).slice(0, TURNING_POINT_POLICY_V1.maximumTurningPoints);

  return Object.freeze(
    candidates.map((item) =>
      Object.freeze({
        version: TURNING_POINTS_V1_VERSION,
        nodeId: item.node.id,
        primarySignature: item.primarySignature,
        resultingRevision: item.node.resultingRevision,
        month: item.node.month,
        score: item.score,
        reasonCodes: Object.freeze([...item.reasonCodes]),
        sourceEvidenceIds: Object.freeze([...item.node.sourceEvidenceIds].sort(compareText)),
      }),
    ),
  );
}
