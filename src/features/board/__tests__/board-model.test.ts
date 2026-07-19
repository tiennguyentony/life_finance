import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import { boardMonthResult, boardViewFromRun } from "../board-model";

describe("board view model", () => {
  it("projects backend-owned finances and progress into the board HUD", () => {
    const view = boardViewFromRun(projectRunView(currentRunState()));

    expect(view.stats).toEqual([
      { id: "cash", label: "Cash", amount: 10_000, tone: "lime" },
      { id: "net-worth", label: "Net Worth", amount: 48_500, tone: "blue" },
      { id: "debt", label: "Debt", amount: -22_000, tone: "coral" },
    ]);
    expect(view.calendar).toEqual({ label: "July", detail: "2026" });
    expect(view.goal).toMatchObject({
      label: "Reach financial independence",
      current: 48_000,
      target: 1_625_000,
    });
    expect(view.pendingEvent).toBeNull();
  });

  it("calculates authoritative before-and-after turn deltas", () => {
    const opening = projectRunView(currentRunState());
    const ending = {
      ...opening,
      currentMonth: "2026-08",
      finances: {
        ...opening.finances,
        cashCents: opening.finances.cashCents + 125_000,
        netWorthCents: opening.finances.netWorthCents + 150_000,
        creditUsedCents: opening.finances.creditUsedCents - 25_000,
      },
      goal: { ...opening.goal, progressPpm: opening.goal.progressPpm + 4_000 },
    };

    expect(boardMonthResult(opening, ending, "Pay down credit")).toMatchObject({
      fromMonth: "2026-07",
      toMonth: "2026-08",
      planLabel: "Pay down credit",
      cashChangeCents: 125_000,
      netWorthChangeCents: 150_000,
      debtChangeCents: -25_000,
      goalProgressChangePpm: 4_000,
    });
  });

  it("uses event choices and parameters from the authoritative run projection", () => {
    const run = {
      ...projectRunView(currentRunState()),
      pendingInteraction: {
        kind: "event" as const,
        eventId: "event.unexpected-expense",
        templateId: "event.unexpected-expense",
        choiceIds: ["pay-now"],
        choices: [{
          id: "pay-now",
          label: "Pay it now",
          description: "Use cash to resolve the expense.",
          enabled: true,
          preview: {
            version: "personal-event-response-preview-v1" as const,
            status: "available" as const,
            immediateCashChangeCents: -125_000,
            recurringCashFlows: [],
            annualLivingCostChangeCents: 0,
            wellbeingChangesPpm: { happiness: 0, burnout: 0 },
            followUps: [],
            netOutcomeCents: null,
            unavailableReason: null,
            summary: "Pay $1,250.00 now.",
          },
        }],
        parameters: { expenseCents: 125_000 },
        headline: "An unexpected expense",
        body: "A repair bill arrived.",
      },
    };

    expect(boardViewFromRun(run).pendingEvent).toEqual({
      eventId: "event.unexpected-expense",
      headline: "An unexpected expense",
      body: "A repair bill arrived.",
      parameters: { expenseCents: 125_000 },
      choices: [{
        id: "pay-now",
        label: "Pay it now",
        description: "Use cash to resolve the expense.",
        enabled: true,
        preview: expect.objectContaining({
          status: "available",
          immediateCashChangeCents: -125_000,
        }),
      }],
    });
  });
});
