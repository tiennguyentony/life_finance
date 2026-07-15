import { describe, expect, it } from "vitest";

import { sha256Canonical } from "./canonical";
import { fastForwardToCheckpoint, planCheckpoint } from "./checkpoints";
import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { createInitialGameState, type GameState } from "./game-state";
import { processMonthlyTurn, type MonthlyTurnInput } from "./monthly-turn";

function state(birthMonth = "1990-01"): GameState {
  return createInitialGameState({
    runId: "run_checkpoint",
    startMonth: "2026-07",
    randomSeed: "checkpoint-golden",
    player: {
      playerId: "player_checkpoint",
      birthMonth,
      locationId: "US-CA",
      careerTrackId: "software_engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(20_000_00),
      taxableInvestmentsCents: moneyCents(40_000_00),
      retirementCents: moneyCents(60_000_00),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(10_000_00),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(5_000_00),
      creditLimitCents: moneyCents(10_000_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

const monthlyInput: MonthlyTurnInput = {
  employmentIncomeCents: moneyCents(8_000_00),
  taxableLiquidationCostRatePpm: ratePpm(10_000),
};

describe("elastic checkpoint planning", () => {
  it.each([
    ["monthly", 1, "2026-08"],
    ["quarterly", 3, "2026-10"],
    ["annual", 12, "2027-07"],
  ] as const)("plans %s calm pacing", (speed, months, stopMonth) => {
    expect(planCheckpoint(state(), speed)).toMatchObject({
      monthsToProcess: months,
      stopMonth,
      stopReason: "periodic_checkpoint",
    });
  });

  it("stops before the earliest event so the player can make a choice", () => {
    const plan = planCheckpoint(state(), "annual", [
      {
        id: "milestone.recap",
        month: simulationMonth("2027-01"),
        kind: "player_decision",
      },
      {
        id: "event.layoff",
        month: simulationMonth("2026-10"),
        kind: "personal_event",
      },
      {
        id: "macro.crash",
        month: simulationMonth("2026-10"),
        kind: "notable_macro",
      },
    ]);

    expect(plan.monthsToProcess).toBe(3);
    expect(plan.stopMonth).toBe("2026-10");
    expect(plan.stopReason).toBe("personal_event");
    expect(plan.pendingMilestones.map(({ id }) => id)).toEqual([
      "event.layoff",
      "macro.crash",
    ]);
  });

  it("processes zero months when an event is already due", () => {
    expect(
      planCheckpoint(state(), "annual", [
        {
          id: "event.now",
          month: simulationMonth("2026-07"),
          kind: "personal_event",
        },
      ]),
    ).toMatchObject({ monthsToProcess: 0, stopMonth: "2026-07" });
  });
});

describe("fast-forward execution and recap", () => {
  it("is checksum-identical to running the same twelve monthly laws manually", () => {
    const before = state();
    const plan = planCheckpoint(before, "annual");
    const fast = fastForwardToCheckpoint(
      before,
      plan,
      Array.from({ length: 12 }, () => monthlyInput),
    );
    let manual = before;
    for (let index = 0; index < 12; index += 1) {
      manual = processMonthlyTurn(
        manual,
        `cmd.fast_forward.${manual.currentMonth}`,
        monthlyInput,
      ).state;
    }

    expect(sha256Canonical(fast.state)).toBe(sha256Canonical(manual));
    expect(fast.state.currentMonth).toBe("2027-07");
    expect(fast.records).toHaveLength(12);
  });

  it("builds an exact intervention-ready financial recap", () => {
    const before = state();
    const result = fastForwardToCheckpoint(
      before,
      planCheckpoint(before, "quarterly"),
      [monthlyInput, monthlyInput, monthlyInput],
    );

    expect(result.recap.monthsProcessed).toBe(3);
    expect(result.recap.totalEmploymentIncomeCents).toBe(24_000_00);
    expect(result.recap.totalObligationsDueCents).toBe(15_000_00);
    expect(result.recap.end.month).toBe("2026-10");
    expect(result.recap.end.ageYears).toBe(36);
    expect(result.recap.end.financialIndependenceTargetCents).toBeGreaterThan(
      result.recap.start.financialIndependenceTargetCents,
    );
    expect(result.recap.netWorthChangeCents).toBe(
      result.recap.end.netWorthCents - result.recap.start.netWorthCents,
    );
    expect(Object.isFrozen(result.recap)).toBe(true);
  });

  it("stops an annual run immediately when a monthly turn becomes terminal", () => {
    const before = state("1961-08");
    const result = fastForwardToCheckpoint(
      before,
      planCheckpoint(before, "annual"),
      Array.from({ length: 12 }, () => monthlyInput),
    );

    expect(result.stopReason).toBe("terminal");
    expect(result.records).toHaveLength(1);
    expect(result.state.currentMonth).toBe("2026-08");
    expect(result.state.outcome).toMatchObject({ kind: "retirement_age" });
    expect(result.pendingMilestones).toEqual([]);
  });

  it("rejects missing deterministic month inputs before changing state", () => {
    const before = state();
    const plan = planCheckpoint(before, "quarterly");
    expect(() => fastForwardToCheckpoint(before, plan, [monthlyInput])).toThrow(
      expect.objectContaining({ code: "INPUT_COUNT_MISMATCH" }),
    );
    expect(before.revision).toBe(0);
  });
});
