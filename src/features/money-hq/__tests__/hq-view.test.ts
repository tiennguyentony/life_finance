import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { runViewSchema } from "@/contracts/api/contracts";

import { hqViewFromRun } from "../hq-view";

describe("Money HQ view", () => {
  it("keeps the FI numerator aligned with the backend-owned progress", () => {
    const run = runViewSchema.parse(projectRunView(currentRunState()));
    const view = hqViewFromRun(run);

    expect(view.goalCurrentCents).toBe(run.finances.investableAssetsCents);
    expect(view.goalProgressPpm).toBe(run.goal.progressPpm);
  });

  it("includes term and revolving minimums in required cash and DTI", () => {
    const run = runViewSchema.parse(projectRunView(currentRunState()));
    const view = hqViewFromRun(run);
    const obligations = run.finances.monthlyObligations;
    const monthlyGross = run.income.annualGrossSalaryCents! / 12;

    expect(view.monthlyRequiredCents).toBe(obligations.totalRequiredCashCents);
    expect(view.debtServiceRatioPpm).toBe(
      Math.round(
        ((obligations.termDebtMinimumsCents +
          obligations.revolvingCreditMinimumCents) /
          monthlyGross) *
          1_000_000,
      ),
    );
  });
});
