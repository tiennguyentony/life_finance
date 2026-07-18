import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildCausalHistoryV1,
  causalNodeV1,
  type CausalTurningPointV1,
} from "../causal-history-v1";
import { sha256Canonical } from "../canonical";
import type { CounterfactualResultV1 } from "../counterfactual-v1";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { DeterministicGameOutcomeV1 } from "../game-state";
import { buildTeachingDebriefV2 } from "../teaching-debrief-v2";
import { TeachingDebriefPanelV2 } from "../../features/game/teaching-moment-panel";

function affected(metricId: string, before: number, after: number) {
  return {
    metricId,
    unit: "money_cents" as const,
    before,
    after,
    delta: after - before,
    factIds: [`fact.${metricId}`],
  };
}

function causalFixture() {
  const savingDecision = causalNodeV1({
    kind: "decision",
    primarySourceEvidenceId: "command:save.more",
    month: simulationMonth("2030-01"),
    resultingRevision: 1,
    sourceEvidenceIds: ["command:save.more"],
    lessonTags: ["emergency_fund"],
    affectedValues: [],
  });
  const coverageDecision = causalNodeV1({
    kind: "decision",
    primarySourceEvidenceId: "command:skip.coverage",
    month: simulationMonth("2030-01"),
    resultingRevision: 1,
    sourceEvidenceIds: ["command:skip.coverage"],
    lessonTags: ["deductible"],
    affectedValues: [],
  });
  const savingEffect = causalNodeV1({
    kind: "financial_effect",
    primarySourceEvidenceId: "ledger:saving",
    month: simulationMonth("2030-02"),
    resultingRevision: 2,
    sourceEvidenceIds: ["ledger:saving"],
    lessonTags: ["emergency_fund"],
    affectedValues: [affected("cash", 100_000, 180_000)],
  });
  const liquidityRisk = causalNodeV1({
    kind: "risk_change",
    primarySourceEvidenceId: "risk:2030-03:risk-v1.liquidity",
    month: simulationMonth("2030-03"),
    resultingRevision: 3,
    sourceEvidenceIds: ["risk:2030-03:risk-v1.liquidity"],
    lessonTags: ["liquidity"],
    affectedValues: [affected("liquidity", 180_000, 60_000)],
  });
  const medicalEffect = causalNodeV1({
    kind: "financial_effect",
    primarySourceEvidenceId: "ledger:medical",
    month: simulationMonth("2030-04"),
    resultingRevision: 4,
    sourceEvidenceIds: ["ledger:medical"],
    lessonTags: ["deductible"],
    affectedValues: [affected("cash", 60_000, 0)],
  });
  const terminal = causalNodeV1({
    kind: "end_condition",
    primarySourceEvidenceId: "outcome:5:bankruptcy",
    month: simulationMonth("2030-05"),
    resultingRevision: 5,
    sourceEvidenceIds: ["outcome:5:bankruptcy"],
    lessonTags: ["liquidity"],
    affectedValues: [],
  });
  const point = (
    node: typeof savingEffect,
    primarySignature: CausalTurningPointV1["primarySignature"],
    reasonCode: CausalTurningPointV1["reasonCodes"][number],
    score: number,
  ): CausalTurningPointV1 => ({
    version: "turning-points-v1",
    nodeId: node.id,
    primarySignature,
    resultingRevision: node.resultingRevision,
    month: node.month,
    score,
    reasonCodes: [reasonCode],
    sourceEvidenceIds: node.sourceEvidenceIds,
  });
  return buildCausalHistoryV1({
    runId: "run-1",
    fromRevision: 0,
    toRevision: 5,
    sourceStateChecksum: "a".repeat(64),
    nodes: [
      savingDecision,
      coverageDecision,
      savingEffect,
      liquidityRisk,
      medicalEffect,
      terminal,
    ],
    links: [
      {
        parentNodeId: savingDecision.id,
        childNodeId: savingEffect.id,
        ruleCode: "decision_applied_financial_transaction",
        sourceEvidenceIds: ["command:save.more", "ledger:saving"],
      },
      {
        parentNodeId: coverageDecision.id,
        childNodeId: medicalEffect.id,
        ruleCode: "decision_applied_financial_transaction",
        sourceEvidenceIds: ["command:skip.coverage", "ledger:medical"],
      },
      {
        parentNodeId: liquidityRisk.id,
        childNodeId: medicalEffect.id,
        ruleCode: "coverage_gap_increased_uncovered_impact",
        sourceEvidenceIds: [
          "risk:2030-03:risk-v1.liquidity",
          "ledger:medical",
        ],
      },
      {
        parentNodeId: medicalEffect.id,
        childNodeId: terminal.id,
        ruleCode: "shortfall_caused_bankruptcy",
        sourceEvidenceIds: ["ledger:medical", "outcome:5:bankruptcy"],
      },
    ],
    turningPoints: [
      point(savingEffect, "fi_progress", "fi_progress_material_change", 80),
      point(
        liquidityRisk as typeof savingEffect,
        "liquidity_drop",
        "liquid_resource_band_worsened",
        90,
      ),
      point(medicalEffect, "forced_sale", "first_forced_taxable_sale", 95),
      point(
        terminal as typeof savingEffect,
        "terminal_outcome",
        "terminal_outcome_reached",
        100,
      ),
    ],
    coverage: {
      beginsAtRevision: 0,
      endsAtRevision: 5,
      preMigrationHistoryAvailable: true,
      summarizedCommandRanges: [],
      missingEvidence: [],
    },
  });
}

function counterfactualFixture(): CounterfactualResultV1 {
  const checksumInput = {
    version: "counterfactual-v1" as const,
    sourceCommandId: "save.more",
    sourceRevision: 0,
    interventionPath: "payload.strategy.afterTaxBroadIndexRatePpm",
    originalValue: 0,
    alternateValue: 100_000,
    changedPaths: ["payload.strategy.afterTaxBroadIndexRatePpm"],
    requestedHorizonMonths: 12,
    comparedMonths: 12,
    acceptedCommandCount: 12,
    lastComparableRevision: 5,
    lastComparableMonth: simulationMonth("2030-05"),
    stopReason: "requested_horizon_reached" as const,
    seedControl: {
      mode: "matched_shared_cursor_through_horizon" as const,
      lastComparableRevision: 5,
      lastComparableMonth: simulationMonth("2030-05"),
    },
    assumptions: [
      "deterministic_simulation_comparison_not_real_life_prediction",
      "future_player_commands_held_unchanged_until_stop_reason",
      "tax_evidence_reused_only_while_context_fingerprint_matches",
      "future_seed_control_reported_from_verified_seed_evidence",
    ] as const,
    actual: {
      revision: 5,
      month: simulationMonth("2030-05"),
      cashCents: 0,
      totalDebtCents: 120_000,
      netWorthCents: -120_000,
      recoveryRemainingMonths: null,
      fiProgressPpm: 2_778,
      outcomeKind: "bankruptcy",
      outcomeReasonCode: "actual_required_obligation_shortfall",
      forcedSaleGrossCents: 0,
      forcedSaleCount: 0,
      newRevolvingCreditCents: 0,
      residualShortfallCents: 120_000,
      finalStateChecksum: "b".repeat(64),
    },
    alternative: {
      revision: 5,
      month: simulationMonth("2030-05"),
      cashCents: 20_000,
      totalDebtCents: 100_000,
      netWorthCents: -80_000,
      recoveryRemainingMonths: null,
      fiProgressPpm: 3_000,
      outcomeKind: null,
      outcomeReasonCode: null,
      forcedSaleGrossCents: 0,
      forcedSaleCount: 0,
      newRevolvingCreditCents: 0,
      residualShortfallCents: 0,
      finalStateChecksum: "c".repeat(64),
    },
    difference: {
      direction: "alternative_minus_actual" as const,
      cashCents: 20_000,
      totalDebtCents: -20_000,
      netWorthCents: 40_000,
      forcedSaleGrossCents: 0,
      forcedSaleCount: 0,
      newRevolvingCreditCents: 0,
      residualShortfallCents: -120_000,
      recoveryRemainingMonths: null,
      fiProgressPpm: 222,
      outcomeChanged: true,
    },
    evidenceIds: ["command:save.more", `state:5:${"b".repeat(64)}`],
  };
  return Object.freeze({
    ...checksumInput,
    resultChecksum: sha256Canonical(checksumInput),
  });
}

describe("Teaching v2 final debrief", () => {
  it("keeps outcome authority, causal roles, turning points, decisions, and counterfactuals bounded", () => {
    const history = causalFixture();
    const directEdge = history.edges.find(
      ({ ruleCode }) => ruleCode === "decision_applied_financial_transaction",
    )!;
    const contributingEdge = history.edges.find(
      ({ role }) => role === "contributing_condition",
    )!;
    const secondDirectEdge = history.edges.find(
      ({ parentNodeId }) => parentNodeId.includes("skip.coverage"),
    )!;
    const outcome: DeterministicGameOutcomeV1 = {
      outcomePolicyVersion: "1.0.0",
      kind: "bankruptcy",
      grade: "F",
      reachedMonth: simulationMonth("2030-05"),
      reasonCode: "actual_required_obligation_shortfall",
      reasonCodes: [
        "actual_required_obligation_shortfall",
        "automatic_liquidity_exhausted",
      ],
      financialIndependence: {
        goalSource: "current_lifestyle_default",
        investableAssetsCents: moneyCents(250_000),
        targetCents: moneyCents(90_000_000),
        progressPpm: ratePpm(2_778),
      },
      displayedNetWorthCents: moneyCents(-120_000),
      automaticLiquidSolvency: {
        requiredCashCents: moneyCents(160_000),
        automaticLiquidityCents: moneyCents(40_000),
        residualShortfallCents: moneyCents(120_000),
        isSolvent: false,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        currentAgeYears: 36,
        reachedRetirementAge: false,
        gradeIfRetiredNow: "E",
      },
    };
    const historyBefore = JSON.stringify(history);
    const outcomeBefore = JSON.stringify(outcome);

    const debrief = buildTeachingDebriefV2({
      outcome,
      outcomeStateChecksum: "a".repeat(64),
      causalHistory: history,
      counterfactuals: [counterfactualFixture()],
    });

    expect(debrief.outcome).toMatchObject({
      grade: "F",
      endReason: "bankruptcy",
      reasonCode: "actual_required_obligation_shortfall",
      reasonCodes: [
        "actual_required_obligation_shortfall",
        "automatic_liquidity_exhausted",
      ],
      sourceId: "outcome:5:bankruptcy",
    });
    expect(debrief.turningPoints).toHaveLength(3);
    expect(debrief.counterfactuals).toHaveLength(1);
    expect(debrief.counterfactuals[0]).toMatchObject({
      sourceCommandId: "save.more",
      difference: { cashCents: 20_000, outcomeChanged: true },
    });
    expect(debrief.financialDiscipline).toMatchObject({
      financialIndependence: { progressPpm: 2_778 },
      displayedNetWorthCents: -120_000,
      liquidSolvency: { isSolvent: false, residualShortfallCents: 120_000 },
      retirementReadiness: { currentAgeYears: 36, gradeIfRetiredNow: "E" },
    });
    expect(debrief.strongDecisions).toEqual([]);
    expect(debrief.improvements).toHaveLength(1);
    expect(debrief.improvements[0]?.sourceEvidenceIds).toContain("command:skip.coverage");
    expect(debrief.improvements.map(({ edgeId }) => edgeId)).not.toContain(
      contributingEdge.id,
    );
    expect(debrief.decisionAssessment).toEqual({
      status: "verified_owner_signals",
      reasonCode: "turning_point_reason_supported",
    });
    expect(debrief.mastery).toEqual({
      status: "not_assessed",
      reasonCode: "encounters_and_wealth_are_not_mastery",
      sourceEvidenceIds: [],
    });
    expect(debrief.recommendations.length).toBeGreaterThan(0);
    expect(debrief.recommendations.map(({ text }) => text).join(" ")).not.toContain(
      "strongest verified",
    );
    expect(debrief.causalExplanations[0]?.text).toContain("directly led");
    expect(debrief.causalExplanations[1]?.text).toContain(
      "it did not cause the underlying incident",
    );
    expect(debrief.causalExplanations[0]?.sourceEvidenceIds.length).toBeGreaterThan(0);
    expect(Object.isFrozen(debrief)).toBe(true);
    expect(JSON.stringify(history)).toBe(historyBefore);
    expect(JSON.stringify(outcome)).toBe(outcomeBefore);
    expect(directEdge).toBeDefined();
    expect(contributingEdge).toBeDefined();
    expect(secondDirectEdge).toBeDefined();
    const html = renderToStaticMarkup(createElement(TeachingDebriefPanelV2, {
      response: {
        source: "deterministic_template",
        counterfactualRequestSource: "client_requested",
        debrief,
        stateChecksum: "a".repeat(64),
      },
    }));
    expect(html).toContain("Learning mastery");
    expect(html).toContain("Not assessed");
    expect(html).toContain("Change opportunities");
    expect(html).toContain("Verified counterfactuals");
    expect(html).toContain("net-worth difference");
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(html).not.toContain("<details open");
    expect(html).toContain("Verified outcome source");
    expect(html).toContain(debrief.outcome.sourceId);
    expect(html).toContain(
      debrief.facts.facts.find(({ factId }) => factId === "outcome.net_worth_cents")!
        .source.sourceId,
    );
    expect(html).toContain(debrief.counterfactuals[0]!.resultChecksum);
    expect(html).toContain(debrief.counterfactuals[0]!.sourceEvidenceIds[0]!);
  });
});
