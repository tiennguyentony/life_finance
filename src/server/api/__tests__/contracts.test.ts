import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import {
  createRunRequestSchema,
  gameCommandSchema,
  gameStateSchema,
  internalGameCommandSchema,
  journalTransactionSchema,
} from "../contracts";
import {
  advanceTimeV2RequestSchema,
  advanceTimeV2ResponseSchema,
  createRunV2RequestSchema,
  gameCommandV2PublicSchema,
  migrateRunV2ResponseSchema,
  playerPolicyPreviewV2RequestSchema,
  playerPolicyPreviewV2ResponseSchema,
} from "../contracts-v2";

const finances = {
  cashCents: 10_000_00,
  taxableInvestmentsCents: 20_000_00,
  retirementCents: 30_000_00,
  homeValueCents: 0,
  otherInvestableAssetsCents: 0,
  otherAssetsCents: 0,
  nonCreditLiabilitiesCents: 0,
  creditLimitCents: 10_000_00,
  creditUsedCents: 0,
  annualLivingCostCents: 60_000_00,
  requiredObligationsCents: 5_000_00,
};

function v1State() {
  return createInitialGameState({
    runId: "10000000-0000-4000-8000-000000000001",
    startMonth: "2026-07",
    randomSeed: "api",
    player: {
      playerId: "player_api",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: Object.fromEntries(
      Object.entries(finances).map(([key, value]) => [key, moneyCents(value)]),
    ) as Parameters<typeof createInitialGameState>[0]["finances"],
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  });
}

describe("v1 API contracts", () => {
  it("accepts a complete initial-state request and rejects unknown nested fields", () => {
    const request = {
      startMonth: "2026-07",
      player: {
        birthMonth: "1990-01",
        locationId: "US-CA",
        careerTrackId: "software_engineer",
        filingStatus: "single",
      },
      finances,
      wellbeing: { burnoutPpm: 200_000, happinessPpm: 800_000 },
      randomSeed: "api-contract",
    };
    expect(createRunRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      createRunRequestSchema.parse({
        ...request,
        finances: { ...finances, modelInventedBalance: 1 },
      }),
    ).toThrow();
  });

  it("rejects unsafe cents, invalid credit, months, and command fields", () => {
    expect(() =>
      createRunRequestSchema.parse({
        startMonth: "2026-13",
        player: {
          birthMonth: "1990-01",
          locationId: "US-CA",
          careerTrackId: "engineer",
          filingStatus: "single",
        },
        finances: {
          ...finances,
          cashCents: Number.MAX_SAFE_INTEGER + 1,
          creditUsedCents: 20_000_00,
        },
        wellbeing: { burnoutPpm: 0, happinessPpm: 0 },
        randomSeed: 1,
      }),
    ).toThrow();
    expect(() =>
      internalGameCommandSchema.parse({
        schemaVersion: 1,
        id: "cmd.invalid",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "advance_month",
        payload: { months: 12 },
      }),
    ).toThrow();
  });

  it("parses actual engine state and a strict monthly event command", () => {
    const state = v1State();
    expect(gameStateSchema.parse(state)).toEqual(state);
    expect(
      internalGameCommandSchema.parse({
        schemaVersion: 1,
        id: "cmd.month.1",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "process_month",
        payload: {
          employmentIncomeCents: 8_000_00,
          taxableLiquidationCostRatePpm: 10_000,
          event: {
            proposal: {
              eventId: "evt.tech.1",
              templateId: "macro.tech_boom",
              templateVersion: 1,
              parameters: { equity_boost_ppm: 50_000 },
            },
          },
        },
      }).type,
    ).toBe("process_month");
  });

  it("accepts complete or absent ledger provenance and rejects partial provenance", () => {
    const transaction = {
      id: "txn.opening",
      commandId: "system.initialize",
      effectiveMonth: "2026-07",
      reasonCode: "opening_balances",
      description: "Opening balances",
      sourceSystem: "state_initialization",
      category: "equity.opening",
      causalReference: { kind: "system", id: "run.opening" },
      postings: [
        { accountId: "asset.cash", debitCents: 100, creditCents: 0 },
        { accountId: "equity.opening", debitCents: 0, creditCents: 100 },
      ],
    };
    const legacy = {
      id: transaction.id,
      commandId: transaction.commandId,
      effectiveMonth: transaction.effectiveMonth,
      reasonCode: transaction.reasonCode,
      description: transaction.description,
      postings: transaction.postings,
    };

    expect(journalTransactionSchema.parse(transaction)).toEqual(transaction);
    expect(journalTransactionSchema.parse(legacy)).toEqual(legacy);
    expect(() =>
      journalTransactionSchema.parse({
        ...legacy,
        sourceSystem: "state_initialization",
      }),
    ).toThrow();
  });

  it("keeps authoritative journals and month inputs off the public boundary", () => {
    const envelope = {
      schemaVersion: 1,
      id: "cmd.public.1",
      expectedRevision: 0,
      effectiveMonth: "2026-07",
    } as const;
    expect(
      gameCommandSchema.parse({
        ...envelope,
        type: "take_action",
        payload: { action: { type: "invest_cash", amountCents: 100_00 } },
      }).type,
    ).toBe("take_action");
    for (const type of ["advance_month", "post_transaction", "process_month"]) {
      expect(() =>
        gameCommandSchema.parse({ ...envelope, type, payload: {} }),
      ).toThrow();
    }
  });
});

describe("v2 API contracts", () => {
  it("strictly validates no-write player policy previews", () => {
    const request = {
      schemaVersion: 2 as const,
      id: "action.preview.contract",
      expectedRevision: 1,
      effectiveMonth: "2026-08",
      type: "take_detailed_action" as const,
      payload: {
        action: {
          type: "invest_taxable" as const,
          bucket: "taxableBroadIndexCents" as const,
          amountCents: 100_000,
        },
      },
    };
    expect(playerPolicyPreviewV2RequestSchema.parse(request)).toEqual(request);
    const preview = {
      schemaVersion: 1 as const,
      commandType: "take_detailed_action" as const,
      actionPolicyVersion: "1.0.0" as const,
      commandChecksum: "1".repeat(64),
      openingStateChecksum: "2".repeat(64),
      resultingStateChecksum: "3".repeat(64),
      openingRevision: 1,
      resultingRevision: 2,
      effects: {
        cashChangeCents: -100_000,
        automaticLiquidityChangeCents: -100_000,
        termDebtPrincipalChangeCents: 0,
        revolvingCreditUsedChangeCents: 0,
        annualLivingCostChangeCents: 0,
        requiredObligationsChangeCents: 0,
      },
      policyChanges: [],
      appendedLedgerTransactionIds: [],
      appendedLedgerTransactions: [],
    };
    expect(playerPolicyPreviewV2ResponseSchema.parse(preview)).toEqual(preview);
    expect(() =>
      playerPolicyPreviewV2ResponseSchema.parse({
        ...preview,
        inventedApproval: true,
      }),
    ).toThrow();
  });

  it("validates successful and idempotent migration responses", () => {
    const state = migrateGameStateV1ToV2(v1State());

    expect(
      migrateRunV2ResponseSchema.parse({
        state,
        stateChecksum: "0".repeat(64),
        idempotentReplay: true,
      }).idempotentReplay,
    ).toBe(true);
  });

  it("accepts catalog-backed creation and rejects authoritative month inputs", () => {
    expect(
      createRunV2RequestSchema.parse({
        schemaVersion: 2,
        startMonth: "2026-07",
        birthMonth: "1995-01",
        randomSeed: "contract-v2",
        catalogVersion: "us-2026.2",
        locationId: "location.seattle",
        careerId: "career.software",
        householdId: "household.single",
        benefitsPackageId: "benefits.corporate_flex",
        healthPlanId: "health.hdhp_hsa",
        retirementPlanId: "retirement.401k_standard",
        insuranceCoverageIds: ["insurance.renters"],
        scenarioId: "scenario.fresh_start",
        annualGrossSalaryCents: 12_000_000,
        finances: {
          cashCents: 1_000_000,
          taxableBroadIndexCents: 0,
          taxableSectorCents: 0,
          taxableSpeculativeCents: 0,
          retirement401kCents: 0,
          retirementIraCents: 0,
          hsaCents: 0,
          homeValueCents: 0,
          otherAssetsCents: 0,
          termDebts: [],
          revolvingCreditLimitCents: 1_000_000,
          revolvingCreditUsedCents: 0,
        },
        wellbeing: { burnoutPpm: 0, happinessPpm: 1_000_000 },
      }).schemaVersion,
    ).toBe(2);
    for (const payload of [
      { taxEvidence: { totalTaxCents: 0 } },
      { outcomePolicyVersion: "1.0.0" },
      {
        resolvedCashFlows: [
          {
            id: "flow.client-injected",
            kind: "other_income",
            amountCents: 100_000,
            sourceSystem: "client",
          },
        ],
      },
    ]) {
      expect(() =>
        gameCommandV2PublicSchema.parse({
          schemaVersion: 2,
          id: "cmd.public-v2.month",
          expectedRevision: 0,
          effectiveMonth: "2026-07",
          type: "process_month",
          payload,
        }),
      ).toThrow();
    }
    expect(
      gameCommandV2PublicSchema.parse({
        schemaVersion: 2,
        id: "cmd.public-v2.choice",
        expectedRevision: 1,
        effectiveMonth: "2026-08",
        type: "resolve_event_choice",
        payload: {
          eventId: "evt.2026-08.personal.medical_bill",
          choiceId: "use_insurance",
        },
      }).type,
    ).toBe("resolve_event_choice");
    const liquidation = {
      schemaVersion: 2 as const,
      id: "cmd.public-v2.liquidate",
      expectedRevision: 1,
      effectiveMonth: "2026-08",
      type: "take_detailed_action" as const,
      payload: {
        action: {
          type: "liquidate_taxable" as const,
          bucket: "taxableBroadIndexCents" as const,
          amountCents: 100_000,
        },
      },
    };
    expect(gameCommandV2PublicSchema.parse(liquidation)).toEqual(liquidation);
    expect(
      gameCommandV2PublicSchema.parse({
        ...liquidation,
        payload: {
          action: {
            ...liquidation.payload.action,
            liquidationCostRatePpm: 999_999,
          },
        },
      }),
    ).toMatchObject({
      payload: { action: { liquidationCostRatePpm: 999_999 } },
    });
    expect(
      gameCommandV2PublicSchema.parse({
        schemaVersion: 2,
        id: "cmd.public-v2.milestone",
        expectedRevision: 2,
        effectiveMonth: "2026-08",
        type: "manage_life_milestone",
        payload: {
          action: "schedule",
          milestoneId: "milestone.first-car",
          kind: "vehicle",
          label: "Buy a reliable car",
          targetMonth: "2027-01",
          estimatedCostCents: 2_000_000,
        },
      }).type,
    ).toBe("manage_life_milestone");
  });
});

describe("time advance v2 contracts", () => {
  const request = {
    schemaVersion: 2 as const,
    id: "advance.contract.1",
    expectedRevision: 3,
    effectiveMonth: "2026-10",
    maxMonths: 12,
    mode: { kind: "months" as const, months: 12 },
  };

  it("accepts every public mode and rejects unknown fields", () => {
    const modes = [
      { kind: "one_month" },
      { kind: "months", months: 12 },
      { kind: "until_event" },
      { kind: "until_checkpoint", intervalMonths: 6 },
      { kind: "until_decision" },
      { kind: "until_end" },
      { kind: "resume", resolvedDecisionId: "decision.accepted", months: 3 },
      { kind: "stop" },
    ] as const;

    for (const mode of modes) {
      expect(advanceTimeV2RequestSchema.parse({ ...request, mode }).mode).toEqual(
        mode,
      );
    }
    expect(() =>
      advanceTimeV2RequestSchema.parse({ ...request, taxEvidence: {} }),
    ).toThrow();
  });

  it("enforces the 1..480 bound and mode-specific duration bounds", () => {
    expect(() =>
      advanceTimeV2RequestSchema.parse({ ...request, maxMonths: 0 }),
    ).toThrow();
    expect(() =>
      advanceTimeV2RequestSchema.parse({ ...request, maxMonths: 481 }),
    ).toThrow();
    expect(() =>
      advanceTimeV2RequestSchema.parse({
        ...request,
        maxMonths: 6,
        mode: { kind: "months", months: 7 },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2RequestSchema.parse({
        ...request,
        mode: { kind: "until_checkpoint", intervalMonths: 13 },
      }),
    ).toThrow();
  });

  it("strictly validates pending event, pending decision, and end-condition payloads", () => {
    const state = migrateGameStateV1ToV2(v1State());
    const base = {
      state,
      stateChecksum: sha256Canonical(state),
      idempotentReplay: false,
      monthsAdvanced: 0,
      pauseReason: { kind: "explicit_user_stop" },
      pendingEvent: null,
      pendingDecision: null,
      checkpointInput: null,
      endCondition: null,
      uiChanges: {
        kind: "time_advance_summary_v2",
        fromMonth: state.currentMonth,
        toMonth: state.currentMonth,
        monthsAdvanced: 0,
        pauseKind: "explicit_user_stop",
        cashChangeCents: 0,
        netWorthChangeCents: 0,
        totalGrossIncomeCents: 0,
        totalTaxCents: 0,
        totalAfterTaxCashIncomeCents: 0,
        totalRequiredCashCents: 0,
        totalMarketValueChangeCents: 0,
      },
    };
    const pendingEvent = {
      eventId: "event.contract",
      templateId: "template.contract",
      templateVersion: 1,
      tier: "medium",
      targetedWeakness: "low_emergency_fund",
      parameters: { costCents: 20_000 },
      choiceIds: ["choice.pay"],
      scheduledMonth: "2026-07",
      expiresMonth: "2026-08",
    };
    const declarativePendingEvent = {
      ...pendingEvent,
      templateVersion: 2,
      eventSchemaVersion: 2,
      category: "health",
      classification: "negative",
      lessonTags: {
        primary: "lesson.emergency_fund",
        secondary: ["lesson.insurance"],
      },
      pressureCost: 3,
      recoveryDurationMonths: 2,
      fallbackNarrative: {
        headline: "A medical bill arrives",
        body: "Choose how to cover the cost.",
      },
      followUpSourceEventId: "event.contract.source",
    };
    const pendingDecision = {
      kind: "life_milestone",
      milestones: [
        {
          version: "life-milestone-v1",
          milestoneId: "milestone.contract",
          kind: "move",
          label: "Move home",
          targetMonth: "2026-07",
          estimatedCostCents: 100_000,
          postponementCount: 0,
          createdMonth: "2026-01",
        },
      ],
    };
    const endCondition = {
      kind: "retirement_age",
      grade: "B",
      reachedMonth: "2026-07",
      reasonCode: "legacy_retirement",
    };
    const richEndCondition = {
      outcomePolicyVersion: "1.0.0",
      kind: "retirement_age",
      grade: "B",
      reachedMonth: "2026-07",
      reasonCode: "configured_retirement_age_reached",
      reasonCodes: [
        "configured_retirement_age_reached",
        "financial_independence_target_not_reached",
      ],
      financialIndependence: {
        goalSource: "current_lifestyle_default",
        investableAssetsCents: 6_000_000,
        targetCents: 10_000_000,
        progressPpm: 600_000,
      },
      displayedNetWorthCents: 5_000_000,
      automaticLiquidSolvency: {
        requiredCashCents: 100_000,
        automaticLiquidityCents: 500_000,
        residualShortfallCents: 0,
        isSolvent: true,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        currentAgeYears: 65,
        reachedRetirementAge: true,
        gradeIfRetiredNow: "B",
      },
    };

    expect(
      advanceTimeV2ResponseSchema.parse({
        ...base,
        pendingEvent,
        pendingDecision,
        endCondition,
      }),
    ).toMatchObject({ pendingEvent, pendingDecision, endCondition });
    expect(
      advanceTimeV2ResponseSchema.parse({
        ...base,
        pendingEvent: declarativePendingEvent,
      }).pendingEvent,
    ).toEqual(declarativePendingEvent);
    expect(
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: richEndCondition,
      }).endCondition,
    ).toEqual(richEndCondition);
    expect(
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: {
          ...richEndCondition,
          retirementReadiness: {
            ...richEndCondition.retirementReadiness,
            currentAgeYears: 121,
          },
        },
      }).endCondition,
    ).toMatchObject({ retirementReadiness: { currentAgeYears: 121 } });
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        pendingEvent: { ...pendingEvent, inventedSeverity: 99 },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        pendingDecision: {
          ...pendingDecision,
          milestones: [
            { ...pendingDecision.milestones[0], inventedCost: 500_000 },
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: { ...endCondition, inventedGradeReason: "AI says so" },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: {
          ...richEndCondition,
          retirementReadiness: {
            ...richEndCondition.retirementReadiness,
            inventedProjection: 700_000,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: {
          ...richEndCondition,
          kind: "financial_independence",
          grade: "S",
          reasonCode: "financial_independence_target_reached",
          reasonCodes: ["financial_independence_target_reached"],
          financialIndependence: {
            ...richEndCondition.financialIndependence,
            progressPpm: 1_000_000,
          },
          automaticLiquidSolvency: {
            ...richEndCondition.automaticLiquidSolvency,
            residualShortfallCents: 1,
            isSolvent: false,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      advanceTimeV2ResponseSchema.parse({
        ...base,
        endCondition: {
          ...richEndCondition,
          financialIndependence: {
            ...richEndCondition.financialIndependence,
            progressPpm: 1_000_000,
          },
        },
      }),
    ).toThrow();
  });
});
