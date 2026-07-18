import { describe, expect, it, vi } from "vitest";

import { buildTaxRequest } from "../../server/api/tax-orchestrator";
import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  type TaxCalculationResult,
} from "../../server/tax/contracts";
import {
  BALANCE_LAB_PERSONA_IDS_V1,
  createBalanceLabPersonaStateV1,
} from "../../data/balance-lab-personas-v1";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import type { PersonalEventTemplateV2 } from "../../core/personal-event-v2";
import { ratePpm } from "../../core/domain/money";
import { sha256Canonical } from "../../core/canonical";
import {
  BALANCE_LAB_PRODUCTION_PORTS_V1,
  bankruptcyResidualShortfallCentsV1,
  createBalanceLabProductionOwnersV1,
  measureRecoveryObservationsV1,
} from "../balance-lab-v1-production";
import { runOfflineBalanceLabV1 } from "../balance-lab-v1-runner";
import type { BalanceLabTaxEvidenceSourceV1 } from "../balance-lab-v1-tax-evidence";
import { buildMonthlyTaxEvidenceFromPolicyEngineV1 } from "../../server/api/tax-orchestrator";

function testTaxSource(): BalanceLabTaxEvidenceSourceV1 {
  return Object.freeze({
    version: "quick-tax-fixture-v1",
    limitation: "Test-only exact calculated-result fixture; not release tuning evidence.",
    evidenceFingerprint: () => sha256Canonical("test-tax-source"),
    getEvidence: (state, commandId) => {
      const request = buildTaxRequest(state, commandId);
      const totalTaxCents = 2_400_000;
      const result: TaxCalculationResult = {
        schemaVersion: 1,
        traceId: request.traceId,
        economicYear: request.economicYear,
        policyYear: request.policyYear,
        stateCode: request.stateCode,
        filingStatus: request.filingStatus,
        annualGrossIncomeCents: state.gameplay.employment.status === "employed"
          ? state.gameplay.employment.annualGrossSalaryCents
          : 0,
        federalIncomeTaxCents: totalTaxCents,
        stateIncomeTaxCents: 0,
        employeePayrollTaxCents: 0,
        selfEmploymentTaxCents: 0,
        totalTaxCents,
        afterTaxIncomeCents: 9_600_000,
        effectiveTaxRatePpm: 200_000,
        componentsCents: { federal_income_tax: totalTaxCents },
        model: {
          provider: "PolicyEngine US",
          bundleVersion: POLICYENGINE_BUNDLE_VERSION,
          rulesVersion: POLICYENGINE_US_VERSION,
          projectedFromFrozenPolicy: false,
        },
        disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
      };
      return buildMonthlyTaxEvidenceFromPolicyEngineV1(
        state,
        commandId,
        { kind: "calculated", result },
      );
    },
  });
}

describe("offline balance lab production owners", () => {
  it("initializes every declared persona inside its selected scenario bounds", () => {
    for (const personaId of BALANCE_LAB_PERSONA_IDS_V1) {
      const state = createBalanceLabPersonaStateV1({
        personaId,
        matchedSeed: 1,
        difficulty: "guided",
      });
      const scenario = state.gameplay.catalogSnapshot!.selected.scenario;
      expect(state.finances.cashCents).toBeGreaterThanOrEqual(
        scenario.minimumStartingCashCents,
      );
      expect(state.finances.cashCents).toBeLessThanOrEqual(
        scenario.maximumStartingCashCents,
      );
    }
  });

  it("integrates the real strategy, Time Controller, monthly, market, event, director, balance, lifecycle, and goal owners", () => {
    const ports = {
      ...BALANCE_LAB_PRODUCTION_PORTS_V1,
      setStrategy: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.setStrategy),
      takeAction: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.takeAction),
      advanceTime: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.advanceTime),
      resolveEvent: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.resolveEvent),
      projectGoal: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.projectGoal),
      calculateNetWorth: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.calculateNetWorth),
      calculateAutomaticLiquidity: vi.fn(
        BALANCE_LAB_PRODUCTION_PORTS_V1.calculateAutomaticLiquidity,
      ),
    };
    const result = runOfflineBalanceLabV1(
      {
        version: "offline-balance-lab-v1",
        experimentId: "production-owners",
        personaIds: ["healthy-v1"],
        matchedSeeds: [42],
        botIds: ["disciplined-v1", "cash-hoarder-v1"],
        horizonMonths: 2,
        difficulty: "normal",
      },
      createBalanceLabProductionOwnersV1({
        createPersonaState: createBalanceLabPersonaStateV1,
        taxEvidence: testTaxSource(),
        ports,
      }),
    );

    expect(result.runs).toHaveLength(2);
    expect(ports.setStrategy).toHaveBeenCalledTimes(2);
    expect(ports.takeAction).toHaveBeenCalledTimes(2);
    expect(ports.advanceTime).toHaveBeenCalledTimes(4);
    expect(ports.projectGoal).toHaveBeenCalledTimes(2);
    expect(ports.calculateNetWorth).toHaveBeenCalledTimes(2);
    expect(ports.calculateAutomaticLiquidity.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.runs[0]!.worldEvidence).toEqual(result.runs[1]!.worldEvidence);
    expect(result.runs.every((run) => run.processedMonths === 2)).toBe(true);
    expect(result.runs.every((run) => run.botIntents.length >= 2)).toBe(true);
  });

  it("measures observed liquidity recovery and only labels production shortfall bankruptcy unavoidable", () => {
    const records = [
      {
        closingAutomaticLiquidityCents: 80,
        resolvedEvent: {
          monthIndex: 0,
          classification: "negative" as const,
          playerCostCents: 20,
          baselineLiquidityCents: 100,
        },
        shortfall: null,
      },
      { closingAutomaticLiquidityCents: 90, shortfall: null },
      {
        closingAutomaticLiquidityCents: 105,
        resolvedEvent: {
          monthIndex: 2,
          classification: "negative" as const,
          playerCostCents: 10,
          baselineLiquidityCents: 120,
        },
        shortfall: null,
      },
    ];

    expect(measureRecoveryObservationsV1(records)).toEqual([
      { eventMonthIndex: 0, status: "recovered", observedMonths: 2 },
      { eventMonthIndex: 2, status: "censored", observedMonths: 0 },
    ]);
    expect(bankruptcyResidualShortfallCentsV1("active", records)).toBe(0);
    expect(bankruptcyResidualShortfallCentsV1("bankruptcy", [
      { shortfall: { residualShortfallCents: 1 } },
    ])).toBe(1);
    expect(bankruptcyResidualShortfallCentsV1("bankruptcy", [
      { shortfall: null },
    ])).toBe(0);
  });

  it("schedules, approves, and resolves a custom large event through the exact supplied catalog", () => {
    const medical = PERSONAL_EVENT_TEMPLATES_V2.find(
      ({ id }) => id === "personal.medical_bill",
    )!;
    const customLarge = Object.freeze({
      ...medical,
      id: "personal.custom_large_bill",
      severityTier: "large",
      hazard: Object.freeze({
        ...medical.hazard,
        baseChancePpm: ratePpm(1_000_000),
        minimumChancePpm: ratePpm(1_000_000),
        maximumChancePpm: ratePpm(1_000_000),
      }),
      pressureCost: 4,
      recovery: Object.freeze({ durationMonths: 4 }),
      cooldowns: Object.freeze({
        ...medical.cooldowns,
        eventMonths: 8,
      }),
      fallbackNarrative: Object.freeze({
        headline: "A custom major bill arrived",
        body: "The supplied catalog owns this deterministic test event.",
      }),
    }) as PersonalEventTemplateV2;
    const ports = {
      ...BALANCE_LAB_PRODUCTION_PORTS_V1,
      resolveEvent: vi.fn(BALANCE_LAB_PRODUCTION_PORTS_V1.resolveEvent),
    };

    const result = runOfflineBalanceLabV1(
      {
        version: "offline-balance-lab-v1",
        experimentId: "custom-large-resolution",
        personaIds: ["healthy-v1"],
        matchedSeeds: [9],
        botIds: ["disciplined-v1"],
        horizonMonths: 1,
        difficulty: "normal",
      },
      createBalanceLabProductionOwnersV1({
        createPersonaState: createBalanceLabPersonaStateV1,
        taxEvidence: testTaxSource(),
        ports,
        personalEventCatalog: [customLarge],
      }),
    );

    expect(ports.resolveEvent).toHaveBeenCalledTimes(1);
    expect(result.runs[0]!.metrics.eventCountByTier.large).toBe(1);
    expect(result.runs[0]!.metrics.eventDecisionEvidence).toEqual([
      expect.objectContaining({
        templateId: "personal.custom_large_bill",
        choiceId: "pay_uninsured",
        availableChoiceIds: expect.arrayContaining(["pay_uninsured", "use_insurance"]),
      }),
    ]);
    expect(result.runs[0]!.metrics.recoveryObservations).toEqual([
      expect.objectContaining({ status: "censored" }),
    ]);
  });

  it("records the authoritative beginner checkpoint after twelve processed months", () => {
    const result = runOfflineBalanceLabV1(
      {
        version: "offline-balance-lab-v1",
        experimentId: "beginner-checkpoint-evidence",
        personaIds: ["healthy-v1"],
        matchedSeeds: [17],
        botIds: ["disciplined-v1"],
        horizonMonths: 12,
        difficulty: "guided",
      },
      createBalanceLabProductionOwnersV1({
        createPersonaState: createBalanceLabPersonaStateV1,
        taxEvidence: testTaxSource(),
      }),
    );

    expect(result.runs[0]!.processedMonths).toBe(12);
    expect(result.runs[0]!.metrics.beginnerChapterEvidence).toMatchObject({
      observedMonths: 12,
      completed: expect.any(Boolean),
      outcome: expect.stringMatching(/^(fragile|developing|strong)$/),
      scorePpm: expect.any(Number),
      preparednessBand: expect.stringMatching(/^(critical|exposed|stable|resilient)$/),
    });
  });
});
