import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import { boardMonthResult } from "../board-model";
import { MonthResultDialog } from "../month-result-dialog";
import { PlanningPanel } from "../planning-panel";
import { plansForDestination } from "../plan-catalog";

describe("board planning surfaces", () => {
  it("renders exact and directional preview semantics", () => {
    const run = projectRunView(currentRunState());
    const markup = renderToStaticMarkup(
      <PlanningPanel
        busy={false}
        destinationId="financial"
        errorMessage={null}
        onClose={() => undefined}
        onCommit={() => undefined}
        onSelectPlan={() => undefined}
        plans={plansForDestination(run, "financial")}
        selectedPlanId="financial.broad-index"
      />,
    );

    expect(markup).toContain("Choose your plan");
    expect(markup).toContain("Exact");
    expect(markup).toContain("Directional");
    expect(markup).toContain("Live this month");
  });

  it("shows disabled plan reasons and commit status", () => {
    const run = {
      ...projectRunView(currentRunState()),
      finances: { ...projectRunView(currentRunState()).finances, cashCents: 0 },
    };
    const markup = renderToStaticMarkup(
      <PlanningPanel
        busy
        destinationId="financial"
        errorMessage="The plan could not be saved."
        onClose={() => undefined}
        onCommit={() => undefined}
        onSelectPlan={() => undefined}
        plans={plansForDestination(run, "financial")}
        selectedPlanId="financial.broad-index"
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("You need $500 in cash.");
    expect(markup).toContain("Saving your plan...");
  });

  it("announces a pending event from the result dialog", () => {
    const opening = projectRunView(currentRunState());
    const ending = {
      ...opening,
      currentMonth: "2026-08",
      finances: {
        ...opening.finances,
        cashCents: opening.finances.cashCents + 12_500,
        netWorthCents: opening.finances.netWorthCents + 15_000,
      },
      goal: { ...opening.goal, progressPpm: opening.goal.progressPpm + 4_000 },
      pendingInteraction: {
        kind: "event" as const,
        eventId: "event.unexpected-expense",
        templateId: "event.unexpected-expense",
        choiceIds: ["pay-now"],
        choices: [{ id: "pay-now", label: "Pay it now", description: "Use cash." }],
        parameters: {},
        headline: "A decision is waiting",
        body: "Choose how to respond.",
      },
    };
    const result = boardMonthResult(opening, ending, "Invest in broad index");
    const markup = renderToStaticMarkup(
      <MonthResultDialog busy={false} onContinue={() => undefined} result={result} />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Review life decision");
    expect(markup).toContain("Cash");
    expect(markup).toContain("Goal progress");
    expect(markup).toContain("0.4 percentage points");
  });
});
