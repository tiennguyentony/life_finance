import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { processMonthlyTurnV2 } from "../../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import { setRecurringStrategy } from "../../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import { fingerprintAnnualTaxContext } from "../../tax/context-cache";
import { RunApiServiceV2 } from "../service-v2";
import {
  buildTaxRequest,
  projectAnnualPretaxContributions,
} from "../v2/tax-orchestrator";

function stateWithStrategy() {
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
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  const state = createNativeGameStateV2({
    runId: "run.tax-projection",
    playerId: "player.tax-projection",
    birthMonth: simulationMonth("1995-03"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "tax-projection",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
    marketRegime: "expansion",
  });
  return setRecurringStrategy(state, {
    schemaVersion: 2,
    id: "strategy.tax-projection",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(0),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  });
}

describe("annual tax contribution projection", () => {
  it("keeps the projected year-end total stable after a monthly contribution", () => {
    const july = stateWithStrategy();
    const julyProjection = projectAnnualPretaxContributions(july);
    const august = {
      ...july,
      currentMonth: simulationMonth("2026-08"),
      gameplay: {
        ...july.gameplay,
        contributions: {
          ...july.gameplay.contributions,
          employee401kCents: moneyCents(50_000),
          hsaCents: moneyCents(20_000),
        },
      },
    };

    expect(julyProjection).toEqual({
      employee401kCents: 300_000,
      hsaCents: 120_000,
    });
    expect(projectAnnualPretaxContributions(august)).toEqual(julyProjection);
  });
});

describe("annual tax context cache", () => {
  it("reuses persisted evidence without calling PolicyEngine", async () => {
    let state = stateWithStrategy();
    const commandId = "month.cached-tax";
    const contextFingerprint = fingerprintAnnualTaxContext(
      buildTaxRequest(state, commandId),
    );
    const cachedEvidence = {
      schemaVersion: 1 as const,
      traceId: "tax.previous-month",
      contextFingerprint,
      economicYear: 2026,
      policyYear: 2026,
      stateCode: "WA",
      filingStatus: "single",
      provider: "PolicyEngine US" as const,
      bundleVersion: "4.21.0",
      rulesVersion: "1.764.6",
      projectedFromFrozenPolicy: false,
      grossIncomeCents: moneyCents(1_000_000),
      employee401kContributionCents: moneyCents(50_000),
      employeeHsaContributionCents: moneyCents(20_000),
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: moneyCents(730_000),
    };
    const calculate = vi.fn();
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadMonthlyTaxEvidenceForCommand: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(
        async (_runId, _secret, fingerprint) => {
          expect(fingerprint).toBe(contextFingerprint);
          return cachedEvidence;
        },
      ),
      loadCheckpointEvidenceV2: vi.fn(),
      applyCommandV2: vi.fn(async (_runId, _secret, command) => {
        if (command.type !== "process_month_v2") {
          throw new Error("expected a monthly command");
        }
        expect(command.payload.taxEvidence.traceId).toBe(
          `tax.cache.${commandId}`,
        );
        const applied = processMonthlyTurnV2(state, command);
        state = applied.state;
        return {
          state,
          stateChecksum: sha256Canonical(state),
          idempotentReplay: false,
          monthlyRecord: applied.record,
        };
      }),
    };
    const service = new RunApiServiceV2(repository, { calculate });

    const response = await service.submitCommand("run-id", "secret", {
      schemaVersion: 2,
      id: commandId,
      type: "process_month",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      payload: {},
    });

    expect(calculate).not.toHaveBeenCalled();
    expect(response.state.revision).toBe(2);
    expect(response.monthlyRecord?.taxTraceId).toBe(`tax.cache.${commandId}`);
  });
});
