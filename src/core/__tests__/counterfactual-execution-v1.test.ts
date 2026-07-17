import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  executeCounterfactualV1,
  planCounterfactualV1,
  type CounterfactualExecutionPortV1,
  type CounterfactualRequestV1,
} from "../counterfactual-v1";
import { ratePpm } from "../domain/money";
import type { SimulationMonth } from "../domain/month";
import type { SetRecurringStrategyCommand } from "../recurring-strategy-v2";

type FakeState = Readonly<{
  revision: number;
  month: SimulationMonth;
  cashCents: number;
  debtCents: number;
  monthlyRatePpm: number;
  randomValue: number;
  outcomeKind: string | null;
}>;

type FakeFutureCommand = Readonly<{
  id: string;
  type: "fake_month" | "fake_action";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
}>;

type FakeCommand = SetRecurringStrategyCommand | FakeFutureCommand;
type FakeMonthlyRecord = Readonly<{
  forcedSaleGrossCents: number;
  forcedSaleCount: number;
  newRevolvingCreditCents: number;
  residualShortfallCents: number;
}>;

function openingState(): FakeState {
  return {
    revision: 4,
    month: "2026-07" as SimulationMonth,
    cashCents: 1_000_000,
    debtCents: 100_000,
    monthlyRatePpm: 0,
    randomValue: 77,
    outcomeKind: null,
  };
}

function strategyCommand(): SetRecurringStrategyCommand {
  return {
    schemaVersion: 2,
    id: "cmd.strategy.execution",
    type: "set_recurring_strategy",
    expectedRevision: 4,
    effectiveMonth: "2026-07" as SetRecurringStrategyCommand["effectiveMonth"],
    payload: {
      strategy: {
        emergencyFundTargetMonthsPpm: ratePpm(3_000_000),
        insuranceCoverageIds: ["insurance.renters"],
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(100_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  };
}

function plan(opening: FakeState, horizonMonths = 2) {
  const source = strategyCommand();
  const request: CounterfactualRequestV1 = {
    version: "counterfactual-v1",
    sourceCommandId: source.id,
    intervention: {
      kind: "recurring_strategy_field",
      commandId: source.id,
      field: "afterTaxBroadIndexRatePpm",
      value: 150_000,
    },
    horizonMonths,
  };
  return {
    source,
    plan: planCounterfactualV1({
      request,
      sourceCommand: source,
      seedEvidence: {
        mode: "shared_cursor",
        stateEvidenceId: `state:${opening.revision}:${sha256Canonical(opening)}`,
        randomStateChecksum: sha256Canonical(opening.randomValue),
      },
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    }),
  };
}

function futureMonth(revision: number, month: string): FakeFutureCommand {
  return {
    id: `cmd.month.${revision}`,
    type: "fake_month",
    expectedRevision: revision,
    effectiveMonth: month as SimulationMonth,
  };
}

function port(
  reduceOverride?: CounterfactualExecutionPortV1<
    FakeState,
    FakeCommand,
    FakeMonthlyRecord
  >["reduceProductionCommand"],
): CounterfactualExecutionPortV1<
  FakeState,
  FakeCommand,
  FakeMonthlyRecord
> {
  const reduceProductionCommand = reduceOverride ?? ((state, command) => {
    if (command.type === "set_recurring_strategy") {
      return {
        state: {
          ...state,
          revision: state.revision + 1,
          monthlyRatePpm:
            command.payload.strategy.afterTaxBroadIndexRatePpm,
        },
        monthlyRecord: null,
      };
    }
    const monthly = command.type === "fake_month";
    return {
      state: {
        ...state,
        revision: state.revision + 1,
        month: command.effectiveMonth,
        cashCents:
          state.cashCents + (monthly ? state.monthlyRatePpm / 10 : 0),
        randomValue: state.randomValue + (monthly ? 1 : 0),
      },
      monthlyRecord: monthly
        ? {
            forcedSaleGrossCents: 0,
            forcedSaleCount: 0,
            newRevolvingCreditCents: 0,
            residualShortfallCents: 0,
          }
        : null,
    };
  });
  return {
    reduceProductionCommand,
    canonicalStateChecksum: sha256Canonical,
    commandMetadata: (command) => ({
      id: command.id,
      expectedRevision: command.expectedRevision,
      effectiveMonth: command.effectiveMonth as SimulationMonth,
      isMonthlyCommand: command.type === "fake_month",
    }),
    summarizeState: (state) => ({
      revision: state.revision,
      month: state.month,
      cashCents: state.cashCents,
      totalDebtCents: state.debtCents,
      netWorthCents: state.cashCents - state.debtCents,
      recoveryRemainingMonths: null,
      fiProgressPpm: 100_000,
      outcomeKind: state.outcomeKind,
      outcomeReasonCode: null,
    }),
    summarizeMonthlyRecord: (record) => record,
    taxCompatibilityBeforeMonthlyCommand: (_actual, _alternative, command) => ({
      compatible: true,
      actualContextFingerprint: "a".repeat(64),
      alternativeContextFingerprint: "a".repeat(64),
      taxEvidenceId: `tax:trace.${command.expectedRevision}`,
    }),
    seedEvidenceAtMonthlyOpening: (actual, alternative) => ({
      actual: {
        mode: "shared_cursor",
        stateEvidenceId: `state:${actual.revision}:${sha256Canonical(actual)}`,
        randomStateChecksum: sha256Canonical(actual.randomValue),
      },
      alternative: {
        mode: "shared_cursor",
        stateEvidenceId: `state:${alternative.revision}:${sha256Canonical(alternative)}`,
        randomStateChecksum: sha256Canonical(alternative.randomValue),
      },
    }),
  };
}

describe("Counterfactual v1 execution", () => {
  it("runs both branches through the supplied production reducer and changes one policy only", () => {
    const opening = openingState();
    const { source, plan: counterfactualPlan } = plan(opening);
    const future = [futureMonth(5, "2026-08"), futureMonth(6, "2026-09")];
    const openingBefore = sha256Canonical(opening);
    const sourceBefore = sha256Canonical(source);
    const futureBefore = sha256Canonical(future);
    const executionPort = port();
    const reducer = vi.spyOn(executionPort, "reduceProductionCommand");

    const result = executeCounterfactualV1(
      {
        plan: counterfactualPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: future,
      },
      executionPort,
    );

    expect(reducer).toHaveBeenCalledTimes(6);
    expect(result).toMatchObject({
      comparedMonths: 2,
      acceptedCommandCount: 3,
      stopReason: "requested_horizon_reached",
      seedControl: { mode: "matched_shared_cursor_through_horizon" },
      difference: {
        direction: "alternative_minus_actual",
        cashCents: 10_000,
        netWorthCents: 10_000,
      },
    });
    expect(result.changedPaths).toEqual([
      "payload.strategy.afterTaxBroadIndexRatePpm",
    ]);
    expect(result.resultChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Canonical(opening)).toBe(openingBefore);
    expect(sha256Canonical(source)).toBe(sourceBefore);
    expect(sha256Canonical(future)).toBe(futureBefore);
    expect(
      executeCounterfactualV1(
        {
          plan: counterfactualPlan,
          openingState: opening,
          sourceCommand: source,
          futureCommands: future,
        },
        port(),
      ),
    ).toEqual(result);
  });

  it("stops before a monthly transition when tax evidence is incompatible", () => {
    const opening = openingState();
    const { source, plan: counterfactualPlan } = plan(opening);
    const executionPort = {
      ...port(),
      taxCompatibilityBeforeMonthlyCommand: () => ({
        compatible: false as const,
        reason: "context_mismatch" as const,
      }),
    };
    const reducer = vi.spyOn(executionPort, "reduceProductionCommand");

    const result = executeCounterfactualV1(
      {
        plan: counterfactualPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: [futureMonth(5, "2026-08")],
      },
      executionPort,
    );

    expect(result.stopReason).toBe(
      "tax_evidence_not_valid_for_alternative",
    );
    expect(result.comparedMonths).toBe(0);
    expect(reducer).toHaveBeenCalledTimes(2);
  });

  it("labels shared-cursor divergence and does not reset either branch", () => {
    const opening = openingState();
    const { source, plan: counterfactualPlan } = plan(opening);
    const executionPort = {
      ...port(),
      seedEvidenceAtMonthlyOpening: (actual: FakeState, alternative: FakeState) => ({
        actual: {
          mode: "shared_cursor" as const,
          stateEvidenceId: `state:${actual.revision}:${sha256Canonical(actual)}`,
          randomStateChecksum: sha256Canonical(actual.randomValue),
        },
        alternative: {
          mode: "shared_cursor" as const,
          stateEvidenceId: `state:${alternative.revision}:${sha256Canonical(alternative)}`,
          randomStateChecksum: sha256Canonical(alternative.randomValue + 1),
        },
      }),
    };

    const result = executeCounterfactualV1(
      {
        plan: counterfactualPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: [futureMonth(5, "2026-08")],
      },
      executionPort,
    );

    expect(result).toMatchObject({
      comparedMonths: 0,
      stopReason: "seed_control_unavailable_after_rng_divergence",
      seedControl: { mode: "partial_shared_cursor_then_diverged" },
    });
  });

  it("holds named macro and event-opportunity epochs constant while branch streams differ", () => {
    const opening = openingState();
    const { source, plan: sharedPlan } = plan(opening, 1);
    const namedPlan = {
      ...sharedPlan,
      seedEvidence: {
        mode: "named_world" as const,
        version: "named-world-rng-v1" as const,
        stateEvidenceId: `state:${opening.revision}:${sha256Canonical(opening)}`,
        macroEpoch: 7,
        eventOpportunityEpoch: 7,
        streamStateChecksum: "a".repeat(64),
      },
    };
    const executionPort = {
      ...port(),
      seedEvidenceAtMonthlyOpening: (actual: FakeState, alternative: FakeState) => ({
        actual: {
          mode: "named_world" as const,
          version: "named-world-rng-v1" as const,
          stateEvidenceId: `state:${actual.revision}:${sha256Canonical(actual)}`,
          macroEpoch: 8,
          eventOpportunityEpoch: 8,
          streamStateChecksum: sha256Canonical({ branch: "actual", actual }),
        },
        alternative: {
          mode: "named_world" as const,
          version: "named-world-rng-v1" as const,
          stateEvidenceId: `state:${alternative.revision}:${sha256Canonical(alternative)}`,
          macroEpoch: 8,
          eventOpportunityEpoch: 8,
          streamStateChecksum: sha256Canonical({
            branch: "alternative",
            alternative,
          }),
        },
      }),
    };

    const result = executeCounterfactualV1(
      {
        plan: namedPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: [futureMonth(5, "2026-08")],
      },
      executionPort,
    );

    expect(result.stopReason).toBe("requested_horizon_reached");
    expect(result.seedControl.mode).toBe("matched_named_world");
  });

  it("stops without committing a one-sided future command when the alternative rejects it", () => {
    const opening = openingState();
    const { source, plan: counterfactualPlan } = plan(opening);
    const basePort = port();
    const executionPort = port((state, command) => {
      if (command.type === "fake_month" && state.monthlyRatePpm === 150_000) {
        throw new Error("alternate event path no longer accepts this command");
      }
      return basePort.reduceProductionCommand(state, command);
    });

    const result = executeCounterfactualV1(
      {
        plan: counterfactualPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: [futureMonth(5, "2026-08")],
      },
      executionPort,
    );

    expect(result.stopReason).toBe("future_command_no_longer_valid");
    expect(result.comparedMonths).toBe(0);
    expect(result.actual.revision).toBe(5);
    expect(result.alternative.revision).toBe(5);
  });

  it("enforces the 256-command semantic bound without a wall-clock branch", () => {
    const opening = openingState();
    const { source, plan: counterfactualPlan } = plan(opening, 24);
    const future = Array.from({ length: 256 }, (_, index) => ({
      id: `cmd.action.${index}`,
      type: "fake_action" as const,
      expectedRevision: 5 + index,
      effectiveMonth: "2026-07" as SimulationMonth,
    }));

    const result = executeCounterfactualV1(
      {
        plan: counterfactualPlan,
        openingState: opening,
        sourceCommand: source,
        futureCommands: future,
      },
      port(),
    );

    expect(result.stopReason).toBe("command_limit_reached");
    expect(result.acceptedCommandCount).toBe(256);
    expect(result.comparedMonths).toBe(0);
    expect(result.seedControl.mode).toBe("not_applicable_no_future_month");
  });
});
