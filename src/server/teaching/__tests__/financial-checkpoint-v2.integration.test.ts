import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { buildCheckpointEvidenceV2 } from "../../../core/checkpoint-v2";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { FINANCIAL_KERNEL_V2_VERSION } from "../../../core/financial-kernel-v2";
import { projectFinancialGoal } from "../../../core/financial-goals-v2";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../../../core/market";
import {
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
} from "../../../core/event-scheduler-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import {
  processMonthlyTurnV2,
  type ProcessMonthV2Command,
} from "../../../core/monthly-turn-v2";
import { OUTCOME_POLICY_V1_VERSION } from "../../../core/outcome-policy-v2";
import { setRecurringStrategy } from "../../../core/recurring-strategy-v2";
import { analyzeRiskV1 } from "../../../core/risk-v1";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../../../core/runtime-balance-policy-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../../core/scenario-director-policy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import { buildTeachingCheckpointFromOwnersV2 } from "../../../core/teaching-checkpoint-owner-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";

describe("Financial Engine to Teaching checkpoint integration", () => {
  it("preserves checkpoint-v2.1 while tracing Teaching facts to the exact monthly record", () => {
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
    const native = createNativeGameStateV2({
      runId: "run.teaching-financial-checkpoint",
      playerId: "player.teaching-financial-checkpoint",
      birthMonth: simulationMonth("1995-01"),
      startMonth: simulationMonth("2026-07"),
      randomSeed: "teaching-financial-checkpoint",
      resolvedScenario,
      annualGrossSalaryCents: moneyCents(12_000_000),
      finances: {
        cashCents: moneyCents(1_000_000),
        taxableBroadIndexCents: moneyCents(1_000_000),
        taxableSectorCents: moneyCents(200_000),
        taxableSpeculativeCents: moneyCents(100_000),
        retirement401kCents: moneyCents(500_000),
        retirementIraCents: moneyCents(100_000),
        hsaCents: moneyCents(50_000),
        homeValueCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        termDebts: [],
        revolvingCreditLimitCents: moneyCents(1_000_000),
        revolvingCreditUsedCents: moneyCents(0),
      },
      wellbeing: {
        burnoutPpm: ratePpm(100_000),
        happinessPpm: ratePpm(900_000),
      },
    });
    const opening = setRecurringStrategy(native, {
      schemaVersion: 2,
      id: "strategy.teaching-checkpoint",
      type: "set_recurring_strategy",
      expectedRevision: native.revision,
      effectiveMonth: native.currentMonth,
      payload: {
        strategy: {
          emergencyFundTargetMonthsPpm: ratePpm(3_000_000),
          insuranceCoverageIds: ["insurance.renters"],
          preTax401kSalaryRatePpm: ratePpm(50_000),
          preTaxHsaSalaryRatePpm: ratePpm(20_000),
          afterTaxBroadIndexRatePpm: ratePpm(200_000),
          afterTaxSectorRatePpm: ratePpm(0),
          afterTaxSpeculativeRatePpm: ratePpm(0),
          afterTaxIraRatePpm: ratePpm(100_000),
          afterTaxExtraDebtRatePpm: ratePpm(0),
        },
      },
    });
    const command: ProcessMonthV2Command = {
      schemaVersion: 2,
      id: "month.teaching-checkpoint.1",
      type: "process_month_v2",
      expectedRevision: opening.revision,
      effectiveMonth: opening.currentMonth,
      payload: {
        financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
        outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
        eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
        marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
        macroDifficulty: "normal",
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.month.teaching-checkpoint.1",
          economicYear: 2026,
          policyYear: 2026,
          stateCode: "WA",
          filingStatus: "single",
          provider: "PolicyEngine US",
          bundleVersion: "4.21.0",
          rulesVersion: "1.764.6",
          projectedFromFrozenPolicy: false,
          grossIncomeCents: moneyCents(1_000_000),
          employee401kContributionCents: moneyCents(50_000),
          employeeHsaContributionCents: moneyCents(20_000),
          totalTaxCents: moneyCents(200_000),
          afterTaxCashIncomeCents: moneyCents(730_000),
        },
        taxableLiquidationCostRatePpm: ratePpm(10_000),
      },
    };
    const closed = processMonthlyTurnV2(opening, command);
    const evidence = buildCheckpointEvidenceV2(
      opening,
      closed.state,
      [closed.record],
    );
    const evidenceChecksum = sha256Canonical(evidence);
    const teaching = buildTeachingCheckpointFromOwnersV2({
      evidence,
      fromRevision: opening.revision,
      toRevision: closed.state.revision,
      endingStateChecksum: sha256Canonical(closed.state),
      monthlyRecords: [{
        resultingRevision: closed.state.revision,
        recordChecksum: sha256Canonical(closed.record),
        record: closed.record,
      }],
      startRisk: analyzeRiskV1(opening),
      endRisk: analyzeRiskV1(closed.state),
      endGoal: projectFinancialGoal(
        closed.state.finances,
        closed.state.gameplay.financialGoal,
      ),
    });

    expect(evidence.evidenceVersion).toBe("checkpoint-v2.1");
    expect(sha256Canonical(evidence)).toBe(evidenceChecksum);
    expect(teaching.evidenceVersion).toBe("checkpoint-v2.1");
    expect(teaching.facts.facts).toContainEqual(expect.objectContaining({
      factId: "checkpoint.total_gross_income_cents",
      value: { kind: "money_cents", value: closed.record.grossIncomeCents },
      source: expect.objectContaining({
        kind: "monthly_record",
        sourceId: `monthly:${closed.record.commandId}`,
        supportingSourceIds: [`monthly:${closed.record.commandId}`],
      }),
    }));
    expect(teaching.facts.facts).toContainEqual(expect.objectContaining({
      factId: "checkpoint.total_employer_match_cents",
      value: {
        kind: "money_cents",
        value: closed.record.recurringAllocations!.preTax.employer401kMatchCents,
      },
    }));
    expect(teaching.facts.facts).toContainEqual(expect.objectContaining({
      factId: "checkpoint.risk.debt_service_ratio.value",
      source: expect.objectContaining({
        kind: "risk_snapshot",
        field: "metrics.debt_service_ratio.rawValue",
      }),
    }));
    expect(
      teaching.facts.facts.some(({ source }) => source.kind === "exposure_snapshot"),
    ).toBe(false);
  });
});
