import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  buildCausalExplanationFactsV1,
  renderCausalExplanationV1,
} from "../causal-explanation-v1";
import {
  buildCausalHistoryV1,
  causalNodeV1,
  type CausalHistoryBuildInputV1,
  type CausalNodeV1,
} from "../causal-history-v1";

function node(
  kind: CausalNodeV1["kind"],
  source: string,
  revision: number,
  sources: readonly string[] = [source],
  affectedValues: CausalNodeV1["affectedValues"] = [],
) {
  return causalNodeV1({
    kind,
    primarySourceEvidenceId: source,
    month: "2026-07" as CausalNodeV1["month"],
    resultingRevision: revision,
    sourceEvidenceIds: sources,
    lessonTags: [],
    affectedValues,
  });
}

function history() {
  const decision = node("decision", "command:cmd.policy", 1);
  const policy = node("policy_change", "command:cmd.policy", 1);
  const effect = node(
    "financial_effect",
    "ledger:txn.policy",
    2,
    ["ledger:txn.policy", "command:cmd.policy"],
    [{
      metricId: "cash_cents",
      unit: "money_cents",
      before: 1_000_000,
      after: 900_000,
      delta: -100_000,
      factIds: ["ledger:txn.policy"],
    }],
  );
  const risk = node(
    "risk_change",
    "risk:2026-07:liquid_resource_coverage:risk.low_cash",
    2,
    [
      "risk:2026-07:liquid_resource_coverage:risk.low_cash",
      "ledger:txn.policy",
    ],
  );
  const input: CausalHistoryBuildInputV1 = {
    runId: "run.explanation",
    fromRevision: 0,
    toRevision: 2,
    sourceStateChecksum: sha256Canonical({ revision: 2 }),
    nodes: [decision, policy, effect, risk],
    links: [
      {
        parentNodeId: decision.id,
        childNodeId: policy.id,
        ruleCode: "policy_command_changed_strategy",
        sourceEvidenceIds: ["command:cmd.policy"],
      },
      {
        parentNodeId: policy.id,
        childNodeId: effect.id,
        ruleCode: "policy_shaped_monthly_allocation",
        sourceEvidenceIds: ["command:cmd.policy", "ledger:txn.policy"],
      },
      {
        parentNodeId: effect.id,
        childNodeId: risk.id,
        ruleCode: "financial_change_updated_risk_measurement",
        sourceEvidenceIds: [
          "ledger:txn.policy",
          "risk:2026-07:liquid_resource_coverage:risk.low_cash",
        ],
      },
    ],
    turningPoints: [],
    coverage: {
      beginsAtRevision: 0,
      endsAtRevision: 2,
      preMigrationHistoryAvailable: true,
      summarizedCommandRanges: [],
      missingEvidence: [],
    },
  };
  return { built: buildCausalHistoryV1(input), effect };
}

describe("causal explanation v1", () => {
  it("renders deterministic role-explicit facts with exact citations", () => {
    const { built, effect } = history();
    const packet = buildCausalExplanationFactsV1(built);
    const rendered = renderCausalExplanationV1(packet);

    expect(packet.facts.map(({ role }) => role)).toEqual([
      "contributing_condition",
      "direct_cause",
      "direct_cause",
    ]);
    expect(rendered.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "contributing_condition",
          text: expect.stringContaining("did not cause the underlying incident"),
          citedEvidenceIds: expect.arrayContaining([
            "command:cmd.policy",
            "ledger:txn.policy",
          ]),
        }),
      ]),
    );
    expect(packet.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        childNodeId: effect.id,
        affectedValues: [expect.objectContaining({
          metricId: "cash_cents",
          delta: -100_000,
        })],
      }),
    ]));
    expect(renderCausalExplanationV1(packet)).toEqual(rendered);
  });

  it("focuses on one verified node and rejects modified packets", () => {
    const { built, effect } = history();
    const packet = buildCausalExplanationFactsV1(built, {
      focusNodeId: effect.id,
    });
    expect(packet.facts).toHaveLength(2);

    expect(() =>
      renderCausalExplanationV1({
        ...packet,
        facts: packet.facts.slice(1),
      }),
    ).toThrowError(expect.objectContaining({
      code: "INVALID_HISTORY_CHECKSUM",
    }));
  });

  it("rejects a history whose canonical checksum was changed", () => {
    const { built } = history();
    expect(() =>
      buildCausalExplanationFactsV1({
        ...built,
        historyChecksum: "0".repeat(64),
      }),
    ).toThrowError(expect.objectContaining({
      code: "INVALID_HISTORY_CHECKSUM",
    }));
  });
});
