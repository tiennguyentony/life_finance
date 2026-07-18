import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import {
  commandIntentForPlan,
  plansForDestination,
} from "../plan-catalog";

describe("board plan catalog", () => {
  it("maps every destination to real public intents", () => {
    const run = projectRunView(currentRunState());

    expect(plansForDestination(run, "home").map(({ id }) => id)).toContain(
      "home.reduce-lifestyle",
    );
    expect(plansForDestination(run, "bank").map(({ id }) => id)).toContain(
      "bank.pay-credit",
    );
    expect(plansForDestination(run, "financial").map(({ id }) => id)).toContain(
      "financial.broad-index",
    );
    expect(plansForDestination(run, "startup").map(({ id }) => id)).toContain(
      "startup.certificate",
    );
    expect(plansForDestination(run, "hospital").map(({ id }) => id)).toContain(
      "hospital.reserve-3",
    );
  });

  it("maps the featured plans to their supported detailed actions", () => {
    const run = projectRunView(currentRunState());

    expect(commandIntentForPlan(
      run,
      plansForDestination(run, "home").find(({ id }) => id === "home.reduce-lifestyle")!,
      "board.plan.home",
    )).toMatchObject({
      type: "take_detailed_action",
      payload: {
        action: { type: "change_lifestyle", annualLivingCostDeltaCents: -120_000 },
      },
    });
    expect(commandIntentForPlan(
      run,
      plansForDestination(run, "bank").find(({ id }) => id === "bank.pay-credit")!,
      "board.plan.bank",
    )).toMatchObject({
      type: "take_detailed_action",
      payload: { action: { type: "pay_revolving_credit", amountCents: 50_000 } },
    });
    expect(commandIntentForPlan(
      run,
      plansForDestination(run, "financial").find(({ id }) => id === "financial.broad-index")!,
      "board.plan.financial",
    )).toMatchObject({
      type: "take_detailed_action",
      payload: {
        action: {
          type: "invest_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: 50_000,
        },
      },
    });
    expect(commandIntentForPlan(
      run,
      plansForDestination(run, "startup").find(({ id }) => id === "startup.certificate")!,
      "board.plan.startup",
    )).toMatchObject({
      type: "take_detailed_action",
      payload: { action: { type: "start_upskill", programId: "upskill.certificate" } },
    });
  });

  it("preserves the recurring strategy when changing the reserve target", () => {
    const run = projectRunView(currentRunState());
    const plan = plansForDestination(run, "hospital").find(
      ({ id }) => id === "hospital.reserve-6",
    )!;
    const { effectiveMonth, ...strategy } = run.strategy;
    expect(effectiveMonth).toBe(run.currentMonth);

    expect(commandIntentForPlan(run, plan, "board.plan.1")).toEqual({
      id: "board.plan.1",
      expectedRevision: run.revision,
      type: "set_recurring_strategy",
      payload: { strategy: { ...strategy, emergencyFundTargetMonthsPpm: 6_000_000 } },
    });
  });

  it("caps revolving-credit plans and disables actions the run cannot take", () => {
    const run = projectRunView(currentRunState());
    const constrained = {
      ...run,
      finances: {
        ...run.finances,
        cashCents: 30_000,
        creditUsedCents: 20_000,
        creditLimitCents: 20_000,
        annualLivingCostCents: 119_999,
        requiredObligationsCents: 9_999,
      },
      income: { annualGrossSalaryCents: null },
    };

    const payment = plansForDestination(constrained, "bank").find(
      ({ id }) => id === "bank.pay-credit",
    )!;
    const draw = plansForDestination(constrained, "bank").find(
      ({ id }) => id === "bank.draw-credit",
    )!;

    expect(payment.disabledReason).toBeNull();
    expect(draw.disabledReason).toBe("No revolving credit is available to draw.");
    expect(plansForDestination(constrained, "home").find(
      ({ id }) => id === "home.reduce-lifestyle",
    )?.disabledReason).toBe("Living costs cannot be reduced by another $100 per month.");
    expect(plansForDestination(constrained, "financial").find(
      ({ id }) => id === "financial.broad-index",
    )?.disabledReason).toBe("You need $500 in cash.");
    expect(plansForDestination(constrained, "startup").find(
      ({ id }) => id === "startup.certificate",
    )?.disabledReason).toBe("Upskilling requires active employment.");
  });

  it("uses the available amount for capped revolving-credit commands", () => {
    const run = projectRunView(currentRunState());
    const constrained = {
      ...run,
      finances: {
        ...run.finances,
        cashCents: 30_000,
        creditUsedCents: 20_000,
        creditLimitCents: 60_000,
      },
    };

    expect(commandIntentForPlan(
      constrained,
      plansForDestination(constrained, "bank").find(({ id }) => id === "bank.pay-credit")!,
      "board.plan.pay",
    )).toMatchObject({ payload: { action: { amountCents: 20_000 } } });
    expect(commandIntentForPlan(
      constrained,
      plansForDestination(constrained, "bank").find(({ id }) => id === "bank.draw-credit")!,
      "board.plan.draw",
    )).toMatchObject({ payload: { action: { amountCents: 40_000 } } });
  });

  it("does not submit a command for a stay-the-course plan", () => {
    const run = projectRunView(currentRunState());
    const plan = plansForDestination(run, "home").find(
      ({ id }) => id === "home.stay-the-course",
    )!;

    expect(commandIntentForPlan(run, plan, "board.plan.none")).toBeNull();
  });
});
