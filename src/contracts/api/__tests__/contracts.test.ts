import { describe, expect, it } from "vitest";

import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";
import { projectRunView } from "@/application/game/run-view";
import { currentRunState } from "@/application/game/__tests__/run-state.fixture";

import {
  apiErrorResponseSchema,
  commandIntentSchema,
  runViewSchema,
} from "../contracts";
import { CURRENT_OPENAPI_DOCUMENT } from "../openapi";

describe("frontend API contracts", () => {
  it("rejects engine metadata from a run view", () => {
    expect(() =>
      runViewSchema.parse({
        runId: "run.current",
        revision: 0,
        currentMonth: "2026-07",
        status: "active",
        schemaVersion: 2,
      }),
    ).toThrow();
  });

  it("accepts intent without a schema version or effective month", () => {
    expect(
      commandIntentSchema.parse({
        id: "ui.command.1",
        expectedRevision: 4,
        type: "resolve_event_choice",
        payload: { eventId: "event.1", choiceId: "choice.1" },
      }),
    ).toEqual({
      id: "ui.command.1",
      expectedRevision: 4,
      type: "resolve_event_choice",
      payload: { eventId: "event.1", choiceId: "choice.1" },
    });
  });

  it("accepts projected event planning data", () => {
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const eventState = queueScheduledDeclarativePersonalEventV2(
      currentRunState(),
      {
        proposal: {
          eventId: "event.medical.1",
          templateId: template.id,
          templateVersion: template.version,
          parameters: { gross_bill_cents: 425_000 },
        },
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
      },
    );

    expect(runViewSchema.parse(projectRunView(eventState))).toMatchObject({
      career: { pendingProgramIds: [] },
      pendingInteraction: {
        kind: "event",
        parameters: { gross_bill_cents: 425_000 },
        choices: [
          { id: "pay_uninsured", label: "Pay without coverage" },
          { id: "use_insurance", label: "Use health coverage" },
        ],
      },
    });
  });

  it("accepts contract-unit emergency reserve targets", () => {
    expect(
      commandIntentSchema.parse({
        id: "ui.command.reserve-target",
        expectedRevision: 4,
        type: "set_recurring_strategy",
        payload: {
          strategy: {
            effectiveMonth: "2026-08",
            emergencyFundTargetMonthsPpm: 6_000_000,
            preTax401kSalaryRatePpm: 0,
            preTaxHsaSalaryRatePpm: 0,
            afterTaxBroadIndexRatePpm: 0,
            afterTaxSectorRatePpm: 0,
            afterTaxSpeculativeRatePpm: 0,
            afterTaxIraRatePpm: 0,
            afterTaxExtraDebtRatePpm: 0,
          },
        },
      }),
    ).toMatchObject({
      payload: {
        strategy: { emergencyFundTargetMonthsPpm: 6_000_000 },
      },
    });
  });

  it("requires a request id on every API error", () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: { code: "CONFLICT", message: "reload" },
      }).success,
    ).toBe(false);
  });

  it("publishes only the unversioned browser API", () => {
    const paths = Object.keys(CURRENT_OPENAPI_DOCUMENT.paths);
    expect(paths).toContain("/api/runs/{runId}/commands");
    expect(paths.some((path) => /\/api\/v[0-9]+\//.test(path))).toBe(false);
  });
});
