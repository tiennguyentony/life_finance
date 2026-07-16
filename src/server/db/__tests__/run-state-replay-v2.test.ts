import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { RecordLearningInteractionV2Command } from "../../../core/learning-interaction-v2";
import type { MonthlyTurnV2Record } from "../../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import { assertValidGameStateTransitionV2 } from "../../../core/state-transition-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import { RunRepositoryError } from "../run-repository-contracts";
import { reduceGameCommandV2 } from "../run-repository-support";
import {
  rebuildGameCommandV2,
  replayAcceptedCommandsV2,
  selectLatestRunStateReplayAnchorV2,
  type AcceptedCommandReplayRowV2,
  type RunStateReplayAnchorV2,
} from "../run-state-replay-v2";

const runId = "10000000-0000-4000-8000-000000000099";

const processMonthPayload = {
  taxEvidence: {
    schemaVersion: 1,
    traceId: "tax.replay",
    economicYear: 2026,
    policyYear: 2026,
    stateCode: "WA",
    filingStatus: "single",
    provider: "PolicyEngine US",
    bundleVersion: "4.21.0",
    rulesVersion: "1.764.6",
    projectedFromFrozenPolicy: false,
    grossIncomeCents: 1_000_000,
    employee401kContributionCents: 50_000,
    employeeHsaContributionCents: 20_000,
    totalTaxCents: 200_000,
    afterTaxCashIncomeCents: 730_000,
  },
  taxableLiquidationCostRatePpm: 10_000,
} as const;

const resolvedCashFlows = [
  {
    id: "flow.replay.other-income",
    kind: "other_income",
    amountCents: 11,
    sourceSystem: "policy.replay",
  },
  {
    id: "flow.replay.recurring-expense",
    kind: "recurring_expense",
    amountCents: 7,
    sourceSystem: "subscription.replay",
  },
  {
    id: "flow.replay.temporary-income",
    kind: "temporary_income",
    amountCents: 13,
    sourceSystem: "event.replay",
  },
  {
    id: "flow.replay.temporary-expense",
    kind: "temporary_expense",
    amountCents: 5,
    sourceSystem: "event.replay",
  },
] as const;

const validPayloads = [
  ["take_detailed_action", { action: { type: "sell_home" } }],
  [
    "set_recurring_strategy",
    {
      strategy: {
        preTax401kSalaryRatePpm: 0,
        preTaxHsaSalaryRatePpm: 0,
        afterTaxBroadIndexRatePpm: 0,
        afterTaxSectorRatePpm: 0,
        afterTaxSpeculativeRatePpm: 0,
        afterTaxIraRatePpm: 0,
        afterTaxExtraDebtRatePpm: 0,
      },
    },
  ],
  [
    "resolve_event_choice",
    { eventId: "event.replay", choiceId: "choice.replay" },
  ],
  [
    "manage_life_milestone",
    {
      action: "resolve",
      milestoneId: "milestone.replay",
      resolution: "cancel",
    },
  ],
  [
    "record_learning_interaction_v2",
    { conceptId: "concept.replay", kind: "ai_explanation" },
  ],
  [
    "queue_ai_world_event_v2",
    {
      source: "deterministic_fallback",
      templateId: "personal.medical_bill",
      templateVersion: 1,
      targetedWeaknessId: "low_emergency_fund",
      parameters: { gross_bill_cents: 100_000 },
      headline: "A surprise medical bill arrives",
      narrative: "Your emergency plan faces a realistic medical expense.",
      rationale: "Low liquid reserves make this event relevant.",
      citedEvidenceIds: ["weakness.low_emergency_fund"],
    },
  ],
  [
    "process_month_v2",
    processMonthPayload,
  ],
] as const;

const validDetailedActions = [
  [
    "invest_taxable",
    {
      type: "invest_taxable",
      bucket: "taxableBroadIndexCents",
      amountCents: 1,
    },
  ],
  [
    "liquidate_taxable",
    {
      type: "liquidate_taxable",
      bucket: "taxableLegacyUnclassifiedCents",
      amountCents: 1,
      liquidationCostRatePpm: 10_000,
    },
  ],
  ["contribute_ira", { type: "contribute_ira", amountCents: 1 }],
  ["contribute_hsa", { type: "contribute_hsa", amountCents: 1 }],
  [
    "pay_term_debt",
    { type: "pay_term_debt", debtId: "debt.replay", amountCents: 1 },
  ],
  [
    "pay_revolving_credit",
    { type: "pay_revolving_credit", amountCents: 1 },
  ],
  [
    "draw_revolving_credit",
    { type: "draw_revolving_credit", amountCents: 1 },
  ],
  [
    "withdraw_retirement",
    {
      type: "withdraw_retirement",
      bucket: "retirementLegacyUnclassifiedCents",
      amountCents: 1,
    },
  ],
  [
    "purchase_home",
    {
      type: "purchase_home",
      purchasePriceCents: 100_000,
      downPaymentCents: 20_000,
      mortgageAnnualInterestRatePpm: 60_000,
      mortgageTermMonths: 360,
    },
  ],
  ["sell_home", { type: "sell_home" }],
  [
    "refinance_home",
    {
      type: "refinance_home",
      mortgageAnnualInterestRatePpm: 50_000,
      mortgageTermMonths: 240,
    },
  ],
  [
    "change_lifestyle",
    { type: "change_lifestyle", annualLivingCostDeltaCents: -1 },
  ],
  [
    "start_upskill",
    { type: "start_upskill", programId: "upskill.bootcamp" },
  ],
] as const;

const malformedPayloads = [
  ["take_detailed_action", {}],
  ["set_recurring_strategy", { strategy: {} }],
  ["resolve_event_choice", { eventId: "event.replay" }],
  [
    "manage_life_milestone",
    { action: "resolve", milestoneId: "milestone.replay" },
  ],
  ["record_learning_interaction_v2", { conceptId: "concept.replay" }],
  [
    "queue_ai_world_event_v2",
    {
      source: "deterministic_fallback",
      templateId: "personal.medical_bill",
    },
  ],
  ["process_month_v2", { taxableLiquidationCostRatePpm: 10_000 }],
] as const;

function initialState() {
  return migrateGameStateV1ToV2(
    createInitialGameState({
      runId,
      startMonth: "2026-07",
      randomSeed: "replay-v2",
      player: {
        playerId: "player.replay-v2",
        birthMonth: "1990-01",
        locationId: "US-WA",
        careerTrackId: "software_engineer",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(1_000_000),
        taxableInvestmentsCents: moneyCents(100_000),
        retirementCents: moneyCents(100_000),
        homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(100_000),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(600_000),
        requiredObligationsCents: moneyCents(50_000),
      },
      wellbeing: {
        burnoutPpm: ratePpm(100_000),
        happinessPpm: ratePpm(900_000),
      },
    }),
  );
}

function learningCommand(
  id: string,
  expectedRevision: number,
): RecordLearningInteractionV2Command {
  return {
    schemaVersion: 2,
    id,
    type: "record_learning_interaction_v2",
    expectedRevision,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      conceptId: `concept.${expectedRevision}`,
      kind: "ai_explanation",
    },
  };
}

function replayFixture() {
  const start = initialState();
  const firstCommand = learningCommand("cmd.replay.1", 0);
  const first = reduceGameCommandV2(start, firstCommand).state;
  const secondCommand = learningCommand("cmd.replay.2", 1);
  const second = reduceGameCommandV2(first, secondCommand).state;
  const anchor: RunStateReplayAnchorV2 = {
    runId,
    revision: start.revision,
    stateSchemaVersion: start.schemaVersion,
    engineVersion: start.engineVersion,
    state: start,
    stateChecksum: sha256Canonical(start),
  };
  const rows: AcceptedCommandReplayRowV2[] = [
    row(firstCommand, sha256Canonical(first)),
    row(secondCommand, sha256Canonical(second)),
  ];
  return { anchor, rows, start, first, second };
}

function row(
  command: RecordLearningInteractionV2Command,
  resultingStateChecksum: string,
): AcceptedCommandReplayRowV2 {
  return {
    runId,
    commandId: command.id,
    commandSchemaVersion: command.schemaVersion,
    commandType: command.type,
    expectedRevision: command.expectedRevision,
    resultingRevision: command.expectedRevision + 1,
    effectiveMonth: command.effectiveMonth,
    payload: command.payload,
    resultingStateChecksum,
  };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

function storedRow(
  commandType: string,
  payload: unknown,
): AcceptedCommandReplayRowV2 {
  return {
    runId,
    commandId: `cmd.decode.${commandType}`,
    commandSchemaVersion: 2,
    commandType,
    expectedRevision: 0,
    resultingRevision: 1,
    effectiveMonth: "2026-07",
    payload,
    resultingStateChecksum: "0".repeat(64),
  };
}

type LegacyMonthlyReplayKind =
  | "successful"
  | "taxable_liquidation_and_credit"
  | "claim"
  | "shortfall";

const legacyMonthlyReplayFixtures = [
  {
    kind: "successful",
    expectedStateChecksum:
      "6e58a551198a4a8033b718bff4f3b334bcff04d34804f2b1c77064792ba204fe",
    expectedRecord: {
      commandId: "cmd.legacy-replay.successful",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 800_000,
      market: {
        equityReturnPpm: 3_000,
        bondReturnPpm: 1_000,
        cashReturnPpm: 300,
        housingReturnPpm: 2_000,
        inflationPpm: 1_300,
      },
      marketValueChangeCents: 300,
      annualInflationIncreaseCents: 8_450,
      insurancePlayerCostCents: 0,
      requiredCashCents: 555_171,
      nonDebtObligationsPaidCents: 555_171,
      debtService: {
        totalInterestCents: 0,
        totalScheduledPaymentCents: 0,
      },
      funding: {
        grossLiquidationCents: 0,
        liquidationCostCents: 0,
        netLiquidationProceedsCents: 0,
        creditDrawnCents: 0,
        liquidatedBuckets: {
          taxableLegacyUnclassifiedCents: 0,
          taxableSpeculativeCents: 0,
          taxableSectorCents: 0,
          taxableBroadIndexCents: 0,
        },
      },
      scheduledEventId: null,
      outcome: null,
    },
  },
  {
    kind: "taxable_liquidation_and_credit",
    expectedStateChecksum:
      "b7f38f1ba1fd702e7cf881c248c012d3befd4fd6d3c07d709e36aa11dbb3a86f",
    expectedRecord: {
      commandId: "cmd.legacy-replay.taxable_liquidation_and_credit",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 800_000,
      market: {
        equityReturnPpm: 30_000,
        bondReturnPpm: -500,
        cashReturnPpm: 300,
        housingReturnPpm: 11_500,
        inflationPpm: 4_000,
      },
      marketValueChangeCents: 15_030,
      annualInflationIncreaseCents: 26_000,
      insurancePlayerCostCents: 0,
      requiredCashCents: 1_756_634,
      nonDebtObligationsPaidCents: 556_634,
      debtService: {
        totalInterestCents: 12_000,
        totalScheduledPaymentCents: 1_200_000,
      },
      funding: {
        grossLiquidationCents: 515_000,
        liquidationCostCents: 5_150,
        netLiquidationProceedsCents: 509_850,
        creditDrawnCents: 346_754,
        liquidatedBuckets: {
          taxableLegacyUnclassifiedCents: 0,
          taxableSpeculativeCents: 0,
          taxableSectorCents: 0,
          taxableBroadIndexCents: 515_000,
        },
      },
      scheduledEventId: null,
      outcome: null,
    },
  },
  {
    kind: "claim",
    expectedStateChecksum:
      "efc2728aceeaaae22ab4e24c235afe53e42e99cb6893024258ceb5f54cfff0a1",
    expectedRecord: {
      commandId: "cmd.legacy-replay.claim",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 800_000,
      market: {
        equityReturnPpm: 3_000,
        bondReturnPpm: 7_000,
        cashReturnPpm: 300,
        housingReturnPpm: -500,
        inflationPpm: 1_300,
      },
      marketValueChangeCents: 300,
      annualInflationIncreaseCents: 8_450,
      insurancePlayerCostCents: 184_000,
      requiredCashCents: 739_171,
      nonDebtObligationsPaidCents: 739_171,
      debtService: {
        totalInterestCents: 0,
        totalScheduledPaymentCents: 0,
      },
      funding: {
        grossLiquidationCents: 0,
        liquidationCostCents: 0,
        netLiquidationProceedsCents: 0,
        creditDrawnCents: 0,
        liquidatedBuckets: {
          taxableLegacyUnclassifiedCents: 0,
          taxableSpeculativeCents: 0,
          taxableSectorCents: 0,
          taxableBroadIndexCents: 0,
        },
      },
      scheduledEventId: null,
      outcome: null,
    },
  },
  {
    kind: "shortfall",
    expectedStateChecksum:
      "1e0421faae700850188cc25ad1e0af1df27b56defcfeeb43f48b89386dfa14ac",
    expectedRecord: {
      commandId: "cmd.legacy-replay.shortfall",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 800_000,
      market: {
        equityReturnPpm: 2_000,
        bondReturnPpm: 2_500,
        cashReturnPpm: 300,
        housingReturnPpm: -1_500,
        inflationPpm: 2_200,
      },
      marketValueChangeCents: 30,
      annualInflationIncreaseCents: 14_300,
      insurancePlayerCostCents: 10_000_000,
      requiredCashCents: 10_555_659,
      nonDebtObligationsPaidCents: 0,
      debtService: {
        totalInterestCents: 0,
        totalScheduledPaymentCents: 0,
      },
      funding: null,
      scheduledEventId: null,
      outcome: {
        kind: "bankruptcy",
        grade: "F",
        reachedMonth: "2026-08",
        reasonCode: "required_obligations_exceed_automatic_liquidity",
      },
    },
  },
] as const satisfies readonly Readonly<{
  kind: LegacyMonthlyReplayKind;
  expectedStateChecksum: string;
  expectedRecord: object;
}>[];

function legacyMonthlyReplayState(kind: LegacyMonthlyReplayKind) {
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
  const needsFunding = kind === "taxable_liquidation_and_credit";
  const isShortfall = kind === "shortfall";
  return createNativeGameStateV2({
    runId: `run.legacy-replay.${kind}`,
    playerId: `player.legacy-replay.${kind}`,
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: `legacy-monthly-replay-${kind}`,
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(needsFunding || isShortfall ? 100_000 : 1_000_000),
      taxableBroadIndexCents: moneyCents(needsFunding ? 500_000 : 0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: needsFunding
        ? [
            {
              id: "debt.legacy-replay",
              kind: "student_loan" as const,
              principalCents: moneyCents(1_200_000),
              annualInterestRatePpm: ratePpm(120_000),
              minimumPaymentCents: moneyCents(1_200_000),
              remainingTermMonths: 2,
            },
          ]
        : [],
      revolvingCreditLimitCents: moneyCents(needsFunding ? 1_000_000 : 100_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function legacyMonthlyReplayPayload(kind: LegacyMonthlyReplayKind) {
  const insuranceClaim =
    kind === "claim"
      ? {
          type: "health" as const,
          grossAmountCents: 200_000,
          covered: true,
        }
      : kind === "shortfall"
        ? {
            type: "health" as const,
            grossAmountCents: 10_000_000,
            covered: false,
          }
        : undefined;
  return {
    taxEvidence: {
      schemaVersion: 1,
      traceId: `tax.legacy-replay.${kind}`,
      economicYear: 2026,
      policyYear: 2026,
      stateCode: "WA",
      filingStatus: "single",
      provider: "PolicyEngine US",
      bundleVersion: "4.21.0",
      rulesVersion: "1.764.6",
      projectedFromFrozenPolicy: false,
      grossIncomeCents: 1_000_000,
      employee401kContributionCents: 0,
      employeeHsaContributionCents: 0,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 800_000,
    },
    taxableLiquidationCostRatePpm: 10_000,
    ...(insuranceClaim ? { insuranceClaim } : {}),
  };
}

function compactMonthlyRecord(record: MonthlyTurnV2Record | null) {
  if (!record) throw new Error("monthly replay did not produce a record");
  return {
    commandId: record.commandId,
    processedMonth: record.processedMonth,
    nextMonth: record.nextMonth,
    grossIncomeCents: record.grossIncomeCents,
    totalTaxCents: record.totalTaxCents,
    afterTaxCashIncomeCents: record.afterTaxCashIncomeCents,
    market: {
      equityReturnPpm: record.market.equityReturnPpm,
      bondReturnPpm: record.market.bondReturnPpm,
      cashReturnPpm: record.market.cashReturnPpm,
      housingReturnPpm: record.market.housingReturnPpm,
      inflationPpm: record.market.inflationPpm,
    },
    marketValueChangeCents: record.marketValueChangeCents,
    annualInflationIncreaseCents: record.annualInflationIncreaseCents,
    insurancePlayerCostCents: record.insurancePlayerCostCents,
    requiredCashCents: record.requiredCashCents,
    nonDebtObligationsPaidCents: record.nonDebtObligationsPaidCents,
    debtService: {
      totalInterestCents: record.debtService.totalInterestCents,
      totalScheduledPaymentCents:
        record.debtService.totalScheduledPaymentCents,
    },
    funding: record.funding,
    scheduledEventId: record.scheduledEvent?.eventId ?? null,
    outcome: record.outcome,
  };
}

describe("verified v2 run-state replay", () => {
  it.each(legacyMonthlyReplayFixtures)(
    "freezes the unversioned $kind monthly replay",
    (fixture) => {
      const start = legacyMonthlyReplayState(fixture.kind);
      const row: AcceptedCommandReplayRowV2 = {
        runId: start.runId,
        commandId: `cmd.legacy-replay.${fixture.kind}`,
        commandSchemaVersion: 2,
        commandType: "process_month_v2",
        expectedRevision: start.revision,
        resultingRevision: start.revision + 1,
        effectiveMonth: start.currentMonth,
        payload: legacyMonthlyReplayPayload(fixture.kind),
        resultingStateChecksum: fixture.expectedStateChecksum,
      };
      const command = rebuildGameCommandV2(row);
      const reduction = reduceGameCommandV2(start, command);

      expect(compactMonthlyRecord(reduction.monthlyRecord)).toEqual(
        fixture.expectedRecord,
      );
      expect(sha256Canonical(reduction.state)).toBe(
        fixture.expectedStateChecksum,
      );
      expect(() =>
        assertValidGameStateTransitionV2(start, reduction.state, command.id),
      ).not.toThrow();
      expect(
        replayAcceptedCommandsV2(
          {
            runId: start.runId,
            revision: start.revision,
            stateSchemaVersion: start.schemaVersion,
            engineVersion: start.engineVersion,
            state: start,
            stateChecksum: sha256Canonical(start),
          },
          [row],
          row.resultingRevision,
        ),
      ).toEqual({
        state: reduction.state,
        stateChecksum: fixture.expectedStateChecksum,
      });
    },
  );

  it.each(validPayloads)(
    "strictly decodes a stored %s payload",
    (commandType, payload) => {
      expect(rebuildGameCommandV2(storedRow(commandType, payload))).toMatchObject({
        type: commandType,
        payload,
      });
    },
  );

  it.each(["legacy-4.1.0", "2.0.0"] as const)(
    "decodes the supported persisted %s financial kernel",
    (financialKernelVersion) => {
      expect(
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            financialKernelVersion,
          }),
        ),
      ).toMatchObject({ payload: { financialKernelVersion } });
    },
  );

  it("strictly decodes outcome policy 1.0.0 for the current kernel", () => {
    expect(
      rebuildGameCommandV2(
        storedRow("process_month_v2", {
          ...processMonthPayload,
          financialKernelVersion: "2.0.0",
          outcomePolicyVersion: "1.0.0",
          resolvedCashFlows: [],
        }),
      ),
    ).toMatchObject({
      payload: {
        financialKernelVersion: "2.0.0",
        outcomePolicyVersion: "1.0.0",
      },
    });
  });

  it.each([
    [
      "unknown outcome policy",
      { financialKernelVersion: "2.0.0", outcomePolicyVersion: "invented" },
    ],
    [
      "unversioned financial kernel",
      { outcomePolicyVersion: "1.0.0" },
    ],
    [
      "legacy financial kernel",
      {
        financialKernelVersion: "legacy-4.1.0",
        outcomePolicyVersion: "1.0.0",
      },
    ],
  ])("rejects persisted monthly evidence with %s", (_label, versionEvidence) => {
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            ...versionEvidence,
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("preserves absent version and resolved flows for historical monthly rows", () => {
    const command = rebuildGameCommandV2(
      storedRow("process_month_v2", processMonthPayload),
    );

    expect(command).toMatchObject({
      type: "process_month_v2",
      payload: processMonthPayload,
    });
    if (command.type !== "process_month_v2") {
      throw new Error("expected a monthly command");
    }
    expect(command.payload.financialKernelVersion).toBeUndefined();
    expect(command.payload.outcomePolicyVersion).toBeUndefined();
    expect(command.payload.resolvedCashFlows).toBeUndefined();
  });

  it("strictly decodes all persisted resolved cash-flow variants", () => {
    expect(
      rebuildGameCommandV2(
        storedRow("process_month_v2", {
          ...processMonthPayload,
          financialKernelVersion: "2.0.0",
          resolvedCashFlows,
        }),
      ),
    ).toMatchObject({
      payload: {
        financialKernelVersion: "2.0.0",
        resolvedCashFlows,
      },
    });
  });

  it("strictly decodes an empty resolved cash-flow set for the current kernel", () => {
    expect(
      rebuildGameCommandV2(
        storedRow("process_month_v2", {
          ...processMonthPayload,
          financialKernelVersion: "2.0.0",
          resolvedCashFlows: [],
        }),
      ),
    ).toMatchObject({
      payload: {
        financialKernelVersion: "2.0.0",
        resolvedCashFlows: [],
      },
    });
  });

  it("freezes a historical 2.0.0 command without outcome-policy evidence", () => {
    const start = legacyMonthlyReplayState("successful");
    const stored = storedRow("process_month_v2", {
      ...legacyMonthlyReplayPayload("successful"),
      financialKernelVersion: "2.0.0",
      resolvedCashFlows: [],
    });
    const command = rebuildGameCommandV2(stored);
    const reduction = reduceGameCommandV2(start, command);

    if (command.type !== "process_month_v2") {
      throw new Error("expected a monthly command");
    }
    expect(command.payload.outcomePolicyVersion).toBeUndefined();
    expect(sha256Canonical(reduction.state)).toBe(
      "a984e2324d8d867dea624ae1eaa81b82d5d91a073a665f50a02f207e1d445e97",
    );
    expect(sha256Canonical(reduction.monthlyRecord)).toBe(
      "5ca95d5118071ad9d1eaba5862b235f29b6d5ac72f76d3cdc2e02bb571284944",
    );
  });

  it("replays policy 1.0.0 through the production reducer deterministically", () => {
    const start = legacyMonthlyReplayState("successful");
    const stored: AcceptedCommandReplayRowV2 = {
      runId: start.runId,
      commandId: "cmd.outcome-policy-replay.current",
      commandSchemaVersion: 2,
      commandType: "process_month_v2",
      expectedRevision: start.revision,
      resultingRevision: start.revision + 1,
      effectiveMonth: start.currentMonth,
      payload: {
        ...legacyMonthlyReplayPayload("successful"),
        financialKernelVersion: "2.0.0",
        outcomePolicyVersion: "1.0.0",
        resolvedCashFlows: [],
      },
      resultingStateChecksum: "0".repeat(64),
    };
    const command = rebuildGameCommandV2(stored);
    const first = reduceGameCommandV2(start, command);
    const second = reduceGameCommandV2(start, rebuildGameCommandV2(stored));
    const stateChecksum = sha256Canonical(first.state);
    const accepted = { ...stored, resultingStateChecksum: stateChecksum };

    expect(first.monthlyRecord).toMatchObject({
      financialKernelVersion: "2.0.0",
      outcomePolicyVersion: "1.0.0",
    });
    expect(second).toEqual(first);
    expect(
      replayAcceptedCommandsV2(
        {
          runId: start.runId,
          revision: start.revision,
          stateSchemaVersion: start.schemaVersion,
          engineVersion: start.engineVersion,
          state: start,
          stateChecksum: sha256Canonical(start),
        },
        [accepted],
        accepted.resultingRevision,
      ),
    ).toEqual({ state: first.state, stateChecksum });
  });

  it.each([
    ["unversioned", {}],
    ["legacy-4.1.0", { financialKernelVersion: "legacy-4.1.0" }],
  ] as const)(
    "rejects persisted resolved cash flows on %s monthly rows",
    (_label, versionEvidence) => {
      expect(
        captureError(() =>
          rebuildGameCommandV2(
            storedRow("process_month_v2", {
              ...processMonthPayload,
              ...versionEvidence,
              resolvedCashFlows,
            }),
          ),
        ),
      ).toMatchObject({ code: "CORRUPT_STATE" });
    },
  );

  it.each([
    [
      "unknown kind",
      [{ ...resolvedCashFlows[0], kind: "invented_income" }],
    ],
    ["negative cents", [{ ...resolvedCashFlows[0], amountCents: -1 }]],
    [
      "non-safe cents",
      [{ ...resolvedCashFlows[0], amountCents: Number.MAX_SAFE_INTEGER + 1 }],
    ],
    ["unsafe flow id", [{ ...resolvedCashFlows[0], id: "flow/replay" }]],
    [
      "overlong flow id",
      [{ ...resolvedCashFlows[0], id: `f${"x".repeat(64)}` }],
    ],
    [
      "unsafe source identifier",
      [{ ...resolvedCashFlows[0], sourceSystem: "event/replay" }],
    ],
    [
      "overlong source identifier",
      [{ ...resolvedCashFlows[0], sourceSystem: `s${"x".repeat(64)}` }],
    ],
    ["duplicate flow ids", [resolvedCashFlows[0], resolvedCashFlows[0]]],
    [
      "extra flow keys",
      [{ ...resolvedCashFlows[0], ignoredFlowField: true }],
    ],
    [
      "more than 64 flows",
      Array.from({ length: 65 }, (_, index) => ({
        ...resolvedCashFlows[0],
        id: `flow.${index}`,
      })),
    ],
  ])("rejects persisted resolved cash flows with %s", (_label, flows) => {
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            financialKernelVersion: "2.0.0",
            resolvedCashFlows: flows,
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("replays all four persisted resolved-flow kinds once with stable causal ledger evidence", () => {
    const start = legacyMonthlyReplayState("successful");
    const stored: AcceptedCommandReplayRowV2 = {
      runId: start.runId,
      commandId: "cmd.kernel-replay.flows",
      commandSchemaVersion: 2,
      commandType: "process_month_v2",
      expectedRevision: start.revision,
      resultingRevision: start.revision + 1,
      effectiveMonth: start.currentMonth,
      payload: {
        ...legacyMonthlyReplayPayload("successful"),
        financialKernelVersion: "2.0.0",
        resolvedCashFlows,
      },
      resultingStateChecksum: "0".repeat(64),
    };
    const command = rebuildGameCommandV2(stored);
    const first = reduceGameCommandV2(start, command);
    const second = reduceGameCommandV2(start, rebuildGameCommandV2(stored));
    const stateChecksum = sha256Canonical(first.state);
    const acceptedRow = { ...stored, resultingStateChecksum: stateChecksum };
    const replayed = replayAcceptedCommandsV2(
      {
        runId: start.runId,
        revision: start.revision,
        stateSchemaVersion: start.schemaVersion,
        engineVersion: start.engineVersion,
        state: start,
        stateChecksum: sha256Canonical(start),
      },
      [acceptedRow],
      acceptedRow.resultingRevision,
    );
    const flowTransactions = first.state.ledger.transactions.filter(
      (transaction) =>
        transaction.causalReference?.kind === "system" &&
        resolvedCashFlows.some(
          (flow) => flow.id === transaction.causalReference?.id,
        ),
    );

    expect(first.monthlyRecord).toMatchObject({
      financialKernelVersion: "2.0.0",
      resolvedIncomeCents: 24,
      resolvedExpenseCents: 12,
    });
    expect(flowTransactions).toHaveLength(4);
    for (const flow of resolvedCashFlows) {
      expect(
        flowTransactions.filter(
          (transaction) => transaction.causalReference?.id === flow.id,
        ),
      ).toEqual([
        expect.objectContaining({
          commandId: stored.commandId,
          sourceSystem: flow.sourceSystem,
          category: flow.kind.endsWith("income")
            ? "income.resolved_cash_flow"
            : "expense.resolved_cash_flow",
          causalReference: { kind: "system", id: flow.id },
        }),
      ]);
    }
    expect(second).toEqual(first);
    expect(replayed).toEqual({ state: first.state, stateChecksum });
    expect(replayed.state).toMatchObject({
      revision: start.revision + 1,
      currentMonth: "2026-08",
      acceptedCommandIds: [stored.commandId],
    });
  });

  it("rejects an unknown persisted financial kernel", () => {
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            financialKernelVersion: "invented-kernel",
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it.each(validDetailedActions)(
    "strictly decodes the stored %s detailed-action variant",
    (_actionType, action) => {
      expect(
        rebuildGameCommandV2(
          storedRow("take_detailed_action", { action }),
        ),
      ).toMatchObject({ payload: { action } });
    },
  );

  it("strictly decodes both milestone payload variants", () => {
    const schedule = {
      action: "schedule",
      milestoneId: "milestone.schedule",
      kind: "education",
      label: "Graduate school",
      targetMonth: "2027-09",
      estimatedCostCents: 1,
    };
    expect(
      rebuildGameCommandV2(storedRow("manage_life_milestone", schedule)),
    ).toMatchObject({ payload: schedule });
    expect(
      rebuildGameCommandV2(
        storedRow("manage_life_milestone", validPayloads[3][1]),
      ),
    ).toMatchObject({ payload: validPayloads[3][1] });
  });

  it("strictly decodes both monthly insurance-claim variants", () => {
    const claims = [
      { type: "health", grossAmountCents: 1, covered: true },
      {
        type: "selected_coverage",
        coverageId: "coverage.replay",
        grossAmountCents: 1,
        eligible: false,
      },
    ] as const;
    for (const insuranceClaim of claims) {
      expect(
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            insuranceClaim,
          }),
        ),
      ).toMatchObject({ payload: { insuranceClaim } });
    }
  });

  it.each(malformedPayloads)(
    "rejects a malformed stored %s payload",
    (commandType, payload) => {
      expect(
        captureError(() =>
          rebuildGameCommandV2(storedRow(commandType, payload)),
        ),
      ).toMatchObject({ code: "CORRUPT_STATE" });
    },
  );

  it.each(validPayloads)(
    "rejects unknown keys in a stored %s payload",
    (commandType, payload) => {
      expect(
        captureError(() =>
          rebuildGameCommandV2(
            storedRow(commandType, { ...payload, unknownReplayKey: true }),
          ),
        ),
      ).toMatchObject({ code: "CORRUPT_STATE" });
    },
  );

  it("round-trips a versioned action policy while preserving historical absence", () => {
    const historical = rebuildGameCommandV2(
      storedRow("take_detailed_action", {
        action: { type: "sell_home" },
      }),
    );
    const versioned = rebuildGameCommandV2(
      storedRow("take_detailed_action", {
        action: { type: "sell_home" },
        actionPolicyVersion: "1.0.0",
      }),
    );

    expect(historical.payload).toEqual({ action: { type: "sell_home" } });
    expect(versioned.payload).toEqual({
      action: { type: "sell_home" },
      actionPolicyVersion: "1.0.0",
    });
    expect(
      rebuildGameCommandV2(
        storedRow("take_detailed_action", {
          action: {
            type: "liquidate_taxable",
            bucket: "taxableBroadIndexCents",
            amountCents: 100_000,
            liquidationCostRatePpm: 123_456,
          },
        }),
      ).payload,
    ).not.toHaveProperty("actionPolicyVersion");
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("take_detailed_action", {
            action: { type: "sell_home" },
            actionPolicyVersion: "invented",
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("take_detailed_action", {
            action: {
              type: "liquidate_taxable",
              bucket: "taxableBroadIndexCents",
              amountCents: 100_000,
              liquidationCostRatePpm: 123_456,
            },
            actionPolicyVersion: "1.0.0",
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
    expect(
      rebuildGameCommandV2(
        storedRow("take_detailed_action", {
          action: {
            type: "liquidate_taxable",
            bucket: "taxableBroadIndexCents",
            amountCents: 100_000,
            liquidationCostRatePpm: 10_000,
          },
          actionPolicyVersion: "1.0.0",
        }),
      ).payload,
    ).toMatchObject({ actionPolicyVersion: "1.0.0" });
  });

  it("rejects an invalid stored learning-interaction kind", () => {
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("record_learning_interaction_v2", {
            conceptId: "concept.replay",
            kind: "invented_kind",
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects unknown keys inside a stored detailed action", () => {
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("take_detailed_action", {
            action: { type: "sell_home", ignoredActionField: true },
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects unknown keys inside a stored recurring strategy", () => {
    const strategy = validPayloads[1][1].strategy;
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("set_recurring_strategy", {
            strategy: { ...strategy, ignoredStrategyField: true },
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("strictly restores persisted protection policy fields", () => {
    const strategy = validPayloads[1][1].strategy;
    expect(
      rebuildGameCommandV2(
        storedRow("set_recurring_strategy", {
          strategy: {
            ...strategy,
            emergencyFundTargetMonthsPpm: 6_000_000,
            insuranceCoverageIds: ["insurance.renters"],
          },
        }),
      ).payload,
    ).toMatchObject({
      strategy: {
        emergencyFundTargetMonthsPpm: 6_000_000,
        insuranceCoverageIds: ["insurance.renters"],
      },
    });
  });

  it("uses the process-month command ID limit from the core contract", () => {
    const commandId = `c${"x".repeat(96)}`;
    expect(
      captureError(() =>
        rebuildGameCommandV2({
          ...storedRow("process_month_v2", processMonthPayload),
          commandId,
        }),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("strictly validates stored monthly tax evidence", () => {
    const taxEvidence = processMonthPayload.taxEvidence;

    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            taxEvidence: { ...taxEvidence, ignoredTaxField: true },
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
    expect(
      captureError(() =>
        rebuildGameCommandV2(
          storedRow("process_month_v2", {
            ...processMonthPayload,
            taxEvidence: {
              ...taxEvidence,
              afterTaxCashIncomeCents: 999_999,
            },
          }),
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("preserves signed tax refunds in reconciled monthly evidence", () => {
    const taxEvidence = {
      ...processMonthPayload.taxEvidence,
      totalTaxCents: -10_000,
      afterTaxCashIncomeCents: 940_000,
    };
    expect(
      rebuildGameCommandV2(
        storedRow("process_month_v2", {
          ...processMonthPayload,
          taxEvidence,
        }),
      ),
    ).toMatchObject({ payload: { taxEvidence } });
  });

  it("replays accepted rows to the same state and canonical checksum", () => {
    const fixture = replayFixture();

    expect(
      replayAcceptedCommandsV2(fixture.anchor, fixture.rows, 2),
    ).toEqual({
      state: fixture.second,
      stateChecksum: sha256Canonical(fixture.second),
    });
  });

  it("rejects a revision gap", () => {
    const fixture = replayFixture();

    expect(
      captureError(() =>
        replayAcceptedCommandsV2(fixture.anchor, [fixture.rows[1]!], 2),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it.each([
    ["unknown type", { commandType: "invented_command" }],
    ["invalid payload", { payload: null }],
  ])("rejects a stored command with %s", (_label, override) => {
    const fixture = replayFixture();
    const badRow = { ...fixture.rows[0]!, ...override };

    expect(
      captureError(() => replayAcceptedCommandsV2(fixture.anchor, [badRow], 1)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects anchor checksum drift", () => {
    const fixture = replayFixture();

    expect(
      captureError(() =>
        replayAcceptedCommandsV2(
          { ...fixture.anchor, stateChecksum: "0".repeat(64) },
          [],
          0,
        ),
      ),
    ).toBeInstanceOf(RunRepositoryError);
    expect(
      captureError(() =>
        replayAcceptedCommandsV2(
          { ...fixture.anchor, stateChecksum: "0".repeat(64) },
          [],
          0,
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects checksum drift after any replayed command", () => {
    const fixture = replayFixture();
    const rows = [
      { ...fixture.rows[0]!, resultingStateChecksum: "f".repeat(64) },
      fixture.rows[1]!,
    ];

    expect(
      captureError(() => replayAcceptedCommandsV2(fixture.anchor, rows, 2)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("chooses the latest compatible snapshot or migration anchor", () => {
    const fixture = replayFixture();
    const migrationAnchor: RunStateReplayAnchorV2 = {
      runId,
      revision: fixture.first.revision,
      stateSchemaVersion: fixture.first.schemaVersion,
      engineVersion: fixture.first.engineVersion,
      state: fixture.first,
      stateChecksum: sha256Canonical(fixture.first),
    };

    expect(
      selectLatestRunStateReplayAnchorV2(fixture.anchor, migrationAnchor),
    ).toBe(migrationAnchor);
    expect(
      selectLatestRunStateReplayAnchorV2(migrationAnchor, {
        ...migrationAnchor,
      }),
    ).not.toBe(migrationAnchor);
  });

  it("rejects a replay target with no compatible anchor", () => {
    expect(
      captureError(() => selectLatestRunStateReplayAnchorV2(null, null)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });
});
