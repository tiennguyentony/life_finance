import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import {
  runViewSchema,
  type CommandResponseWire,
  type RunViewWire,
} from "@/contracts/api/contracts";

import type { BoardPlan } from "../plan-catalog";
import { commitBoardTurn } from "../turn-commit";

const actionPlan: BoardPlan = {
  id: "bank.pay-credit",
  destinationId: "bank",
  label: "Pay revolving credit",
  description: "Pay down the balance.",
  effects: [],
  disabledReason: null,
  command: {
    type: "take_detailed_action",
    action: { type: "pay_revolving_credit", amountCents: 50_000 },
  },
};

const noActionPlan: BoardPlan = {
  ...actionPlan,
  id: "bank.stay-the-course",
  label: "Stay the course",
  command: { type: "none" },
};

function response(run: RunViewWire): CommandResponseWire {
  return {
    run,
    stateChecksum: "a".repeat(64),
    result: { idempotentReplay: false, monthlyRecord: null },
  };
}

function openingRun(): RunViewWire {
  return runViewSchema.parse(projectRunView(currentRunState()));
}

describe("commitBoardTurn", () => {
  it("submits the selected action before processing the month at its returned revision", async () => {
    const opening = openingRun();
    const planAppliedRun = { ...opening, revision: opening.revision + 1 };
    const completedRun = {
      ...planAppliedRun,
      currentMonth: "2026-08",
      revision: planAppliedRun.revision + 1,
    };
    const calls: Array<{ type: string; expectedRevision: number; id: string }> = [];
    const client = {
      submitCommand: async (_runId: string, command: { type: string; expectedRevision: number; id: string }) => {
        calls.push(command);
        return calls.length === 1 ? response(planAppliedRun) : response(completedRun);
      },
    };

    const result = await commitBoardTurn({
      client,
      opening,
      plan: actionPlan,
      createId: (phase) => `turn.${phase}`,
    });

    expect(calls.map(({ type }) => type)).toEqual(["take_detailed_action", "process_month"]);
    expect(calls[0]).toMatchObject({ id: "turn.plan", expectedRevision: opening.revision });
    expect(calls[1]).toMatchObject({ id: "turn.month", expectedRevision: planAppliedRun.revision });
    expect(result).toMatchObject({
      kind: "completed",
      opening,
      run: completedRun,
      planApplied: true,
    });
  });

  it("processes a no-action plan as a month-only turn", async () => {
    const opening = openingRun();
    const completedRun = { ...opening, currentMonth: "2026-08", revision: opening.revision + 1 };
    const calls: Array<{ type: string; expectedRevision: number; id: string }> = [];
    const phases: string[] = [];
    const client = {
      submitCommand: async (_runId: string, command: { type: string; expectedRevision: number; id: string }) => {
        calls.push(command);
        return response(completedRun);
      },
    };

    const result = await commitBoardTurn({
      client,
      opening,
      plan: noActionPlan,
      createId: (phase) => {
        phases.push(phase);
        return `turn.${phase}`;
      },
    });

    expect(calls).toEqual([{
      id: "turn.month",
      expectedRevision: opening.revision,
      type: "process_month",
      payload: {},
    }]);
    expect(phases).toEqual(["month"]);
    expect(result).toMatchObject({ kind: "completed", run: completedRun, planApplied: false });
  });

  it("stops before month processing when the selected action fails", async () => {
    const opening = openingRun();
    const error = new Error("action rejected");
    const calls: Array<{ type: string }> = [];
    const client = {
      submitCommand: async (_runId: string, command: { type: string }) => {
        calls.push(command);
        throw error;
      },
    };

    const result = await commitBoardTurn({
      client,
      opening,
      plan: actionPlan,
      createId: (phase) => `turn.${phase}`,
    });

    expect(calls.map(({ type }) => type)).toEqual(["take_detailed_action"]);
    expect(result).toMatchObject({ kind: "plan_failed", run: opening, error });
  });

  it("preserves an applied plan when subsequent month processing fails", async () => {
    const opening = openingRun();
    const planAppliedRun = { ...opening, revision: opening.revision + 1 };
    const error = new Error("month rejected");
    const calls: Array<{ type: string; expectedRevision: number }> = [];
    const client = {
      submitCommand: async (_runId: string, command: { type: string; expectedRevision: number }) => {
        calls.push(command);
        if (calls.length === 1) return response(planAppliedRun);
        throw error;
      },
    };

    const result = await commitBoardTurn({
      client,
      opening,
      plan: actionPlan,
      createId: (phase) => `turn.${phase}`,
    });

    expect(calls.map(({ type }) => type)).toEqual(["take_detailed_action", "process_month"]);
    expect(calls[1]).toMatchObject({ expectedRevision: planAppliedRun.revision });
    expect(result).toMatchObject({
      kind: "month_failed",
      run: planAppliedRun,
      planApplied: true,
      error,
    });
  });
});
