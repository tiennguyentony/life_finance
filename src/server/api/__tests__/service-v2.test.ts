import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { resetAnnualFinancialAccumulatorsV2 } from "../../../core/financial-year-v2";
import { processMonthlyTurnV2 } from "../../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import { setRecurringStrategy } from "../../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  taxCalculationResultSchema,
  type TaxCalculationRequest,
} from "../../tax/contracts";
import { fingerprintAnnualTaxContext } from "../../tax/context-cache";
import { commandV2ResponseSchema } from "../contracts-v2";
import { RunApiServiceV2 } from "../service-v2";
import { summarizeMonthlyRecord } from "../v2/monthly-record";
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

  it("builds tax requests from explicit CPI instead of lifestyle spending", () => {
    const initial = stateWithStrategy();
    const state = {
      ...initial,
      finances: {
        ...initial.finances,
        annualLivingCostCents: moneyCents(13_000_000),
      },
      gameplay: {
        ...initial.gameplay,
        market: {
          ...initial.gameplay.market,
          cumulativePriceIndexPpm: 1_234_567,
        },
      },
    };

    expect(buildTaxRequest(state, "month.explicit-cpi").cumulativePriceIndexPpm).toBe(
      1_234_567,
    );

    const { cumulativePriceIndexPpm: _ignored, ...oldMarket } =
      initial.gameplay.market;
    expect(_ignored).toBe(1_000_000);
    const oldState = {
      ...initial,
      gameplay: { ...initial.gameplay, market: oldMarket },
    };
    expect(
      buildTaxRequest(oldState, "month.old-state-cpi")
        .cumulativePriceIndexPpm,
    ).toBe(1_000_000);
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
      migrateRunStateToV2: vi.fn(),
      applyCommandV2: vi.fn(async (_runId, _secret, command) => {
        if (command.type !== "process_month_v2") {
          throw new Error("expected a monthly command");
        }
        expect(command.payload.taxEvidence.traceId).toBe(
          `tax.cache.${commandId}`,
        );
        expect(command.payload).toMatchObject({
          financialKernelVersion: "2.0.0",
          resolvedCashFlows: [],
        });
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
    expect(response.monthlyRecord).toMatchObject({
      financialKernelVersion: "2.0.0",
      taxTraceId: `tax.cache.${commandId}`,
      openingNetWorthCents: expect.any(Number),
      closingNetWorthCents: expect.any(Number),
      openingAutomaticLiquidityCents: expect.any(Number),
      closingAutomaticLiquidityCents: expect.any(Number),
      resolvedIncomeCents: 0,
      resolvedExpenseCents: 0,
      annualInflationIncreaseCents: expect.any(Number),
      monthlyObligationInflationIncreaseCents: expect.any(Number),
      cumulativePriceIndexPpm: expect.any(Number),
      baseNonDebtObligationsCents: expect.any(Number),
      fundingPlan: {
        requiredCashCents: expect.any(Number),
        cashAvailableCents: expect.any(Number),
        cashUsedCents: expect.any(Number),
        taxableLiquidations: expect.any(Array),
        grossLiquidationCents: expect.any(Number),
        liquidationCostCents: expect.any(Number),
        netLiquidationProceedsCents: expect.any(Number),
        remainingCreditCents: expect.any(Number),
        creditUsedCents: expect.any(Number),
        residualShortfallCents: expect.any(Number),
        fullyFunded: true,
      },
      shortfall: null,
    });
    if (!response.monthlyRecord) {
      throw new Error("expected a summarized monthly record");
    }
    if (!("fundingPlan" in response.monthlyRecord)) {
      throw new Error("expected new-kernel monthly evidence");
    }
    expect(() =>
      commandV2ResponseSchema.parse({
        ...response,
        monthlyRecord: {
          ...response.monthlyRecord,
          ignoredKernelEvidence: true,
        },
      }),
    ).toThrow();
    const {
      fundingPlan: removedFundingPlan,
      ...incompleteKernelSummary
    } = response.monthlyRecord;
    expect(removedFundingPlan).toBeDefined();
    expect(() =>
      commandV2ResponseSchema.parse({
        ...response,
        monthlyRecord: incompleteKernelSummary,
      }),
    ).toThrow();
  });
});

describe("annual tax year rollover", () => {
  it("plans January payroll from reset contribution accumulators", async () => {
    const priorYear = stateWithStrategy();
    const snapshot = priorYear.gameplay.catalogSnapshot;
    if (!snapshot || snapshot.derived.hsaAnnualContributionLimitCents === null) {
      throw new Error("expected a native HSA-eligible scenario");
    }
    let state: ReturnType<typeof stateWithStrategy> = {
      ...priorYear,
      currentMonth: simulationMonth("2027-01"),
      gameplay: {
        ...priorYear.gameplay,
        contributions: {
          ...priorYear.gameplay.contributions,
          policyYear: 2026,
          employee401kCents:
            snapshot.selected.benefitPolicy
              .employeeRetirementContributionLimitCents,
          hsaCents: snapshot.derived.hsaAnnualContributionLimitCents,
        },
      },
    };
    const openingState = state;
    const commandId = "month.january-rollover";
    const expectedContextFingerprint = fingerprintAnnualTaxContext(
      buildTaxRequest(
        resetAnnualFinancialAccumulatorsV2(openingState),
        commandId,
      ),
    );
    const calculate = vi.fn(async (request: TaxCalculationRequest) =>
      taxCalculationResultSchema.parse({
        schemaVersion: 1,
        traceId: request.traceId,
        economicYear: request.economicYear,
        policyYear: request.policyYear,
        stateCode: request.stateCode,
        filingStatus: request.filingStatus,
        annualGrossIncomeCents: 12_000_000,
        federalIncomeTaxCents: 1_000_000,
        stateIncomeTaxCents: 0,
        employeePayrollTaxCents: 200_000,
        selfEmploymentTaxCents: 0,
        totalTaxCents: 1_200_000,
        afterTaxIncomeCents: 10_800_000,
        effectiveTaxRatePpm: 100_000,
        componentsCents: {},
        model: {
          provider: "PolicyEngine US",
          bundleVersion: POLICYENGINE_BUNDLE_VERSION,
          rulesVersion: POLICYENGINE_US_VERSION,
          projectedFromFrozenPolicy: true,
        },
        disclaimer:
          "Educational estimate only; not tax, legal, or financial advice.",
      }),
    );
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadMonthlyTaxEvidenceForCommand: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(
        async (_runId, _secret, fingerprint) => {
          expect(fingerprint).toBe(expectedContextFingerprint);
          return null;
        },
      ),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2: vi.fn(),
      applyCommandV2: vi.fn(async (_runId, _secret, command) => {
        if (command.type !== "process_month_v2") {
          throw new Error("expected a monthly command");
        }
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

    expect(response.state.gameplay.contributions).toMatchObject({
      policyYear: 2027,
      employee401kCents: moneyCents(50_000),
      hsaCents: moneyCents(20_000),
    });
    expect(calculate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0]?.[0].people[0]?.income.w2Jobs[0]).toMatchObject({
      pretaxRetirementContributionsCents: 600_000,
      pretaxHealthContributionsCents: 240_000,
    });
    expect(openingState.gameplay.contributions).toMatchObject({
      policyYear: 2026,
      employee401kCents:
        snapshot.selected.benefitPolicy
          .employeeRetirementContributionLimitCents,
      hsaCents: snapshot.derived.hsaAnnualContributionLimitCents,
    });
  });
});

describe("monthly record response compatibility", () => {
  it("summarizes and validates a historical record without invented kernel evidence", () => {
    const initial = stateWithStrategy();
    const legacy = processMonthlyTurnV2(initial, {
      schemaVersion: 2,
      id: "month.legacy-summary",
      type: "process_month_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.legacy-summary",
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
    });
    const monthlyRecord = summarizeMonthlyRecord(legacy.record);
    const parsed = commandV2ResponseSchema.parse({
      state: legacy.state,
      stateChecksum: sha256Canonical(legacy.state),
      idempotentReplay: false,
      monthlyRecord,
    });

    expect(monthlyRecord).not.toHaveProperty("financialKernelVersion");
    expect(monthlyRecord).not.toHaveProperty("fundingPlan");
    expect(parsed.monthlyRecord).toEqual(monthlyRecord);
  });

  it("validates the actual typed new-kernel shortfall evidence", () => {
    const initial = stateWithStrategy();
    const result = processMonthlyTurnV2(initial, {
      schemaVersion: 2,
      id: "month.kernel-shortfall-summary",
      type: "process_month_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        financialKernelVersion: "2.0.0",
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.kernel-shortfall-summary",
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
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(10_000_000),
          covered: false,
        },
        resolvedCashFlows: [],
      },
    });
    const monthlyRecord = summarizeMonthlyRecord(result.record);
    const response = {
      state: result.state,
      stateChecksum: sha256Canonical(result.state),
      idempotentReplay: false,
      monthlyRecord,
    };

    expect(commandV2ResponseSchema.parse(response).monthlyRecord).toMatchObject({
      financialKernelVersion: "2.0.0",
      fundingPlan: { fullyFunded: false },
      shortfall: {
        residualShortfallCents: expect.any(Number),
        fundingPlan: { fullyFunded: false },
        netWorthCents: expect.any(Number),
        automaticLiquidityCents: expect.any(Number),
      },
      outcome: { kind: "bankruptcy" },
    });
    if (!("shortfall" in monthlyRecord) || !monthlyRecord.shortfall) {
      throw new Error("expected shortfall evidence");
    }
    expect(() =>
      commandV2ResponseSchema.parse({
        ...response,
        monthlyRecord: {
          ...monthlyRecord,
          shortfall: {
            ...monthlyRecord.shortfall,
            ignoredShortfallField: true,
          },
        },
      }),
    ).toThrow();
  });
});

describe("authenticated v1-to-v2 migration", () => {
  it("returns the repository migration result", async () => {
    const migratedState = stateWithStrategy();
    const migrateRunStateToV2 = vi.fn(async () => ({
      state: migratedState,
      stateChecksum: sha256Canonical(migratedState),
      idempotentReplay: false,
    }));
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(),
      applyCommandV2: vi.fn(),
      loadMonthlyTaxEvidenceForCommand: vi.fn(),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2,
    };
    const service = new RunApiServiceV2(repository, { calculate: vi.fn() });

    await expect(
      service.migrateRun("run-id", "access-secret"),
    ).resolves.toEqual({
      state: migratedState,
      stateChecksum: sha256Canonical(migratedState),
      idempotentReplay: false,
    });
    expect(migrateRunStateToV2).toHaveBeenCalledWith("run-id", "access-secret");
  });

  it("preserves an idempotent migration replay", async () => {
    const migratedState = stateWithStrategy();
    const migrateRunStateToV2 = vi.fn(async () => ({
      state: migratedState,
      stateChecksum: sha256Canonical(migratedState),
      idempotentReplay: true,
    }));
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(),
      applyCommandV2: vi.fn(),
      loadMonthlyTaxEvidenceForCommand: vi.fn(),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2,
    };
    const service = new RunApiServiceV2(repository, { calculate: vi.fn() });

    await expect(
      service.migrateRun("run-id", "access-secret"),
    ).resolves.toMatchObject({
      state: migratedState,
      idempotentReplay: true,
    });
  });
});
