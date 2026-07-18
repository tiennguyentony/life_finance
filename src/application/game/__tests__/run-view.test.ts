import { describe, expect, it } from "vitest";

import { calculateNetWorth } from "@/core/game-state";

import { projectRunView } from "../run-view";
import { currentRunState } from "./run-state.fixture";

describe("projectRunView", () => {
  it("projects an active run without exposing persisted schema metadata", () => {
    const state = currentRunState();

    const view = projectRunView(state);

    expect(view).toMatchObject({
      runId: "run.current",
      revision: 0,
      currentMonth: "2026-07",
      status: "active",
      player: {
        birthMonth: "1995-03",
        locationId: "location.seattle",
        careerId: "career.software",
      },
      finances: {
        cashCents: 1_000_000,
        taxableInvestmentsCents: 2_400_000,
        retirementCents: 3_500_000,
        netWorthCents: calculateNetWorth(state.finances),
      },
      income: { annualGrossSalaryCents: 12000000 },
      pendingInteraction: { kind: "none" },
      capabilities: {
        canAdvance: true,
        canAct: true,
        canRequestTeaching: true,
      },
    });
    expect(view).not.toHaveProperty("schemaVersion");
    expect(view).not.toHaveProperty("engineVersion");
    expect(view).not.toHaveProperty("ledger");
  });
});
