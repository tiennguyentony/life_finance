import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  buildCausalHistoryV1,
  causalNodeV1,
  type CausalHistoryBuildInputV1,
  type CausalNodeV1,
} from "../causal-history-v1";

const CHECKSUM = sha256Canonical({ state: "verified" });

function node(
  kind: CausalNodeV1["kind"],
  primarySourceEvidenceId: string,
  resultingRevision: number,
  sourceEvidenceIds: readonly string[] = [primarySourceEvidenceId],
): CausalNodeV1 {
  return causalNodeV1({
    kind,
    primarySourceEvidenceId,
    month: `2026-${String(resultingRevision).padStart(2, "0")}` as CausalNodeV1["month"],
    resultingRevision,
    sourceEvidenceIds,
    lessonTags: [],
    affectedValues: [],
  });
}

function historyInput(
  nodes: readonly CausalNodeV1[],
  links: CausalHistoryBuildInputV1["links"] = [],
  coverage: Partial<CausalHistoryBuildInputV1["coverage"]> = {},
): CausalHistoryBuildInputV1 {
  return {
    runId: "run.causal-history",
    fromRevision: 0,
    toRevision: 9,
    sourceStateChecksum: CHECKSUM,
    nodes,
    links,
    turningPoints: [],
    coverage: {
      beginsAtRevision: 0,
      endsAtRevision: 9,
      preMigrationHistoryAvailable: true,
      summarizedCommandRanges: [],
      missingEvidence: [],
      ...coverage,
    },
  };
}

describe("Causal History v1", () => {
  it("derives stable node and edge IDs, closed roles, ordering, and checksum", () => {
    const decision = node("decision", "command:cmd.buy", 1);
    const effect = node(
      "financial_effect",
      "ledger:txn.cmd.buy",
      2,
      ["ledger:txn.cmd.buy", "command:cmd.buy"],
    );
    const input = historyInput(
      [effect, decision],
      [{
        parentNodeId: decision.id,
        childNodeId: effect.id,
        ruleCode: "decision_applied_financial_transaction",
        sourceEvidenceIds: ["command:cmd.buy", "ledger:txn.cmd.buy"],
      }],
    );

    const first = buildCausalHistoryV1(input);
    const reordered = buildCausalHistoryV1({
      ...input,
      nodes: [decision, effect],
      links: [{
        ...input.links[0]!,
        sourceEvidenceIds: ["ledger:txn.cmd.buy", "command:cmd.buy"],
      }],
    });

    expect(first.nodes.map(({ id }) => id)).toEqual([decision.id, effect.id]);
    expect(first.edges).toEqual([expect.objectContaining({
      id: `edge:decision_applied_financial_transaction:${decision.id}:${effect.id}`,
      role: "direct_cause",
    })]);
    expect(first.historyChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toEqual(first);
  });

  it("keeps old-record evidence gaps explicit instead of synthesizing modern evidence", () => {
    const event = node("event", "event:evt.legacy", 4);
    const history = buildCausalHistoryV1(historyInput([event], [], {
      beginsAtRevision: 4,
      preMigrationHistoryAvailable: false,
      missingEvidence: [{
        code: "runtime_balance_decision_absent",
        fromRevision: 4,
        toRevision: 4,
        sourceEvidenceIds: ["event:evt.legacy"],
      }],
    }));

    expect(history.coverage).toMatchObject({
      beginsAtRevision: 4,
      preMigrationHistoryAvailable: false,
      missingEvidence: [{ code: "runtime_balance_decision_absent" }],
    });
    expect(history.nodes).toHaveLength(1);
    expect(history.edges).toHaveLength(0);
  });

  it("rejects nodes before a migrated run's verified coverage boundary", () => {
    const inventedPreMigrationNode = node("event", "event:evt.before-migration", 2);

    expect(() => buildCausalHistoryV1(historyInput(
      [inventedPreMigrationNode],
      [],
      {
        beginsAtRevision: 4,
        preMigrationHistoryAvailable: false,
        missingEvidence: [{
          code: "pre_migration_history_unavailable",
          fromRevision: 4,
          toRevision: 4,
          sourceEvidenceIds: [],
        }],
      },
    ))).toThrowError(expect.objectContaining({ code: "INVALID_NODE" }));
  });

  it("distinguishes an unrelated incident from low-liquidity contribution", () => {
    const event = node("event", "event:evt.layoff", 3);
    const response = node(
      "response",
      "event-response:evt.layoff:cmd.respond",
      4,
      [
        "event-response:evt.layoff:cmd.respond",
        "event:evt.layoff",
        "command:cmd.respond",
      ],
    );
    const lowCash = node(
      "risk_change",
      "risk:2026-03:liquid_resource_coverage:risk.low_cash",
      3,
    );
    const creditUse = node(
      "financial_effect",
      "ledger:txn.cmd.respond.credit",
      4,
      [
        "ledger:txn.cmd.respond.credit",
        "event-response:evt.layoff:cmd.respond",
        "risk:2026-03:liquid_resource_coverage:risk.low_cash",
      ],
    );
    const history = buildCausalHistoryV1(historyInput(
      [creditUse, event, lowCash, response],
      [
        {
          parentNodeId: event.id,
          childNodeId: response.id,
          ruleCode: "event_presented_response_context",
          sourceEvidenceIds: [
            "event:evt.layoff",
            "event-response:evt.layoff:cmd.respond",
          ],
        },
        {
          parentNodeId: response.id,
          childNodeId: creditUse.id,
          ruleCode: "event_response_declared_effect",
          sourceEvidenceIds: [
            "event-response:evt.layoff:cmd.respond",
            "ledger:txn.cmd.respond.credit",
          ],
        },
        {
          parentNodeId: lowCash.id,
          childNodeId: creditUse.id,
          ruleCode: "liquidity_limited_recovery",
          sourceEvidenceIds: [
            "risk:2026-03:liquid_resource_coverage:risk.low_cash",
            "ledger:txn.cmd.respond.credit",
          ],
        },
      ],
    ));

    expect(history.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        parentNodeId: event.id,
        childNodeId: response.id,
        role: "contributing_condition",
      }),
      expect.objectContaining({
        parentNodeId: response.id,
        childNodeId: creditUse.id,
        role: "direct_cause",
      }),
      expect.objectContaining({
        parentNodeId: lowCash.id,
        childNodeId: creditUse.id,
        role: "contributing_condition",
      }),
    ]));
    expect(history.edges).not.toContainEqual(expect.objectContaining({
      parentNodeId: lowCash.id,
      childNodeId: event.id,
      role: "direct_cause",
    }));
  });

  it("keeps FI progress in a checkpoint owned by verified financial change", () => {
    const effect = node(
      "financial_effect",
      "ledger:txn.monthly.allocation",
      2,
      ["ledger:txn.monthly.allocation", "state:2:" + CHECKSUM],
    );
    const checkpoint = causalNodeV1({
      kind: "checkpoint_change",
      primarySourceEvidenceId: `state:2:${CHECKSUM}`,
      month: "2026-02" as CausalNodeV1["month"],
      resultingRevision: 2,
      sourceEvidenceIds: [
        `state:2:${CHECKSUM}`,
        "ledger:txn.monthly.allocation",
      ],
      lessonTags: [],
      affectedValues: [{
        metricId: "fi_progress",
        unit: "ratio_ppm",
        before: 400_000,
        after: 500_000,
        delta: 100_000,
        factIds: [`state:2:${CHECKSUM}`],
      }],
    });
    const history = buildCausalHistoryV1(historyInput(
      [effect, checkpoint],
      [{
        parentNodeId: effect.id,
        childNodeId: checkpoint.id,
        ruleCode: "financial_change_updated_checkpoint",
        sourceEvidenceIds: [
          "ledger:txn.monthly.allocation",
          `state:2:${CHECKSUM}`,
        ],
      }],
    ));

    expect(history.nodes.find(({ kind }) => kind === "checkpoint_change"))
      .toMatchObject({ affectedValues: [{ metricId: "fi_progress" }] });
    expect(history.edges).toEqual([
      expect.objectContaining({
        role: "direct_cause",
        ruleCode: "financial_change_updated_checkpoint",
      }),
    ]);
  });

  it("rejects a vulnerability rule aimed at an incident", () => {
    const lowCash = node(
      "risk_change",
      "risk:2026-03:liquid_resource_coverage:risk.low_cash",
      3,
    );
    const event = node("event", "event:evt.layoff", 4);

    expect(() => buildCausalHistoryV1(historyInput([lowCash, event], [{
      parentNodeId: lowCash.id,
      childNodeId: event.id,
      ruleCode: "liquidity_limited_recovery",
      sourceEvidenceIds: [
        "risk:2026-03:liquid_resource_coverage:risk.low_cash",
        "event:evt.layoff",
      ],
    }]))).toThrowError(expect.objectContaining({
      code: "RULE_KIND_MISMATCH",
    }));
  });

  it("rejects treating an event opportunity as a market revaluation cause", () => {
    const opportunity = node(
      "event_opportunity",
      "monthly:cmd.monthly.market",
      3,
    );
    const revaluation = node(
      "financial_effect",
      "ledger:txn.market.revaluation",
      3,
      ["ledger:txn.market.revaluation", "monthly:cmd.monthly.market"],
    );

    expect(() => buildCausalHistoryV1(historyInput(
      [opportunity, revaluation],
      [{
        parentNodeId: opportunity.id,
        childNodeId: revaluation.id,
        ruleCode: "market_step_applied_revaluation",
        sourceEvidenceIds: [
          "monthly:cmd.monthly.market",
          "ledger:txn.market.revaluation",
        ],
      }],
    ))).toThrowError(expect.objectContaining({
      code: "RULE_KIND_MISMATCH",
    }));
  });

  it("rejects unknown rules, invented evidence, forward causes, and cycles", () => {
    const effect = node("financial_effect", "ledger:txn.effect", 2);
    const risk = node(
      "risk_change",
      "risk:2026-02:liquid_resource_coverage:risk.liquidity",
      3,
    );

    expect(() => buildCausalHistoryV1(historyInput([effect, risk], [{
      parentNodeId: effect.id,
      childNodeId: risk.id,
      ruleCode: "made_up_rule" as "financial_change_updated_risk_measurement",
      sourceEvidenceIds: ["ledger:txn.effect"],
    }]))).toThrowError(expect.objectContaining({ code: "UNKNOWN_RULE" }));

    expect(() => causalNodeV1({
      kind: "decision",
      primarySourceEvidenceId: "ai:claim.1",
      month: "2026-01" as CausalNodeV1["month"],
      resultingRevision: 1,
      sourceEvidenceIds: ["ai:claim.1"],
      lessonTags: [],
      affectedValues: [],
    })).toThrowError(expect.objectContaining({ code: "INVALID_SOURCE_EVIDENCE" }));

    expect(() => buildCausalHistoryV1(historyInput([effect, risk], [{
      parentNodeId: risk.id,
      childNodeId: effect.id,
      ruleCode: "liquidity_limited_recovery",
      sourceEvidenceIds: [risk.sourceEvidenceIds[0]!, effect.sourceEvidenceIds[0]!],
    }]))).toThrowError(expect.objectContaining({ code: "FORWARD_CAUSE" }));

    const sameRevisionRisk = causalNodeV1({
      ...risk,
      primarySourceEvidenceId: risk.sourceEvidenceIds[0]!,
      resultingRevision: 2,
    });
    expect(() => buildCausalHistoryV1(historyInput(
      [effect, sameRevisionRisk],
      [
        {
          parentNodeId: effect.id,
          childNodeId: sameRevisionRisk.id,
          ruleCode: "financial_change_updated_risk_measurement",
          sourceEvidenceIds: [effect.sourceEvidenceIds[0]!, sameRevisionRisk.sourceEvidenceIds[0]!],
        },
        {
          parentNodeId: sameRevisionRisk.id,
          childNodeId: effect.id,
          ruleCode: "liquidity_limited_recovery",
          sourceEvidenceIds: [sameRevisionRisk.sourceEvidenceIds[0]!, effect.sourceEvidenceIds[0]!],
        },
      ],
    ))).toThrowError(expect.objectContaining({ code: "CAUSAL_CYCLE" }));
  });

  it("rejects affected values whose arithmetic or fact evidence is unsafe", () => {
    expect(() => causalNodeV1({
      kind: "financial_effect",
      primarySourceEvidenceId: "ledger:txn.bad",
      month: "2026-01" as CausalNodeV1["month"],
      resultingRevision: 1,
      sourceEvidenceIds: ["ledger:txn.bad"],
      lessonTags: [],
      affectedValues: [{
        metricId: "cash_cents",
        unit: "money_cents",
        before: 100,
        after: 50,
        delta: 99,
        factIds: ["unverified prose"],
      }],
    })).toThrowError(expect.objectContaining({ code: "INVALID_AFFECTED_VALUE" }));
  });
});
