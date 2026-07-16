import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { buildPlayerPolicyCommandPreviewV2 } from "../../../core/action-preview-v2";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { resetAnnualFinancialAccumulatorsV2 } from "../../../core/financial-year-v2";
import { reduceDetailedFinanceCommand } from "../../../core/detailed-actions-v2";
import {
  processMonthlyTurnV2,
  type ProcessMonthV2Command,
} from "../../../core/monthly-turn-v2";
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
import { reduceGameCommandV2 } from "../../db/run-repository-support";
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

describe("player policy preview integration", () => {
  it("maps, reduces, and reports the exact approvable action without writing", async () => {
    let state = stateWithStrategy();
    const applyCommandV2 = vi.fn(async (_runId, _secret, command) => {
      if (command.type !== "take_detailed_action") {
        throw new Error("expected a detailed action");
      }
      state = reduceDetailedFinanceCommand(state, command);
      return {
        state,
        stateChecksum: sha256Canonical(state),
        idempotentReplay: false,
        monthlyRecord: null,
      };
    });
    const previewPlayerPolicyCommand = vi.fn(
      async (_runId, _secret, command) =>
        buildPlayerPolicyCommandPreviewV2(
          state,
          command,
          reduceGameCommandV2(state, command).state,
        ),
    );
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedMonthlyCommandV2: vi.fn(),
      loadMonthlyTaxEvidenceForCommand: vi.fn(),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2: vi.fn(),
      previewPlayerPolicyCommandV2: previewPlayerPolicyCommand,
      applyCommandV2,
    };
    const service = new RunApiServiceV2(repository, { calculate: vi.fn() });
    const command = {
      schemaVersion: 2 as const,
      id: "action.preview-service",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      type: "take_detailed_action" as const,
      payload: {
        action: {
          type: "invest_taxable" as const,
          bucket: "taxableBroadIndexCents" as const,
          amountCents: 100_000,
        },
      },
    };
    const openingChecksum = sha256Canonical(state);

    const preview = await service.previewPlayerPolicyCommand(
      "run-id",
      "secret",
      command,
    );

    expect(applyCommandV2).not.toHaveBeenCalled();
    expect(sha256Canonical(state)).toBe(openingChecksum);
    expect(preview).toMatchObject({
      actionPolicyVersion: "1.0.0",
      openingStateChecksum: openingChecksum,
      effects: {
        cashChangeCents: -100_000,
        automaticLiquidityChangeCents: -1_000,
      },
    });
    const internal = previewPlayerPolicyCommand.mock.calls[0]?.[2];
    expect(internal).toMatchObject({
      payload: { actionPolicyVersion: "1.0.0" },
    });

    const applied = await service.submitCommand("run-id", "secret", command);
    expect(applied.stateChecksum).toBe(preview.resultingStateChecksum);
    expect(applied.state.revision).toBe(preview.resultingRevision);
  });

  it("replays the exact accepted historical action after server policy ownership changes", async () => {
    const state = stateWithStrategy();
    const storedHistoricalCommand: Parameters<
      typeof reduceDetailedFinanceCommand
    >[1] = {
      schemaVersion: 2,
      id: "action.historical-liquidation",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      type: "take_detailed_action",
      payload: {
        action: {
          type: "liquidate_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: moneyCents(50_000),
          liquidationCostRatePpm: ratePpm(123_456),
        },
      },
    };
    const applyCommandV2 = vi.fn(async (_runId, _secret, command) => {
      expect(command).toEqual(storedHistoricalCommand);
      return {
        state,
        stateChecksum: sha256Canonical(state),
        idempotentReplay: true,
        monthlyRecord: null,
      };
    });
    const previewPlayerPolicyCommandV2 = vi.fn();
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedCommandV2: vi.fn(async () => storedHistoricalCommand),
      loadAcceptedMonthlyCommandV2: vi.fn(),
      loadMonthlyTaxEvidenceForCommand: vi.fn(),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2: vi.fn(),
      previewPlayerPolicyCommandV2,
      applyCommandV2,
    };
    const service = new RunApiServiceV2(repository, { calculate: vi.fn() });

    const response = await service.submitCommand("run-id", "secret", {
      schemaVersion: 2,
      id: storedHistoricalCommand.id,
      expectedRevision: storedHistoricalCommand.expectedRevision,
      effectiveMonth: storedHistoricalCommand.effectiveMonth,
      type: "take_detailed_action",
      payload: {
        action: {
          type: "liquidate_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: 50_000,
          liquidationCostRatePpm: 123_456,
        },
      },
    });

    expect(response.idempotentReplay).toBe(true);
    expect(applyCommandV2).toHaveBeenCalledOnce();
    await expect(
      service.submitCommand("run-id", "secret", {
        schemaVersion: 2,
        id: "action.new-client-owned-rate",
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "take_detailed_action",
        payload: {
          action: {
            type: "liquidate_taxable",
            bucket: "taxableBroadIndexCents",
            amountCents: 50_000,
            liquidationCostRatePpm: 123_456,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_RATE" });
    await expect(
      service.previewPlayerPolicyCommand("run-id", "secret", {
        schemaVersion: 2,
        id: "action.preview-client-owned-rate",
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "take_detailed_action",
        payload: {
          action: {
            type: "liquidate_taxable",
            bucket: "taxableBroadIndexCents",
            amountCents: 50_000,
            liquidationCostRatePpm: 123_456,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_RATE" });
    expect(applyCommandV2).toHaveBeenCalledOnce();
    expect(previewPlayerPolicyCommandV2).not.toHaveBeenCalled();
  });
});

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
      loadAcceptedMonthlyCommandV2: vi.fn(),
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

describe("historical monthly command retries", () => {
  it("reuses the exact strictly loaded legacy command instead of rebuilding current kernel content", async () => {
    const opening = stateWithStrategy();
    const storedLegacyCommand = {
      schemaVersion: 2 as const,
      id: "month.legacy-retry",
      type: "process_month_v2" as const,
      expectedRevision: opening.revision,
      effectiveMonth: opening.currentMonth,
      payload: {
        taxEvidence: {
          schemaVersion: 1 as const,
          traceId: "tax.legacy-retry",
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
        },
        taxableLiquidationCostRatePpm: ratePpm(10_000),
      },
    };
    const historical = processMonthlyTurnV2(opening, storedLegacyCommand, {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 0,
        minimumDurationMonths: 1,
        maximumDurationMonths: 1,
      },
    });
    const loadAcceptedMonthlyCommandV2 = vi.fn(
      async () => storedLegacyCommand,
    );
    const calculate = vi.fn();
    const applyCommandV2 = vi.fn(async (_runId, _secret, command) => {
      expect(command).toBe(storedLegacyCommand);
      return {
        state: historical.state,
        stateChecksum: sha256Canonical(historical.state),
        idempotentReplay: true,
        monthlyRecord: historical.record,
      };
    });
    const repository = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => historical.state),
      loadAcceptedMonthlyCommandV2,
      loadMonthlyTaxEvidenceForCommand: vi.fn(
        async () => storedLegacyCommand.payload.taxEvidence,
      ),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2: vi.fn(),
      applyCommandV2,
    };
    const service = new RunApiServiceV2(repository, { calculate });

    const response = await service.submitCommand("run-id", "secret", {
      schemaVersion: 2,
      id: storedLegacyCommand.id,
      type: "process_month",
      expectedRevision: storedLegacyCommand.expectedRevision,
      effectiveMonth: storedLegacyCommand.effectiveMonth,
      payload: {},
    });

    expect(loadAcceptedMonthlyCommandV2).toHaveBeenCalledWith(
      "run-id",
      "secret",
      storedLegacyCommand.id,
    );
    expect(applyCommandV2).toHaveBeenCalledOnce();
    expect(calculate).not.toHaveBeenCalled();
    expect(response.idempotentReplay).toBe(true);

    await expect(
      service.submitCommand("run-id", "secret", {
        schemaVersion: 2,
        id: storedLegacyCommand.id,
        type: "process_month",
        expectedRevision: storedLegacyCommand.expectedRevision + 1,
        effectiveMonth: storedLegacyCommand.effectiveMonth,
        payload: {},
      }),
    ).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(applyCommandV2).toHaveBeenCalledOnce();
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
      loadAcceptedMonthlyCommandV2: vi.fn(),
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
  it("integrates service policy stamping, the monthly reducer, and the strict rich terminal response", async () => {
    const younger = stateWithStrategy();
    let state: ReturnType<typeof stateWithStrategy> = {
      ...younger,
      player: {
        ...younger.player,
        birthMonth: simulationMonth("1961-01"),
      },
    };
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
    const applyCommandV2 = vi.fn(async (_runId, _secret, command) => {
      if (command.type !== "process_month_v2") {
        throw new Error("expected a monthly command");
      }
      expect(command.payload.outcomePolicyVersion).toBe("1.0.0");
      const applied = processMonthlyTurnV2(state, command);
      state = applied.state;
      return {
        state,
        stateChecksum: sha256Canonical(state),
        idempotentReplay: false,
        monthlyRecord: applied.record,
      };
    });
    const repository: ConstructorParameters<typeof RunApiServiceV2>[0] = {
      createRunV2: vi.fn(),
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedMonthlyCommandV2: vi.fn(),
      loadMonthlyTaxEvidenceForCommand: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(async () => null),
      loadCheckpointEvidenceV2: vi.fn(),
      migrateRunStateToV2: vi.fn(),
      applyCommandV2,
    };
    const service = new RunApiServiceV2(repository, { calculate });

    const response = await service.submitCommand("run-id", "secret", {
      schemaVersion: 2,
      id: "month.rich-retirement-response",
      type: "process_month",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      payload: {},
    });

    expect(applyCommandV2).toHaveBeenCalledOnce();
    expect(response.state.outcome).toMatchObject({
      outcomePolicyVersion: "1.0.0",
      kind: "retirement_age",
      reasonCode: "configured_retirement_age_reached",
      retirementReadiness: {
        retirementAgeYears: 65,
        reachedRetirementAge: true,
      },
    });
    expect(response.monthlyRecord).toMatchObject({
      outcomePolicyVersion: "1.0.0",
      outcome: response.state.outcome,
    });
  });

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
      loadAcceptedMonthlyCommandV2: vi.fn(),
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
      loadAcceptedMonthlyCommandV2: vi.fn(),
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

describe("atomic time advance orchestration", () => {
  const calmControllerDependencies = Object.freeze({
    eventSchedulingPolicy: Object.freeze({
      version: "fairness-v1" as const,
      minimumChancePpm: 0,
      maximumChancePpm: 0,
    }),
    macroStoryPolicy: Object.freeze({
      version: "macro-story-v1" as const,
      monthlyChancePpm: 0,
      minimumDurationMonths: 1,
      maximumDurationMonths: 1,
    }),
  });

  function cachedTaxEvidence(commandId: string) {
    const state = stateWithStrategy();
    return {
      schemaVersion: 1 as const,
      traceId: `tax.cache.${commandId}`,
      contextFingerprint: fingerprintAnnualTaxContext(
        buildTaxRequest(state, commandId),
      ),
      economicYear: 2026,
      policyYear: 2026,
      stateCode: "WA",
      filingStatus: "single",
      provider: "PolicyEngine US" as const,
      bundleVersion: POLICYENGINE_BUNDLE_VERSION,
      rulesVersion: POLICYENGINE_US_VERSION,
      projectedFromFrozenPolicy: false,
      grossIncomeCents: moneyCents(1_000_000),
      employee401kContributionCents: moneyCents(50_000),
      employeeHsaContributionCents: moneyCents(20_000),
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: moneyCents(730_000),
    };
  }

  it("authorizes before tax evidence lookup or batch persistence", async () => {
    const loadMonthlyTaxEvidenceForContext = vi.fn();
    const applyTimeAdvanceV2 = vi.fn();
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => {
        throw new Error("unauthorized");
      }),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext,
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const calculate = vi.fn();
    const service = new RunApiServiceV2(repository, { calculate });

    await expect(
      service.advanceTime("run-id", "bad-secret", {
        schemaVersion: 2,
        id: "advance.unauthorized",
        expectedRevision: 1,
        effectiveMonth: "2026-07",
        maxMonths: 1,
        mode: { kind: "one_month" },
      }),
    ).rejects.toThrow("unauthorized");

    expect(loadMonthlyTaxEvidenceForContext).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
    expect(applyTimeAdvanceV2).not.toHaveBeenCalled();
  });

  it("performs no tax lookup for an explicit zero-month stop", async () => {
    const state = stateWithStrategy();
    const applyTimeAdvanceV2 = vi.fn(async (_runId, _secret, prepared) => ({
      ...prepared.controllerResult,
      stateChecksum: prepared.finalStateChecksum,
      idempotentReplay: false,
    }));
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(),
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const calculate = vi.fn();
    const service = new RunApiServiceV2(repository, { calculate });

    const result = await service.advanceTime("run-id", "secret", {
      schemaVersion: 2,
      id: "advance.stop",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 12,
      mode: { kind: "stop" },
    });

    expect(result.monthsAdvanced).toBe(0);
    expect(result.pauseReason).toEqual({ kind: "explicit_user_stop" });
    expect(repository.loadMonthlyTaxEvidenceForContext).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
    expect(applyTimeAdvanceV2).toHaveBeenCalledOnce();
  });

  it("reuses one tax-context lookup and persists one atomic three-month batch", async () => {
    const state = stateWithStrategy();
    const cached = cachedTaxEvidence("advance.three.month.1");
    const loadMonthlyTaxEvidenceForContext = vi.fn(async () => cached);
    const applyTimeAdvanceV2 = vi.fn(async (_runId, _secret, prepared) => ({
      ...prepared.controllerResult,
      stateChecksum: prepared.finalStateChecksum,
      idempotentReplay: false,
    }));
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext,
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const calculate = vi.fn();
    const service = new RunApiServiceV2(
      repository,
      { calculate },
      undefined,
      calmControllerDependencies,
    );

    const result = await service.advanceTime("run-id", "secret", {
      schemaVersion: 2,
      id: "advance.three",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 3,
      mode: { kind: "months", months: 3 },
    });

    expect(result.monthsAdvanced).toBe(3);
    expect(result.pauseReason).toEqual({
      kind: "requested_duration",
      requestedMonths: 3,
    });
    expect(loadMonthlyTaxEvidenceForContext).toHaveBeenCalledOnce();
    expect(calculate).not.toHaveBeenCalled();
    expect(applyTimeAdvanceV2).toHaveBeenCalledOnce();
    const prepared = applyTimeAdvanceV2.mock.calls[0]![2];
    const originalRequest = {
      schemaVersion: 2,
      id: "advance.three",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 3,
      mode: { kind: "months", months: 3 },
    };
    expect(prepared).toMatchObject({
      controllerVersion: "time-controller-v2.0.0",
      engineVersion: state.engineVersion,
      request: originalRequest,
      requestFingerprint: sha256Canonical(originalRequest),
    });
    expect(prepared.steps).toHaveLength(3);
    expect(
      prepared.steps.map(
        (step: { command: ProcessMonthV2Command }) => step.command.id,
      ),
    ).toEqual([
      "advance.three.month.1",
      "advance.three.month.2",
      "advance.three.month.3",
    ]);
    expect(
      new Set(
        prepared.steps.map(
          (step: { command: ProcessMonthV2Command }) =>
            step.command.payload.taxEvidence.traceId,
        ),
      ).size,
    ).toBe(3);
  });

  it("does not let a checkpoint bypass resume-decision validation", async () => {
    const state = stateWithStrategy();
    const cached = cachedTaxEvidence("advance.invalid-resume.month.1");
    const applyTimeAdvanceV2 = vi.fn();
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(async () => cached),
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const service = new RunApiServiceV2(
      repository,
      { calculate: vi.fn() },
      undefined,
      calmControllerDependencies,
    );

    await expect(
      service.advanceTime("run-id", "secret", {
        schemaVersion: 2,
        id: "advance.invalid-resume",
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        maxMonths: 3,
        mode: {
          kind: "resume",
          resolvedDecisionId: "decision.not-accepted",
          months: 3,
        },
        checkpointIntervalMonths: 3,
      }),
    ).rejects.toThrow("latest resolved event or milestone decision");
    expect(applyTimeAdvanceV2).not.toHaveBeenCalled();
  });

  it("crosses a tax-year fingerprint boundary without splitting the public batch", async () => {
    const july = stateWithStrategy();
    const state = {
      ...july,
      currentMonth: simulationMonth("2026-12"),
    };
    const loadMonthlyTaxEvidenceForContext = vi.fn(async () => null);
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
          projectedFromFrozenPolicy: false,
        },
        disclaimer:
          "Educational estimate only; not tax, legal, or financial advice.",
      }),
    );
    const applyTimeAdvanceV2 = vi.fn(async (_runId, _secret, prepared) => ({
      ...prepared.controllerResult,
      stateChecksum: prepared.finalStateChecksum,
      idempotentReplay: false,
    }));
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext,
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const service = new RunApiServiceV2(
      repository,
      { calculate },
      undefined,
      calmControllerDependencies,
    );

    const result = await service.advanceTime("run-id", "secret", {
      schemaVersion: 2,
      id: "advance.year-boundary",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 2,
      mode: { kind: "months", months: 2 },
    });

    expect(result.monthsAdvanced).toBe(2);
    expect(result.pauseReason).toEqual({
      kind: "requested_duration",
      requestedMonths: 2,
    });
    expect(loadMonthlyTaxEvidenceForContext).toHaveBeenCalledTimes(2);
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(applyTimeAdvanceV2).toHaveBeenCalledOnce();
    expect(applyTimeAdvanceV2.mock.calls[0]![2].steps).toHaveLength(2);

    const checkpoint = await service.advanceTime("run-id", "secret", {
      schemaVersion: 2,
      id: "advance.year-boundary-checkpoint",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 2,
      mode: { kind: "months", months: 2 },
      checkpointIntervalMonths: 2,
    });
    expect(checkpoint.pauseReason).toEqual({
      kind: "periodic_checkpoint",
      checkpointMonth: "2027-02",
    });
    expect(checkpoint.checkpointInput).toMatchObject({
      evidenceVersion: "checkpoint-v2.1",
      monthsProcessed: 2,
    });
    expect(applyTimeAdvanceV2).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh tax segment after a pending career salary increase completes", async () => {
    const configured = stateWithStrategy();
    const state = reduceDetailedFinanceCommand(configured, {
      schemaVersion: 2,
      id: "action.upskill.tax-segment",
      type: "take_detailed_action",
      expectedRevision: configured.revision,
      effectiveMonth: configured.currentMonth,
      payload: {
        action: { type: "start_upskill", programId: "upskill.certificate" },
      },
    });
    const calculate = vi.fn(async (request: TaxCalculationRequest) => {
      const annualGrossIncomeCents =
        request.people[0]?.income.w2Jobs[0]?.wagesCents ?? 0;
      const totalTaxCents = annualGrossIncomeCents / 10;
      return taxCalculationResultSchema.parse({
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
        afterTaxIncomeCents: annualGrossIncomeCents - totalTaxCents,
        effectiveTaxRatePpm: 100_000,
        componentsCents: {},
        model: {
          provider: "PolicyEngine US",
          bundleVersion: POLICYENGINE_BUNDLE_VERSION,
          rulesVersion: POLICYENGINE_US_VERSION,
          projectedFromFrozenPolicy: false,
        },
        disclaimer:
          "Educational estimate only; not tax, legal, or financial advice.",
      });
    });
    const applyTimeAdvanceV2 = vi.fn(async (_runId, _secret, prepared) => ({
      ...prepared.controllerResult,
      stateChecksum: prepared.finalStateChecksum,
      idempotentReplay: false,
    }));
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => state),
      loadAcceptedTimeAdvanceV2: vi.fn(async () => null),
      loadMonthlyTaxEvidenceForContext: vi.fn(async () => null),
      applyTimeAdvanceV2,
    } as unknown as ConstructorParameters<typeof RunApiServiceV2>[0];
    const service = new RunApiServiceV2(
      repository,
      { calculate },
      undefined,
      calmControllerDependencies,
    );

    const result = await service.advanceTime("run-id", "secret", {
      schemaVersion: 2,
      id: "advance.salary-transition",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      maxMonths: 4,
      mode: { kind: "months", months: 4 },
    });

    expect(result.monthsAdvanced).toBe(4);
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(
      calculate.mock.calls.map(
        ([request]) => request.people[0]?.income.w2Jobs[0]?.wagesCents,
      ),
    ).toEqual([12_000_000, 12_300_000]);
    const prepared = applyTimeAdvanceV2.mock.calls[0]![2];
    expect(prepared.steps[2]?.record.grossIncomeCents).toBe(1_000_000);
    expect(prepared.steps[3]?.record.grossIncomeCents).toBe(1_025_000);
  });
});
