import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import { boardMonthResult } from "../board-model";
import { MonthResultDialog } from "../month-result-dialog";
import { PlanningPanel } from "../planning-panel";
import { plansForDestination } from "../plan-catalog";

describe("board planning surfaces", () => {
  it("renders selectable plan previews with their certainty semantics", () => {
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
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("Exact");
    expect(markup).toContain("Directional");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Live this month");
    expect(markup).not.toContain('disabled=""');
  });

  it("explains disabled plans and keeps a busy commit unavailable", () => {
    const opening = projectRunView(currentRunState());
    const run = { ...opening, finances: { ...opening.finances, cashCents: 0 } };
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
    expect(markup).toContain('disabled=""');
  });

  it("keeps the commit unavailable without an enabled selection", () => {
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
        selectedPlanId={null}
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Ready to live this month.");
  });

  it("makes month-only recovery explicit and prevents silently closing it", () => {
    const run = projectRunView(currentRunState());
    const markup = renderToStaticMarkup(
      <PlanningPanel
        busy={false}
        commitVariant="finish_month"
        destinationId="financial"
        errorMessage="The month did not advance."
        onClose={() => undefined}
        onCommit={() => undefined}
        onSelectPlan={() => undefined}
        plans={plansForDestination(run, "financial")}
        selectedPlanId="financial.broad-index"
      />,
    );

    expect(markup).toContain("Finish this month");
    expect(markup).toContain("will not submit a plan again");
    expect(markup).not.toContain("Close plan chooser");
    expect(markup).not.toContain("Live this month");
  });

  it("announces month-only recovery as finishing rather than saving the plan", () => {
    const run = projectRunView(currentRunState());
    const markup = renderToStaticMarkup(
      <PlanningPanel
        busy
        commitVariant="finish_month"
        destinationId="financial"
        errorMessage={null}
        onClose={() => undefined}
        onCommit={() => undefined}
        onSelectPlan={() => undefined}
        plans={plansForDestination(run, "financial")}
        selectedPlanId="financial.broad-index"
      />,
    );

    expect(markup).toContain("Finishing this month...");
    expect(markup).toContain("Finish this month");
    expect(markup).not.toContain("Saving your plan");
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
      <MonthResultDialog
        busy={false}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
        primaryLabel="Review decision"
        result={result}
        returnFocusTarget={null}
        secondaryLabel={null}
        summary="A life decision is waiting before the next month."
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="board-month-result-title"');
    expect(markup).toMatch(/<h2 id="board-month-result-title">[^<]*August 2026[^<]*<\/h2>/);
    expect(markup).toContain("Review life decision");
    expect(markup).toContain("Plan: Invest in broad index");
    expect(markup).toContain("Cash");
    expect(markup).toContain("+$125");
    expect(markup).toContain("Net worth");
    expect(markup).toContain("+$150");
    expect(markup).toContain("Debt");
    expect(markup).toContain("$0");
    expect(markup).toContain("Goal progress");
    expect(markup).toContain("0.4 percentage points");
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("A life decision is waiting before the next month.");
    expect(markup).toContain(">Review decision</button>");
  });

  it("continues to the authoritative ending month when no event is pending", () => {
    const opening = projectRunView(currentRunState());
    const ending = { ...opening, currentMonth: "2026-08" };
    const result = boardMonthResult(opening, ending, "Stay the course");
    const markup = renderToStaticMarkup(
      <MonthResultDialog
        busy={false}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
        primaryLabel="Continue one month"
        result={result}
        returnFocusTarget={null}
        secondaryLabel="Choose a different plan"
        summary="Your previous plan was applied once."
      />,
    );

    expect(markup).toContain("Your previous plan was applied once.");
    expect(markup).toContain(">Continue one month</button>");
    expect(markup).toContain(">Choose a different plan</button>");
    expect(markup).not.toContain("Review decision");
  });

  it("renders a contextual repeated transaction and checkpoint evidence", () => {
    const opening = projectRunView(currentRunState());
    const ending = {
      ...opening,
      currentMonth: "2027-07",
      beginnerCheckpoint: {
        version: "beginner-chapter-v1" as const,
        checkpointMonth: "2027-07" as const,
        outcome: "developing" as const,
        completed: true,
        scorePpm: 420_000,
        preparednessBand: "exposed" as const,
        weakestComponent: "debt" as const,
        lessonKey: "lesson.debt_management",
      },
    };
    const result = boardMonthResult(opening, ending, "Pay revolving credit");
    const markup = renderToStaticMarkup(
      <MonthResultDialog
        busy={false}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
        primaryLabel="Pay another $320"
        result={result}
        returnFocusTarget={null}
        secondaryLabel="Choose a different plan"
        summary="Your payment remains available next month."
      />,
    );

    expect(markup).toContain("12-month checkpoint: Developing");
    expect(markup).toContain("Preparedness score 42%");
    expect(markup).toContain("Focus next: Debt management");
    expect(markup).toContain("Pay another $320");
    expect(markup).toContain("Choose a different plan");
  });
});
