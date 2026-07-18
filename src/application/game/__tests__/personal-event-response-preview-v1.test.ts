import { describe, expect, it } from "vitest";

import { getPersonalEventTemplateV2 } from "../../../data/personal-event-templates-v2";
import {
  queueScheduledDeclarativePersonalEventV2,
  resolveEventChoiceV2,
} from "../../../core/event-lifecycle-v2";
import type { GameStateV2 } from "../../../core/game-state-v2";
import type { PersonalEventTemplateV2 } from "../../../core/personal-event-v2";
import { projectPersonalEventResponsePreviewV1 } from "../personal-event-response-preview-v1";
import { currentRunState } from "./run-state.fixture";

function queue(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  parameters: Readonly<Record<string, number>>,
): NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]> {
  return queueScheduledDeclarativePersonalEventV2(state, {
    proposal: {
      eventId: `evt.preview.${template.id}.v${template.version}`,
      templateId: template.id,
      templateVersion: template.version,
      parameters,
    },
    template,
    targetedWeakness: "unrelated_hazard",
  }).gameplay.eventLifecycle.pending!;
}

describe("personal event response preview v1", () => {
  it("shows a four-month plan's monthly and 120% total before confirmation", () => {
    const state = currentRunState();
    const template = getPersonalEventTemplateV2("personal.medical_bill", 3);
    const pending = queue(state, template, { gross_bill_cents: 100_000 });

    const preview = projectPersonalEventResponsePreviewV1(
      state,
      pending,
      template,
      "medical_payment_plan",
    );

    expect(preview).toMatchObject({
      version: "personal-event-response-preview-v1",
      status: "available",
      immediateCashChangeCents: 0,
      recurringCashFlows: [{
        direction: "expense",
        monthlyCents: 30_000,
        durationMonths: 4,
        totalCents: 120_000,
      }],
      unavailableReason: null,
    });
    expect(preview.summary).toContain("$300.00 per month for 4 months ($1,200.00 total)");
  });

  it("discloses a declared follow-up identity, delay, and parameter range", () => {
    const state = currentRunState();
    const template = getPersonalEventTemplateV2("personal.rare_yard_sale_lamp", 2);
    const pending = queue(state, template, {
      purchase_price_cents: 4_000,
      restoration_cost_cents: 6_000,
    });

    const preview = projectPersonalEventResponsePreviewV1(
      state,
      pending,
      template,
      "buy_restore_and_list",
    );

    expect(preview.immediateCashChangeCents).toBe(-10_000);
    expect(preview.followUps).toEqual([{
      templateId: "personal.lamp_market_followup",
      templateVersion: 2,
      delayMonths: 2,
      parameterRanges: {
        resale_proceeds_cents: { minimum: 0, maximum: 25_000 },
      },
    }]);
  });

  it("keeps an unavailable mitigation response visible but disabled", () => {
    const state = currentRunState();
    const template = getPersonalEventTemplateV2("personal.medical_bill", 3);
    const pending = queue(state, template, { gross_bill_cents: 100_000 });
    const uninsured = {
      ...state,
      gameplay: {
        ...state.gameplay,
        insurance: { ...state.gameplay.insurance, policyYear: null },
      },
    };

    expect(projectPersonalEventResponsePreviewV1(
      uninsured,
      pending,
      template,
      "use_insurance",
    )).toMatchObject({
      status: "unavailable",
      unavailableReason: "Requires active health coverage",
    });
  });

  it("compares lamp follow-up proceeds with the root event's exact cost basis", () => {
    const state = currentRunState();
    const root = getPersonalEventTemplateV2("personal.rare_yard_sale_lamp", 2);
    const queuedRoot = queueScheduledDeclarativePersonalEventV2(state, {
      proposal: {
        eventId: "evt.preview.lamp-root",
        templateId: root.id,
        templateVersion: root.version,
        parameters: {
          purchase_price_cents: 4_000,
          restoration_cost_cents: 6_000,
        },
      },
      template: root,
      targetedWeakness: "unrelated_hazard",
    });
    const resolvedRoot = resolveEventChoiceV2(queuedRoot, {
      schemaVersion: 2,
      id: "cmd.preview.lamp-root",
      type: "resolve_event_choice",
      expectedRevision: queuedRoot.revision,
      effectiveMonth: queuedRoot.currentMonth,
      payload: {
        eventId: queuedRoot.gameplay.eventLifecycle.pending!.eventId,
        choiceId: "buy_restore_and_list",
      },
    });
    const followUp = getPersonalEventTemplateV2("personal.lamp_market_followup", 2);
    const queuedFollowUp = queueScheduledDeclarativePersonalEventV2(resolvedRoot, {
      proposal: {
        eventId: "evt.preview.lamp-followup",
        templateId: followUp.id,
        templateVersion: followUp.version,
        parameters: { resale_proceeds_cents: 10_000 },
      },
      template: followUp,
      targetedWeakness: "unrelated_hazard",
      followUpSourceEventId: "evt.preview.lamp-root",
    });

    const preview = projectPersonalEventResponsePreviewV1(
      resolvedRoot,
      queuedFollowUp.gameplay.eventLifecycle.pending!,
      followUp,
      "sell_lamp",
    );

    expect(preview.netOutcomeCents).toBe(0);
    expect(preview.summary).toContain("breaks even");
  });
});
