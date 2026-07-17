import { describe, expect, it } from "vitest";

import {
  causalNodeV1,
  type CausalNodeV1,
  type CausalStateDigestV1,
  type VerifiedRunTransitionV1,
} from "../causal-history-v1";
import {
  TURNING_POINT_POLICY_V1,
  selectTurningPointsV1,
  validateTurningPointPolicyV1,
} from "../turning-points-v1";

function digest(
  revision: number,
  patch: Partial<CausalStateDigestV1> = {},
): CausalStateDigestV1 {
  return {
    stateEvidenceId: `state:${revision}:${"a".repeat(64)}`,
    month: `2026-${String(revision).padStart(2, "0")}` as CausalStateDigestV1["month"],
    netWorthCents: 1_000_000,
    liquidResourceCoveragePpm: 500_000,
    liquidResourceBand: "moderate",
    highInterestDebtBurdenPpm: 100_000,
    fiProgressPpm: 100_000,
    recovery: null,
    outcomeReasonCode: null,
    ...patch,
  };
}

function transition(
  revision: number,
  before: Partial<CausalStateDigestV1>,
  after: Partial<CausalStateDigestV1>,
  effects: VerifiedRunTransitionV1["financialEffects"] = [],
): VerifiedRunTransitionV1 {
  return {
    commandId: `cmd.month.${revision}`,
    expectedRevision: revision - 1,
    resultingRevision: revision,
    effectiveMonth: `2026-${String(revision).padStart(2, "0")}` as VerifiedRunTransitionV1["effectiveMonth"],
    before: digest(revision - 1, before),
    after: digest(revision, after),
    financialEffects: effects,
    newlyResolvedMilestoneEvidenceIds: [],
  };
}

function graphNode(
  kind: CausalNodeV1["kind"],
  sourceEvidenceId: string,
  revision: number,
  affectedValues: CausalNodeV1["affectedValues"] = [],
): CausalNodeV1 {
  return causalNodeV1({
    kind,
    primarySourceEvidenceId: sourceEvidenceId,
    month: `2026-${String(revision).padStart(2, "0")}` as CausalNodeV1["month"],
    resultingRevision: revision,
    sourceEvidenceIds: [sourceEvidenceId],
    lessonTags: [],
    affectedValues,
  });
}

describe("Turning Points v1", () => {
  it("uses an immutable integer policy with a hard maximum of five", () => {
    expect(Object.isFrozen(TURNING_POINT_POLICY_V1)).toBe(true);
    expect(TURNING_POINT_POLICY_V1.maximumTurningPoints).toBe(5);
    expect(Object.values(TURNING_POINT_POLICY_V1).every(Number.isSafeInteger)).toBe(true);
    expect(validateTurningPointPolicyV1(TURNING_POINT_POLICY_V1)).toEqual([]);
    expect(validateTurningPointPolicyV1({
      ...TURNING_POINT_POLICY_V1,
      maximumTurningPoints: 0,
      terminalOutcomeScore: Number.MAX_SAFE_INTEGER,
    })).toEqual(expect.arrayContaining([
      { field: "maximumTurningPoints", code: "invalid_bound" },
      { field: "terminalOutcomeScore", code: "invalid_score" },
    ]));
  });

  it("prioritizes terminal outcomes and first forced sales with stable ties", () => {
    const forced = graphNode("financial_effect", "ledger:txn.forced", 2);
    const terminal = graphNode("end_condition", "outcome:8:bankruptcy", 8);
    const nodes = [terminal, forced];
    const transitions = [
      transition(2, {}, {}, [{
        sourceEvidenceId: "ledger:txn.forced",
        forcedSaleGrossCents: 100_000,
        newRevolvingCreditCents: 0,
        residualShortfallCents: 0,
      }]),
      transition(8, {}, { outcomeReasonCode: "bankruptcy" }),
    ];

    const result = selectTurningPointsV1({ nodes, transitions });

    expect(result.map(({ primarySignature }) => primarySignature)).toEqual([
      "terminal_outcome",
      "forced_sale",
    ]);
    expect(result[0]).toMatchObject({ nodeId: terminal.id, resultingRevision: 8 });
    expect(result[1]).toMatchObject({ nodeId: forced.id, resultingRevision: 2 });
  });

  it("suppresses near-identical signatures within three months and keeps the highest impact", () => {
    const first = graphNode("risk_change", "risk:2026-02:liquid_resource_coverage:risk.first", 2);
    const worse = graphNode("risk_change", "risk:2026-04:liquid_resource_coverage:risk.worse", 4);
    const transitions = [
      transition(2, { liquidResourceBand: "low" }, { liquidResourceBand: "high" }),
      transition(4, { liquidResourceBand: "low" }, { liquidResourceBand: "severe" }),
    ];

    const result = selectTurningPointsV1({ nodes: [first, worse], transitions });

    expect(result.filter(({ primarySignature }) => primarySignature === "liquidity_drop"))
      .toEqual([expect.objectContaining({ nodeId: worse.id })]);
  });

  it("does not treat three same-month commands as a three-month net-worth trend", () => {
    const financial = graphNode(
      "financial_effect",
      "ledger:txn.same-month-reversal",
      4,
    );
    const sameMonth = "2026-07" as CausalStateDigestV1["month"];
    const transitions = [
      transition(
        2,
        { month: sameMonth, netWorthCents: 1_000_000 },
        { month: sameMonth, netWorthCents: 1_200_000 },
      ),
      transition(
        3,
        { month: sameMonth, netWorthCents: 1_200_000 },
        { month: sameMonth, netWorthCents: 1_400_000 },
      ),
      transition(
        4,
        { month: sameMonth, netWorthCents: 1_400_000 },
        { month: sameMonth, netWorthCents: 1_000_000 },
      ),
    ];

    expect(
      selectTurningPointsV1({ nodes: [financial], transitions }).some(
        ({ primarySignature }) => primarySignature === "net_worth_reversal",
      ),
    ).toBe(false);
  });

  it("detects debt, FI, recovery, milestone, and bounded net-worth trend changes", () => {
    const debt = graphNode("risk_change", "risk:2026-02:high_interest_debt_burden:risk.debt", 2);
    const fi = graphNode(
      "checkpoint_change",
      `state:3:${"b".repeat(64)}`,
      3,
      [{
        metricId: "fi_progress",
        unit: "ratio_ppm",
        before: 100_000,
        after: 180_000,
        delta: 80_000,
        factIds: [`state:3:${"b".repeat(64)}`],
      }],
    );
    const recoveryStart = graphNode("recovery", "runtime-balance:cmd.month.4", 4);
    const recoveryEnd = graphNode("recovery", "runtime-balance:cmd.month.5", 5);
    const milestone = graphNode("milestone", "milestone:milestone.home:cmd.month.6", 6, [{
      metricId: "cash_cents",
      unit: "money_cents",
      before: 500_000,
      after: 300_000,
      delta: -200_000,
      factIds: ["milestone.home"],
    }]);
    const netWorth = graphNode("financial_effect", "ledger:txn.net-worth", 9);
    const transitions = [
      transition(2, { highInterestDebtBurdenPpm: 100_000 }, { highInterestDebtBurdenPpm: 250_000 }),
      transition(3, { fiProgressPpm: 100_000 }, { fiProgressPpm: 180_000 }),
      transition(4, { recovery: null }, {
        recovery: {
          sourceEvidenceId: "runtime-balance:cmd.month.4",
          sourceTier: "large",
          remainingMonths: 4,
        },
      }),
      transition(5, {
        liquidResourceCoveragePpm: 300_000,
        highInterestDebtBurdenPpm: 250_000,
        recovery: {
          sourceEvidenceId: "runtime-balance:cmd.month.4",
          sourceTier: "large",
          remainingMonths: 1,
        },
      }, {
        liquidResourceCoveragePpm: 500_000,
        highInterestDebtBurdenPpm: 100_000,
        recovery: null,
      }),
      transition(7, { netWorthCents: 1_000_000 }, { netWorthCents: 1_200_000 }),
      transition(8, { netWorthCents: 1_200_000 }, { netWorthCents: 1_400_000 }),
      transition(9, { netWorthCents: 1_400_000 }, { netWorthCents: 1_000_000 }),
    ];

    const result = selectTurningPointsV1({
      nodes: [debt, fi, recoveryStart, recoveryEnd, milestone, netWorth],
      transitions,
    });

    expect(result).toHaveLength(5);
    expect(result.map(({ primarySignature }) => primarySignature).sort()).toEqual([
      "fi_progress",
      "high_interest_debt",
      "life_milestone",
      "net_worth_reversal",
      "recovery_start",
    ].sort());
  });

  it("is deterministic across input order and never mutates graph or transitions", () => {
    const nodeA = graphNode(
      "checkpoint_change",
      `state:2:${"b".repeat(64)}`,
      2,
      [{
        metricId: "fi_progress",
        unit: "ratio_ppm",
        before: 100_000,
        after: 200_000,
        delta: 100_000,
        factIds: [`state:2:${"b".repeat(64)}`],
      }],
    );
    const nodeB = graphNode(
      "checkpoint_change",
      `state:5:${"b".repeat(64)}`,
      5,
      [{
        metricId: "fi_progress",
        unit: "ratio_ppm",
        before: 200_000,
        after: 350_000,
        delta: 150_000,
        factIds: [`state:5:${"b".repeat(64)}`],
      }],
    );
    const transitions = [
      transition(2, { fiProgressPpm: 100_000 }, { fiProgressPpm: 200_000 }),
      transition(5, { fiProgressPpm: 200_000 }, { fiProgressPpm: 350_000 }),
    ];
    const inputSnapshot = JSON.stringify({ nodes: [nodeA, nodeB], transitions });

    const first = selectTurningPointsV1({ nodes: [nodeA, nodeB], transitions });
    const second = selectTurningPointsV1({
      nodes: [nodeB, nodeA],
      transitions: [...transitions].reverse(),
    });

    expect(second).toEqual(first);
    expect(JSON.stringify({ nodes: [nodeA, nodeB], transitions })).toBe(inputSnapshot);
  });
});
