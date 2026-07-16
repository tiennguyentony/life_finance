import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import {
  finalizeGameStateV2,
  migrateGameStateV1ToV2,
  type GameStateV2,
} from "../game-state-v2";
import { runtimeBalanceStateV1 } from "../runtime-balance-state-v1";
import {
  assertValidGameStateTransitionV2,
  InvalidGameStateTransitionV2Error,
  validateGameStateTransitionV2,
} from "../state-transition-v2";
import { reduceGameCommandV2 } from "../../server/db/run-repository-support";

function initialState(): GameStateV2 {
  return migrateGameStateV1ToV2(
    createInitialGameState({
      runId: "run.state-transition",
      startMonth: "2026-07",
      randomSeed: "state-transition",
      player: {
        playerId: "player.state-transition",
        birthMonth: "1990-01",
        locationId: "location.seattle",
        careerTrackId: "career.software",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(100_00),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
        homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(0),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(60_000_00),
        requiredObligationsCents: moneyCents(1_000_00),
      },
      wellbeing: {
        burnoutPpm: ratePpm(100_000),
        happinessPpm: ratePpm(900_000),
      },
    }),
  );
}

function acceptedNext(
  previous: GameStateV2,
  commandId = "command.next",
): GameStateV2 {
  return finalizeGameStateV2({
    ...previous,
    revision: previous.revision + 1,
    acceptedCommandIds: [...previous.acceptedCommandIds, commandId],
    gameplay: {
      ...previous.gameplay,
      runtimeBalance: runtimeBalanceStateV1(previous),
    },
  });
}

describe("schema-v2 state transitions", () => {
  it("accepts one valid authoritative transition", () => {
    const previous = initialState();
    const next = acceptedNext(previous);

    expect(validateGameStateTransitionV2(previous, next, "command.next")).toEqual(
      [],
    );
    expect(() =>
      assertValidGameStateTransitionV2(previous, next, "command.next"),
    ).not.toThrow();
  });

  it("rejects identity, version, revision, month, and command-history drift", () => {
    const previous = initialState();
    const valid = acceptedNext(previous);
    const cases: readonly Readonly<{
      next: GameStateV2;
      code: string;
    }>[] = [
      { next: { ...valid, runId: "run.changed" }, code: "run_id_changed" },
      {
        next: { ...valid, schemaVersion: 1 } as unknown as GameStateV2,
        code: "schema_version_changed",
      },
      {
        next: { ...valid, engineVersion: "changed" } as unknown as GameStateV2,
        code: "engine_version_changed",
      },
      {
        next: { ...valid, startMonth: "2026-06" } as GameStateV2,
        code: "start_month_changed",
      },
      {
        next: {
          ...valid,
          player: { ...valid.player, playerId: "player.changed" },
        },
        code: "player_id_changed",
      },
      {
        next: {
          ...valid,
          player: { ...valid.player, birthMonth: "1991-01" },
        } as GameStateV2,
        code: "birth_month_changed",
      },
      {
        next: { ...valid, revision: previous.revision + 2 },
        code: "revision_not_incremented",
      },
      {
        next: { ...valid, currentMonth: "2026-06" } as GameStateV2,
        code: "month_regressed",
      },
      {
        next: { ...valid, acceptedCommandIds: ["command.other"] },
        code: "accepted_command_ids_not_appended",
      },
    ];

    for (const testCase of cases) {
      expect(
        validateGameStateTransitionV2(
          previous,
          testCase.next,
          "command.next",
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: testCase.code }),
        ]),
      );
    }
  });

  it("preserves ledger account definitions and prior transactions canonically", () => {
    const previous = initialState();
    const valid = acceptedNext(previous);
    const [accountId, account] = Object.entries(valid.ledger.accounts)[0]!;
    const firstTransaction = valid.ledger.transactions[0]!;
    const drifted = {
      ...valid,
      ledger: {
        accounts: {
          ...valid.ledger.accounts,
          [accountId]: { ...account, name: `${account.name} changed` },
        },
        transactions: [
          { ...firstTransaction, description: "Changed prior evidence" },
          ...valid.ledger.transactions.slice(1),
        ],
      },
    } as GameStateV2;

    expect(
      validateGameStateTransitionV2(previous, drifted, "command.next"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ledger_accounts_changed" }),
        expect.objectContaining({ code: "ledger_transaction_prefix_changed" }),
      ]),
    );
  });

  it("does not allow a terminal outcome to disappear or change", () => {
    const base = initialState();
    const previous = finalizeGameStateV2({
      ...base,
      outcome: {
        kind: "bankruptcy",
        grade: "F",
        reachedMonth: base.currentMonth,
        reasonCode: "test_terminal",
      },
    });
    const valid = acceptedNext(previous);

    expect(
      validateGameStateTransitionV2(
        previous,
        { ...valid, outcome: null },
        "command.next",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "terminal_outcome_changed" }),
      ]),
    );
    expect(
      validateGameStateTransitionV2(
        previous,
        {
          ...valid,
          outcome: { ...previous.outcome!, reasonCode: "changed_terminal" },
        },
        "command.next",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "terminal_outcome_changed" }),
      ]),
    );
  });

  it("retains structured next-state violations for an invalid pending decision", () => {
    const previous = initialState();
    const valid = acceptedNext(previous);
    const invalid = {
      ...valid,
      gameplay: {
        ...valid.gameplay,
        eventLifecycle: {
          ...valid.gameplay.eventLifecycle,
          pending: {
            eventId: "event.pending",
            templateId: "template.pending",
            templateVersion: 1,
            tier: "medium",
            targetedWeakness: "low_emergency_fund",
            parameters: {},
            choiceIds: [],
            scheduledMonth: valid.currentMonth,
            expiresMonth: valid.currentMonth,
          },
        },
      },
    } as GameStateV2;

    expect(
      validateGameStateTransitionV2(previous, invalid, "command.next"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_pending_event" }),
        expect.objectContaining({ code: "invalid_pending_window" }),
      ]),
    );
    expect(() =>
      assertValidGameStateTransitionV2(previous, invalid, "command.next"),
    ).toThrow(InvalidGameStateTransitionV2Error);
  });

  it("normalizes Runtime Balance on the next accepted command", () => {
    const migrated = initialState();
    const gameplay = { ...migrated.gameplay } as Record<string, unknown>;
    Reflect.deleteProperty(gameplay, "runtimeBalance");
    const olderV2 = finalizeGameStateV2({
      ...migrated,
      gameplay,
    } as GameStateV2);

    const command = {
      schemaVersion: 2 as const,
      id: "command.normalize-runtime-balance",
      type: "set_recurring_strategy" as const,
      expectedRevision: olderV2.revision,
      effectiveMonth: olderV2.currentMonth,
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: ratePpm(0),
          preTaxHsaSalaryRatePpm: ratePpm(0),
          afterTaxBroadIndexRatePpm: ratePpm(0),
          afterTaxSectorRatePpm: ratePpm(0),
          afterTaxSpeculativeRatePpm: ratePpm(0),
          afterTaxIraRatePpm: ratePpm(0),
          afterTaxExtraDebtRatePpm: ratePpm(0),
        },
      },
    };

    const result = reduceGameCommandV2(olderV2, command);

    expect(result.state.gameplay.runtimeBalance).toEqual(
      runtimeBalanceStateV1(olderV2),
    );
    expect(Object.hasOwn(result.state.gameplay, "runtimeBalance")).toBe(true);
    expect(
      validateGameStateTransitionV2(olderV2, result.state, command.id),
    ).toEqual([]);
  });
});
