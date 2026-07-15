import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, validateGameStateV2 } from "../game-state-v2";
import {
  assertNoDueLifeMilestone,
  dueLifeMilestones,
  manageLifeMilestoneV2,
  type ManageLifeMilestoneV2Command,
} from "../life-milestones-v2";

function state() {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.milestone",
    startMonth: "2026-07",
    randomSeed: "milestone",
    player: {
      playerId: "player.milestone",
      birthMonth: "1995-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(0),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(600_000),
      requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

function scheduleCommand(expectedRevision = 0): ManageLifeMilestoneV2Command {
  return {
    schemaVersion: 2,
    id: `cmd.milestone.schedule.${expectedRevision}`,
    type: "manage_life_milestone",
    expectedRevision,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      action: "schedule",
      milestoneId: "milestone.wedding",
      kind: "wedding",
      label: "Small family wedding",
      targetMonth: simulationMonth("2026-07"),
      estimatedCostCents: moneyCents(500_000),
    },
  };
}

describe("planned life milestone lifecycle", () => {
  it("schedules a due expense and blocks time until a decision", () => {
    const scheduled = manageLifeMilestoneV2(state(), scheduleCommand());

    expect(dueLifeMilestones(scheduled)).toHaveLength(1);
    expect(() => assertNoDueLifeMilestone(scheduled)).toThrow(
      expect.objectContaining({ code: "MILESTONE_DECISION_REQUIRED" }),
    );
    expect(validateGameStateV2(scheduled)).toEqual([]);
  });

  it("pays through the ledger and preserves resolution evidence", () => {
    const scheduled = manageLifeMilestoneV2(state(), scheduleCommand());
    const paid = manageLifeMilestoneV2(scheduled, {
      schemaVersion: 2,
      id: "cmd.milestone.pay",
      type: "manage_life_milestone",
      expectedRevision: 1,
      effectiveMonth: scheduled.currentMonth,
      payload: {
        action: "resolve",
        milestoneId: "milestone.wedding",
        resolution: "pay_cash",
      },
    });

    expect(paid.finances.cashCents).toBe(500_000);
    expect(paid.gameplay.lifeMilestones?.scheduled).toEqual([]);
    expect(paid.gameplay.lifeMilestones?.history[0]).toMatchObject({
      resolution: "paid_cash",
      actualCostCents: 500_000,
      postponementCount: 0,
    });
    expect(paid.ledger.transactions.at(-1)?.reasonCode).toBe("life_milestone_wedding");
    expect(validateGameStateV2(paid)).toEqual([]);
  });

  it("postpones without charging cash and rejects unaffordable payment", () => {
    const scheduled = manageLifeMilestoneV2(state(), scheduleCommand());
    const postponed = manageLifeMilestoneV2(scheduled, {
      schemaVersion: 2,
      id: "cmd.milestone.postpone",
      type: "manage_life_milestone",
      expectedRevision: 1,
      effectiveMonth: scheduled.currentMonth,
      payload: { action: "resolve", milestoneId: "milestone.wedding", resolution: "postpone_6_months" },
    });
    expect(postponed.gameplay.lifeMilestones?.scheduled[0]).toMatchObject({
      targetMonth: "2027-01",
      postponementCount: 1,
    });
    expect(postponed.finances.cashCents).toBe(1_000_000);

    const expensive = manageLifeMilestoneV2(state(), {
      ...scheduleCommand(),
      id: "cmd.milestone.expensive",
      payload: { ...scheduleCommand().payload, estimatedCostCents: moneyCents(2_000_000) },
    } as ManageLifeMilestoneV2Command);
    expect(() => manageLifeMilestoneV2(expensive, {
      schemaVersion: 2,
      id: "cmd.milestone.cannot-pay",
      type: "manage_life_milestone",
      expectedRevision: 1,
      effectiveMonth: expensive.currentMonth,
      payload: { action: "resolve", milestoneId: "milestone.wedding", resolution: "pay_cash" },
    })).toThrow(expect.objectContaining({ code: "INSUFFICIENT_CASH" }));
  });
});
