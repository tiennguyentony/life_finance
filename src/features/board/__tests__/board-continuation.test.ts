import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { runViewSchema, type RunViewWire } from "@/contracts/api/contracts";

import { evaluateBoardContinuationV1 } from "../board-continuation";
import { plansForDestination, type BoardPlan } from "../plan-catalog";

function run(): RunViewWire {
  return runViewSchema.parse(projectRunView(currentRunState()));
}

function planById(source: RunViewWire, destination: BoardPlan["destinationId"], id: string) {
  return plansForDestination(source, destination).find((plan) => plan.id === id)!;
}

describe("evaluateBoardContinuationV1", () => {
  it("rebuilds a repeat transaction from the ending run and uses its current amount", () => {
    const opening = run();
    const plan = planById(opening, "bank", "bank.pay-credit");
    const ending = {
      ...opening,
      revision: opening.revision + 2,
      currentMonth: "2026-08",
      finances: {
        ...opening.finances,
        cashCents: 32_000,
        creditUsedCents: 32_000,
      },
    } satisfies RunViewWire;

    const decision = evaluateBoardContinuationV1({ opening, ending, plan });

    expect(decision).toMatchObject({
      kind: "repeat_transaction",
      primaryLabel: "Pay another $320",
      plan: {
        command: {
          type: "take_detailed_action",
          action: { type: "pay_revolving_credit", amountCents: 32_000 },
        },
      },
    });
  });

  it("advances without repeating a one-time plan", () => {
    const opening = run();
    const plan = planById(opening, "startup", "startup.certificate");

    expect(evaluateBoardContinuationV1({
      opening,
      ending: { ...opening, currentMonth: "2026-08", revision: 2 },
      plan,
    })).toEqual({
      kind: "advance_only",
      primaryLabel: "Continue one month",
    });
  });

  it("stops for a pending event before every other interruption", () => {
    const opening = run();
    const plan = planById(opening, "financial", "financial.broad-index");
    const ending = {
      ...opening,
      status: "completed" as const,
      currentMonth: "2027-07",
      beginnerCheckpoint: {
        version: "beginner-chapter-v1" as const,
        checkpointMonth: "2027-07",
        outcome: "fragile" as const,
        completed: false,
        scorePpm: 200_000,
        preparednessBand: "critical" as const,
        weakestComponent: "liquidity" as const,
        lessonKey: "lesson.emergency_fund",
      },
      pendingInteraction: {
        kind: "event" as const,
        eventId: "event.1",
        templateId: "personal.medical_bill",
        choiceIds: ["pay_uninsured"],
        choices: [
          {
            id: "pay_uninsured",
            label: "Pay",
            description: "Pay the bill now.",
            enabled: true,
            preview: {
              version: "personal-event-response-preview-v1" as const,
              status: "available" as const,
              immediateCashChangeCents: -50_000,
              recurringCashFlows: [],
              annualLivingCostChangeCents: 0,
              wellbeingChangesPpm: { happiness: 0, burnout: 0 },
              followUps: [],
              netOutcomeCents: -50_000,
              unavailableReason: null,
              summary: "Pay $500 now.",
            },
          },
        ],
        parameters: {},
        headline: "A bill arrives",
        body: "Choose a response.",
      },
    } satisfies RunViewWire;

    expect(evaluateBoardContinuationV1({ opening, ending, plan })).toEqual({
      kind: "stop",
      reason: "pending_event",
      message: "Review the life decision before continuing.",
    });
  });

  it("stops when a course completes or the chapter checkpoint arrives", () => {
    const opening = {
      ...run(),
      career: { pendingProgramIds: ["upskill.certificate"] },
    } satisfies RunViewWire;
    const plan = planById(opening, "financial", "financial.broad-index");

    expect(evaluateBoardContinuationV1({
      opening,
      ending: { ...opening, career: { pendingProgramIds: [] } },
      plan,
    })).toMatchObject({ kind: "stop", reason: "course_completed" });
    expect(evaluateBoardContinuationV1({
      opening: { ...opening, career: { pendingProgramIds: [] } },
      ending: {
        ...opening,
        career: { pendingProgramIds: [] },
        beginnerCheckpoint: {
          version: "beginner-chapter-v1",
          checkpointMonth: "2027-07",
          outcome: "developing",
          completed: true,
          scorePpm: 400_000,
          preparednessBand: "exposed",
          weakestComponent: "debt",
          lessonKey: "lesson.debt_management",
        },
      },
      plan,
    })).toMatchObject({ kind: "stop", reason: "chapter_checkpoint" });
  });

  it("stops on newly crossed warnings but not an already acknowledged warning", () => {
    const base = run();
    const plan = planById(base, "financial", "financial.broad-index");
    const safe = {
      ...base,
      preparedness: { ...base.preparedness, scorePpm: 300_000, band: "exposed" as const },
      finances: { ...base.finances, creditLimitCents: 1_000_000, creditUsedCents: 799_999 },
    } satisfies RunViewWire;
    const critical = {
      ...safe,
      preparedness: { ...safe.preparedness, scorePpm: 200_000, band: "critical" as const },
    } satisfies RunViewWire;

    expect(evaluateBoardContinuationV1({ opening: safe, ending: critical, plan }))
      .toMatchObject({ kind: "stop", reason: "warning_crossed" });
    expect(evaluateBoardContinuationV1({
      opening: critical,
      ending: {
        ...critical,
        finances: { ...critical.finances, creditUsedCents: 800_000 },
      },
      plan,
    })).toMatchObject({ kind: "stop", reason: "warning_crossed" });
    expect(evaluateBoardContinuationV1({
      opening: {
        ...critical,
        finances: { ...critical.finances, creditUsedCents: 800_000 },
      },
      ending: {
        ...critical,
        finances: { ...critical.finances, creditUsedCents: 850_000 },
      },
      plan,
    })).toMatchObject({ kind: "repeat_transaction" });
  });

  it("stops without a command when a repeated plan becomes unavailable", () => {
    const opening = run();
    const plan = planById(opening, "financial", "financial.broad-index");
    const ending = {
      ...opening,
      finances: { ...opening.finances, cashCents: 0 },
    } satisfies RunViewWire;

    expect(evaluateBoardContinuationV1({ opening, ending, plan })).toEqual({
      kind: "stop",
      reason: "plan_unavailable",
      message: "You need $500 in cash.",
    });
  });
});
