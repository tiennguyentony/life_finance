import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { reduceGameCommand, type ProcessMonthCommand } from "../commands";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createInitialGameState, type GameState } from "../game-state";
import { processMonthlyTurn } from "../monthly-turn";

function state(overrides: Partial<GameState["finances"]> = {}): GameState {
  return createInitialGameState({
    runId: "run_monthly",
    startMonth: "2026-07",
    randomSeed: "monthly-golden",
    player: {
      playerId: "player_monthly",
      birthMonth: "1990-01",
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
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(10_000_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
      ...overrides,
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

function command(
  id = "cmd.month.1",
  event?: ProcessMonthCommand["payload"]["event"],
): ProcessMonthCommand {
  return {
    schemaVersion: 1,
    id,
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    type: "process_month",
    payload: {
      employmentIncomeCents: moneyCents(8_000_00),
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      ...(event ? { event } : {}),
    },
  };
}

describe("deterministic monthly turn", () => {
  it("posts market movement, income, obligations, inflation, and revision atomically", () => {
    const before = state();
    const result = processMonthlyTurn(before, "cmd.month.1", command().payload);
    const after = result.state;

    expect(after.currentMonth).toBe("2026-08");
    expect(after.revision).toBe(1);
    expect(after.acceptedCommandIds).toEqual(["cmd.month.1"]);
    expect(after.finances.requiredObligationsCents).toBe(5_000_00);
    expect(after.finances.annualLivingCostCents).toBeGreaterThan(60_000_00);
    expect(after.ledger.transactions.map(({ reasonCode }) => reasonCode)).toEqual(
      expect.arrayContaining([
        "monthly_market_revaluation",
        "monthly_employment_income",
        "fund_required_obligations",
      ]),
    );
    expect(result.record.obligationsDueCents).toBe(5_000_00);
    expect(Object.hasOwn(after, "marketValueChangeCents")).toBe(false);
    expect(
      after.ledger.transactions.slice(1).every(
        ({ commandId }) => commandId === "cmd.month.1",
      ),
    ).toBe(true);
    expect(before.currentMonth).toBe("2026-07");
    expect(before.ledger.transactions).toHaveLength(1);
  });

  it("resolves a catalog macro event before applying exact market returns", () => {
    const baseline = processMonthlyTurn(state(), "cmd.baseline", command().payload);
    const withEvent = processMonthlyTurn(state(), "cmd.event", {
      ...command().payload,
      event: {
        proposal: {
          eventId: "evt.tech.1",
          templateId: "macro.tech_boom",
          templateVersion: 1,
          parameters: { equity_boost_ppm: 50_000 },
        },
      },
    });

    expect(withEvent.record.event?.templateId).toBe("macro.tech_boom");
    expect(withEvent.state.finances.taxableInvestmentsCents).toBeGreaterThan(
      baseline.state.finances.taxableInvestmentsCents,
    );
    expect(withEvent.state.finances.retirementCents).toBeGreaterThan(
      baseline.state.finances.retirementCents,
    );
  });

  it("adds a personal shock only for the selected mitigation then funds it", () => {
    const result = processMonthlyTurn(state(), "cmd.medical", {
      ...command().payload,
      event: {
        proposal: {
          eventId: "evt.medical.1",
          templateId: "personal.medical_bill",
          templateVersion: 1,
          parameters: { gross_bill_cents: 1_000_000 },
        },
        choiceId: "use_insurance",
      },
    });

    expect(result.record.event?.choiceId).toBe("use_insurance");
    expect(result.record.obligationsDueCents).toBe(7_000_00);
    expect(result.state.finances.requiredObligationsCents).toBe(5_000_00);
    expect(result.state.wellbeing.happinessPpm).toBe(775_000);
  });

  it("ends in bankruptcy without partially funding an impossible month", () => {
    const before = state({
      cashCents: moneyCents(0),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      creditLimitCents: moneyCents(0),
      requiredObligationsCents: moneyCents(1_000_00),
    });
    const result = processMonthlyTurn(before, "cmd.bankrupt", {
      employmentIncomeCents: moneyCents(0),
      taxableLiquidationCostRatePpm: ratePpm(0),
    });

    expect(result.state.outcome).toMatchObject({ kind: "bankruptcy", grade: "F" });
    expect(result.record.obligationFunding).toBeNull();
    expect(
      result.state.ledger.transactions.some(
        ({ reasonCode }) => reasonCode === "fund_required_obligations",
      ),
    ).toBe(false);
  });

  it("routes process_month through the optimistic command reducer", () => {
    const after = reduceGameCommand(state(), command());
    expect(after.currentMonth).toBe("2026-08");
    expect(after.acceptedCommandIds).toEqual(["cmd.month.1"]);
  });

  it("replays to a fixed cross-process checksum", () => {
    const first = reduceGameCommand(state(), command());
    const second = reduceGameCommand(state(), command());

    expect(sha256Canonical(first)).toBe(sha256Canonical(second));
    expect(sha256Canonical(first)).toBe(
      "5d9970d963a994d4fefe988a0d2ccc7d5816d73360714f5a82e679f24921ea45",
    );
  });

  it("rejects invalid external inputs without mutating the original state", () => {
    const before = state();
    expect(() =>
      processMonthlyTurn(before, "cmd.invalid", {
        employmentIncomeCents: moneyCents(-1),
        taxableLiquidationCostRatePpm: ratePpm(0),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INCOME" }));
    expect(before.revision).toBe(0);
    expect(before.ledger.transactions).toHaveLength(1);
  });
});
