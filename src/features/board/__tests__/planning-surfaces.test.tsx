import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";

import { boardMonthResult, boardViewFromRun } from "../board-model";
import { BoardHud } from "../hud";
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
        taxableInvestmentsCents: opening.finances.taxableInvestmentsCents + 50_000,
        annualLivingCostCents: opening.finances.annualLivingCostCents - 120_000,
        requiredObligationsCents: opening.finances.requiredObligationsCents - 10_000,
      },
      strategy: { ...opening.strategy, emergencyFundTargetMonthsPpm: 6_000_000 },
      risk: {
        ...opening.risk,
        aggregateSeverityPpm: opening.risk.aggregateSeverityPpm - 5_000,
      },
      preparedness: {
        ...opening.preparedness,
        scorePpm: opening.preparedness.scorePpm + 7_000,
      },
      career: { pendingProgramIds: ["upskill.certificate"] },
      goal: { ...opening.goal, progressPpm: opening.goal.progressPpm + 4_000 },
      pendingInteraction: {
        kind: "event" as const,
        eventId: "event.unexpected-expense",
        templateId: "event.unexpected-expense",
        choiceIds: ["pay-now"],
        choices: [{
          id: "pay-now",
          label: "Pay it now",
          description: "Use cash.",
          enabled: true,
          preview: {
            version: "personal-event-response-preview-v1" as const,
            status: "available" as const,
            immediateCashChangeCents: -12_500,
            recurringCashFlows: [],
            annualLivingCostChangeCents: 0,
            wellbeingChangesPpm: { happiness: 0, burnout: 0 },
            followUps: [],
            netOutcomeCents: null,
            unavailableReason: null,
            summary: "Pay $125.00 now.",
          },
        }],
        parameters: {},
        headline: "A decision is waiting",
        body: "Choose how to respond.",
      },
    };
    const result = boardMonthResult(opening, ending, "Invest in broad index", {
      processedMonth: "2026-07",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 220_000,
      afterTaxCashIncomeCents: 730_000,
      resolvedIncomeCents: 50_000,
      resolvedExpenseCents: 25_000,
      marketValueChangeCents: -12_500,
      annualInflationIncreaseCents: 14_300,
      insurancePlayerCostCents: 0,
      requiredCashCents: 555_659,
      debtInterestCents: 8_000,
      debtPaymentCents: 25_000,
    });
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
    expect(markup).toContain("Taxable investments");
    expect(markup).toContain("+$500");
    expect(markup).toContain("Annual living cost");
    expect(markup).toContain("-$1,200");
    expect(markup).toContain("Required monthly expenses");
    expect(markup).toContain("-$100");
    expect(markup).toContain("Safety buffer target");
    expect(markup).toContain("6 months");
    expect(markup).toContain("Risk exposure");
    expect(markup).toContain("lower risk");
    expect(markup).toContain("Financial preparedness");
    expect(markup).toContain("Course started");
    expect(markup).toContain("upskill.certificate");
    expect(markup).toContain("Why the numbers changed");
    expect(markup).toContain("Backend-calculated evidence for July 2026");
    expect(markup).toContain("Gross employment income");
    expect(markup).toContain("+$10,000");
    expect(markup).toContain("Taxes and withholding");
    expect(markup).toContain("-$2,200");
    expect(markup).toContain("Event and other income");
    expect(markup).toContain("Event expenses");
    expect(markup).toContain("Market movement");
    expect(markup).toContain("Debt interest included");
    expect(markup).toContain("Annual cost added by inflation");
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("A life decision is waiting before the next month.");
    expect(markup).not.toContain("AI Director");
    expect(markup).not.toContain("Operational ML");
    expect(markup).toContain(">Review decision</button>");
  });

  it("renders monthly, total, follow-up, and disabled preview evidence", () => {
    const run = projectRunView(currentRunState());
    const view = boardViewFromRun({
      ...run,
      pendingInteraction: {
        kind: "event",
        eventId: "event.preview",
        choiceIds: ["finance", "insured"],
        choices: [
          {
            id: "finance",
            label: "Finance it",
            description: "Pay $75.00 per month for 4 months ($300.00 total). Schedules a follow-up in 2 months.",
            enabled: true,
            preview: {
              version: "personal-event-response-preview-v1",
              status: "available",
              immediateCashChangeCents: 0,
              recurringCashFlows: [{
                direction: "expense",
                monthlyCents: 7_500,
                durationMonths: 4,
                totalCents: 30_000,
              }],
              annualLivingCostChangeCents: 0,
              wellbeingChangesPpm: { happiness: 0, burnout: 0 },
              followUps: [{
                templateId: "personal.followup",
                templateVersion: 2,
                delayMonths: 2,
                parameterRanges: { cost_cents: { minimum: 5_000, maximum: 30_000 } },
              }],
              netOutcomeCents: null,
              unavailableReason: null,
              summary: "Pay $75.00 per month for 4 months ($300.00 total).",
            },
          },
          {
            id: "insured",
            label: "Use coverage",
            description: "Requires active health coverage",
            enabled: false,
            preview: {
              version: "personal-event-response-preview-v1",
              status: "unavailable",
              immediateCashChangeCents: 0,
              recurringCashFlows: [],
              annualLivingCostChangeCents: 0,
              wellbeingChangesPpm: { happiness: 0, burnout: 0 },
              followUps: [],
              netOutcomeCents: null,
              unavailableReason: "Requires active health coverage",
              summary: "Requires active health coverage",
            },
          },
        ],
        parameters: {},
        headline: "Choose a response",
        body: "Every cost is shown before confirmation.",
      },
    });
    const markup = renderToStaticMarkup(
      <BoardHud
        actionHint=""
        actionLabel="Continue"
        busy={false}
        eventReturnFocusTarget={null}
        eventVisible
        mode="strategy"
        monthResultDialog={null}
        onNewGame={() => undefined}
        onResolveEvent={() => undefined}
        onSavedGames={() => undefined}
        onStub={() => undefined}
        onTakeAction={() => undefined}
        planningPanel={null}
        toastMessage=""
        toastVisible={false}
        view={view}
      />,
    );

    expect(markup).toContain("$75.00 per month");
    expect(markup).toContain("$300.00 total");
    expect(markup).toContain("personal.followup in 2 months");
    expect(markup).toContain("Requires active health coverage");
    expect(markup).toContain('disabled=""');
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
