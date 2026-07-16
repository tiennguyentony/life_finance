import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import rawConfig from "../../../balance-lab.config.json";
import { sha256Canonical } from "../../core/canonical";
import { createBalanceLabPersonaStateV1 } from "../../data/balance-lab-personas-v1";
import {
  buildMonthlyTaxEvidenceFromPolicyEngineV1,
  buildTaxRequest,
} from "../../server/api/v2/tax-orchestrator";
import type { TaxCalculationResult } from "../../server/tax/contracts";
import { createBalanceLabProductionOwnersV1 } from "../balance-lab-v1-production";
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
    "bounds a 480-month production-equivalent strategy run",
    () => {
    const start = performance.now();
    const result = runOfflineBalanceLabV1(
      {
        version: "offline-balance-lab-v1",
        experimentId: "performance-480",
        personaIds: ["debt-burdened-v1"],
        matchedSeeds: [7],
        botIds: ["cash-hoarder-v1"],
        horizonMonths: 480,
        difficulty: "normal",
      },
      owners,
    );
    const elapsedMs = performance.now() - start;

    expect(result.runs[0]!.processedMonths).toBeGreaterThan(0);
    expect(result.runs[0]!.processedMonths).toBeLessThanOrEqual(480);
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
