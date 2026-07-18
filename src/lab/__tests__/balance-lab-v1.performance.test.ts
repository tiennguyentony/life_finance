import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";

import rawConfig from "../../../balance-lab.config.json";
import { sha256Canonical } from "../../core/canonical";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { DECLARATIVE_EVENT_SCHEDULER_V2_VERSION } from "../../core/event-scheduler-v2";
import { FINANCIAL_KERNEL_V2_VERSION } from "../../core/financial-kernel-v2";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../../core/market";
import { onboardingDraftForPersonaV1 } from "../../core/onboarding-personas-v1";
import {
  constructOnboardedGameStateV1,
  prepareOnboardingReviewV1,
} from "../../core/onboarding-v1";
import { OUTCOME_POLICY_V1_VERSION } from "../../core/outcome-policy-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../../core/runtime-balance-policy-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../core/scenario-director-policy-v2";
import { WORLD_RANDOM_VERSION_V1 } from "../../core/world-random-v1";
import { createBalanceLabPersonaStateV1 } from "../../data/balance-lab-personas-v1";
import {
  buildMonthlyTaxEvidenceFromPolicyEngineV1,
  buildTaxRequest,
} from "../../server/api/tax-orchestrator";
import type { TaxCalculationResult } from "../../server/tax/contracts";
import {
  BALANCE_LAB_PRODUCTION_PORTS_V1,
  createBalanceLabProductionOwnersV1,
} from "../balance-lab-v1-production";
import {
  decodeBalanceLabConfigV1,
  resolveBalanceLabBatchV1,
} from "../balance-lab-v1-config";
import { runOfflineBalanceLabV1 } from "../balance-lab-v1-runner";
import type { BalanceLabTaxEvidenceSourceV1 } from "../balance-lab-v1-tax-evidence";

function engineeringTaxSource(): BalanceLabTaxEvidenceSourceV1 {
  return Object.freeze({
    version: "quick-tax-fixture-v1",
    limitation: "Performance-only deterministic evidence; not release tax evidence.",
    evidenceFingerprint: () => sha256Canonical("performance-tax-evidence"),
    getEvidence: (state, commandId) => {
      const request = buildTaxRequest(state, commandId);
      const annualGrossIncomeCents = state.gameplay.employment.status === "employed"
        ? state.gameplay.employment.annualGrossSalaryCents
        : 0;
      const totalTaxCents = 2_400_000;
      return buildMonthlyTaxEvidenceFromPolicyEngineV1(
        state,
        commandId,
        {
          kind: "calculated",
          result: {
            schemaVersion: 1,
            traceId: request.traceId,
            economicYear: request.economicYear,
            policyYear: request.policyYear,
            stateCode: request.stateCode,
            filingStatus: request.filingStatus,
            annualGrossIncomeCents,
            federalIncomeTaxCents: totalTaxCents,
            stateIncomeTaxCents: 0,
            employeePayrollTaxCents: 0,
            selfEmploymentTaxCents: 0,
            totalTaxCents,
            afterTaxIncomeCents: 9_600_000,
            effectiveTaxRatePpm: 200_000,
            componentsCents: { engineering_fixture: totalTaxCents },
            model: {
              provider: "PolicyEngine US",
              bundleVersion: "4.21.0",
              rulesVersion: "1.764.6",
              projectedFromFrozenPolicy: false,
            },
            disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
          } as TaxCalculationResult,
        },
      );
    },
  });
}

describe("offline balance lab production performance", () => {
  const config = decodeBalanceLabConfigV1(rawConfig);
  const owners = createBalanceLabProductionOwnersV1({
    createPersonaState: createBalanceLabPersonaStateV1,
    taxEvidence: engineeringTaxSource(),
  });

  it.skipIf(process.env.BALANCE_LAB_SIZE === "quick")(
    "runs confirmed onboarding through exactly 480 production months to retirement",
    () => {
      const draft = {
        ...onboardingDraftForPersonaV1("software", "retirement-480-seed"),
        startMonth: "2026-07",
        birthMonth: "2001-07",
        essentialExpenses: { amountCents: 120_000, period: "annual" as const },
        discretionaryExpenses: {
          amountCents: 120_000,
          period: "annual" as const,
        },
        financialGoal: {
          version: "financial-goal-v1" as const,
          desiredAnnualSpendingCents: moneyCents(8_000_000_000_000),
          safeWithdrawalRatePpm: ratePpm(40_000),
          targetAgeYears: 65,
          source: "player_selected" as const,
        },
      };
      const review = prepareOnboardingReviewV1(draft);
      expect(review.status).toBe("ready");
      const onboarded = constructOnboardedGameStateV1(
        {
          review,
          reviewChecksum: review.reviewChecksum,
          confirmed: true,
        },
        { runId: "run.retirement-480", playerId: "player.retirement-480" },
      ).state;
      const advanceTime = vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.advanceTime);
      const productionOwners = createBalanceLabProductionOwnersV1({
        createPersonaState: () => onboarded,
        taxEvidence: engineeringTaxSource(),
        personalEventCatalog: [],
        ports: { ...BALANCE_LAB_PRODUCTION_PORTS_V1, advanceTime },
      });

      const start = performance.now();
      const result = runOfflineBalanceLabV1(
        {
          version: "offline-balance-lab-v1",
          experimentId: "onboarding-retirement-480",
          personaIds: ["onboarded-retirement-v1"],
          matchedSeeds: [7],
          botIds: ["cash-hoarder-v1"],
          horizonMonths: 480,
          difficulty: "normal",
        },
        productionOwners,
      );
      const elapsedMs = performance.now() - start;
      const run = result.runs[0]!;

      expect(onboarded.gameplay.initialization).toMatchObject({
        version: "onboarding-v1",
        confirmed: true,
        initialRandomSeed: "retirement-480-seed",
      });
      expect(run.processedMonths).toBe(480);
      expect(run.terminal).toBe(true);
      expect(run.metrics.endReason).toBe("retirement");
      expect(run.metrics.grade).not.toBeNull();
      // The terminal retirement month short-circuits before an event/no-event
      // decision, so the preceding 479 ordinary months are counted here.
      expect(run.metrics.noEventMonths).toBe(479);
      expect(run.worldEvidence).toHaveLength(480);
      expect(run.finalStateChecksum).toBe(
        "874eb11785fa52675065fdf88195aa0570350a409007bb40b54bae5b1a41f2df",
      );
      expect(advanceTime).toHaveBeenCalledTimes(480);
      for (const [, command] of advanceTime.mock.calls) {
        expect(command.monthlyInputs[0]!.payload).toMatchObject({
          financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
          outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion:
            RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
          scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
          worldRandomVersion: WORLD_RANDOM_VERSION_V1,
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
          macroDifficulty: "normal",
        });
      }
      expect(elapsedMs).toBeLessThan(40_000);
    },
    45_000,
  );

  it("bounds the configured 432-production-month quick cohort", () => {
    const quick = resolveBalanceLabBatchV1(config, "quick", "performance-quick");
    const start = performance.now();
    const result = runOfflineBalanceLabV1(quick.spec, owners);
    const elapsedMs = performance.now() - start;

    expect(result.runs).toHaveLength(18);
    expect(result.runs.reduce((sum, run) => sum + run.processedMonths, 0)).toBeLessThanOrEqual(
      432,
    );
    expect(elapsedMs).toBeLessThan(quick.runtimeBudgetMs);
  }, 35_000);
});
