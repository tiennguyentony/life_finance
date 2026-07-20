import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { runViewSchema } from "@/contracts/api/contracts";
import { moneyCents } from "@/core/domain/money";

import { hqViewFromRun } from "../hq-view";

describe("Money HQ view", () => {
  it("keeps the FI numerator aligned with the backend-owned progress", () => {
    const base = currentRunState();
    const state = {
      ...base,
      finances: {
        ...base.finances,
        nonCreditLiabilitiesCents: moneyCents(
          base.finances.nonCreditLiabilitiesCents + 250_000,
        ),
        creditUsedCents: moneyCents(100_000),
      },
    };
    const run = runViewSchema.parse(projectRunView(state));
    const view = hqViewFromRun(run);

    expect(view.goalCurrentCents).toBe(run.goal.currentCents);
    expect(view.goalCurrentCents).toBe(
      Math.max(
        0,
        run.finances.investableAssetsCents -
          run.finances.nonCreditLiabilitiesCents -
          run.finances.creditUsedCents,
      ),
    );
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

  it("shows a debt badge and itemized term debt even without revolving use", () => {
    const base = currentRunState();
    const state = {
      ...base,
      finances: { ...base.finances, creditUsedCents: moneyCents(0) },
      gameplay: {
        ...base.gameplay,
        debts: {
          ...base.gameplay.debts,
          revolvingCreditUsedCents: moneyCents(0),
        },
      },
    };
    const run = runViewSchema.parse(projectRunView(state));
    const view = hqViewFromRun(run);

    expect(view.revolvingUsedCents).toBe(0);
    expect(view.termDebtCents).toBe(2_000_000);
    expect(view.termDebts).toEqual([
      expect.objectContaining({ kind: "student_loan", principalCents: 2_000_000 }),
    ]);
    expect(view.debtBadge).toBe(1);
  });
});
