import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import { boardViewFromRun } from "../board-model";

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
      target: 1_625_000,
    });
    expect(view.pendingEvent).toBeNull();
  });
});
