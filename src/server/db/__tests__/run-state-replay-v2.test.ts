import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { RecordLearningInteractionV2Command } from "../../../core/learning-interaction-v2";
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

describe("verified v2 run-state replay", () => {
  it.each(validPayloads)(
    "strictly decodes a stored %s payload",
    (commandType, payload) => {
      expect(rebuildGameCommandV2(storedRow(commandType, payload))).toMatchObject({
        type: commandType,
        payload,
      });
    },
  );

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
