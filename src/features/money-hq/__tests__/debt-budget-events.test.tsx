import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { runViewSchema } from "@/contracts/api/contracts";
import {
  queueScheduledDeclarativePersonalEventV2,
  resolveEventChoiceV2,
} from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import {
  getActivePersonalEventTemplateV2,
  getPersonalEventTemplateV2,
} from "@/data/personal-event-templates-v2";

import { hqViewFromRun } from "../hq-view";
import { BudgetScreen } from "../screens/budget-screen";
import { DebtScreen } from "../screens/debt-screen";

function resolveMedicalChoice(choiceId: string, financed: boolean) {
  const opening = currentRunState();
  const template = financed
    ? getActivePersonalEventTemplateV2("personal.medical_bill")
    : getPersonalEventTemplateV2("personal.medical_bill", 2);
  const eventId = financed ? "event.ui.financing" : "event.ui.cash-due";
  const queued = queueScheduledDeclarativePersonalEventV2(opening, {
    proposal: {
      eventId,
      templateId: template.id,
      templateVersion: template.version,
      parameters: { gross_bill_cents: 100_000 },
    },
    template,
    targetedWeakness: UNRELATED_HAZARD_TARGET,
  });
  return resolveEventChoiceV2(queued, {
    schemaVersion: 2,
    id: financed ? "command.ui.financing" : "command.ui.cash-due",
    type: "resolve_event_choice",
    expectedRevision: queued.revision,
    effectiveMonth: queued.currentMonth,
    payload: { eventId, choiceId },
  });
}

function sharedProps(state: ReturnType<typeof currentRunState>) {
  const run = runViewSchema.parse(projectRunView(state));
  return {
    busy: false,
    onSelectPlan: () => undefined,
    plans: [],
    run,
    selectedPlanId: null,
    view: hqViewFromRun(run),
  } as const;
}

describe("Money HQ event consequences", () => {
  it("renders an event installment in the debt system immediately", () => {
    const markup = renderToStaticMarkup(
      <DebtScreen
        {...sharedProps(resolveMedicalChoice("medical_payment_plan", true))}
      />,
    );

    expect(markup).toContain("Event installment plan");
    expect(markup).toContain("$1,200");
    expect(markup).toContain("$300/mo minimum");
    expect(markup).toContain("0.0% APR");
    expect(markup).toContain("4 months remaining");
  });

  it("renders a resolved one-month event cost as due before settlement", () => {
    const markup = renderToStaticMarkup(
      <BudgetScreen {...sharedProps(resolveMedicalChoice("pay_uninsured", false))} />,
    );

    expect(markup).toContain("event costs due this month");
    expect(markup).toContain("$1,000");
  });
});
