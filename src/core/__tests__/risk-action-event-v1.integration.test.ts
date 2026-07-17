import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { ACTION_POLICY_V1_VERSION } from "../action-policy-v2";
import { reduceDetailedFinanceCommand } from "../detailed-actions-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  CAUSAL_EVENT_SCHEDULER_V1_VERSION,
  schedulePersonalEventV2,
} from "../event-scheduler-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { analyzeRiskV1 } from "../risk-v1";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

const ALWAYS = Object.freeze({
  version: "fairness-v1" as const,
  minimumChancePpm: 1_000_000,
  maximumChancePpm: 1_000_000,
});

function indebtedState() {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.risk-action-event",
    playerId: "player.risk-action-event",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "risk-action-event",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(2_000_000),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.personal.high-interest",
          kind: "personal_loan",
          principalCents: moneyCents(2_000_000),
          annualInterestRatePpm: ratePpm(180_000),
          minimumPaymentCents: moneyCents(100_000),
          remainingTermMonths: 24,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

describe("action, risk, and causal event integration", () => {
  it("improves debt risk after payoff without changing unrelated hazard", () => {
    const before = indebtedState();
    const after = reduceDetailedFinanceCommand(before, {
      schemaVersion: 2,
      id: "action.risk.pay-debt",
      expectedRevision: before.revision,
      effectiveMonth: before.currentMonth,
      type: "take_detailed_action",
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "pay_term_debt",
          debtId: "debt.personal.high-interest",
          amountCents: moneyCents(1_000_000),
        },
      },
    });

    const beforeRisk = analyzeRiskV1(before);
    const afterRisk = analyzeRiskV1(after);
    expect(
      afterRisk.metrics.high_interest_debt_burden.severityPpm,
    ).toBeLessThan(beforeRisk.metrics.high_interest_debt_burden.severityPpm);
    expect(afterRisk.metrics.interest_burden.rawValue).toBeLessThan(
      beforeRisk.metrics.interest_burden.rawValue!,
    );

    const beforeHazard = schedulePersonalEventV2(
      before,
      ALWAYS,
      CAUSAL_EVENT_SCHEDULER_V1_VERSION,
    );
    const afterHazard = schedulePersonalEventV2(
      after,
      ALWAYS,
      CAUSAL_EVENT_SCHEDULER_V1_VERSION,
    );
    expect(afterHazard).toEqual(beforeHazard);
  });
});
