import { describe, expect, it } from "vitest";

import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";
import { projectRunView } from "@/application/game/run-view";
import { currentRunState } from "@/application/game/__tests__/run-state.fixture";

import {
  apiErrorResponseSchema,
  characterBanterRequestSchema,
  characterBanterResponseSchema,
  commandIntentSchema,
  interpretEventRequestSchema,
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
      startMonth: "2026-07",
      preparedness: {
        version: "preparedness-assessment-v1",
        scorePpm: expect.any(Number),
      },
      beginnerCheckpoint: null,
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

  it("rejects unsupported preparedness and beginner-checkpoint versions", () => {
    const view = projectRunView(currentRunState());

    expect(runViewSchema.safeParse({
      ...view,
      preparedness: { ...view.preparedness, version: "preparedness-assessment-v2" },
    }).success).toBe(false);
    expect(runViewSchema.safeParse({
      ...view,
      beginnerCheckpoint: {
        version: "beginner-chapter-v2",
        checkpointMonth: "2027-07",
        outcome: "strong",
        completed: true,
        scorePpm: 500_000,
        preparednessBand: "stable",
        weakestComponent: "liquidity",
        lessonKey: "lesson.emergency_fund",
      },
    }).success).toBe(false);
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

  it("accepts an explicit engine-owned choice from the event hint menu", () => {
    expect(interpretEventRequestSchema.parse({
      eventId: "event.medical.1",
      expectedRevision: 3,
      selectedChoiceId: "use_insurance",
      conversation: [{ role: "player", content: "Use health coverage" }],
    })).toMatchObject({ selectedChoiceId: "use_insurance" });
  });

  it("bounds character-writer evidence and cast IDs", () => {
    expect(characterBanterRequestSchema.parse({
      expectedRevision: 3,
      simulationMonth: "2026-10",
      planLabel: "Invest steadily",
      variationSeed: 42,
      evidence: [{ id: "cash_change", label: "Cash change", value: "+$25.00" }],
      recentLines: [],
    }).variationSeed).toBe(42);
    expect(characterBanterResponseSchema.safeParse({
      version: "character-banter-v1",
      status: "generated",
      source: "local_oss",
      characterId: "unknown_cast_member",
      tone: "roast",
      message: "A valid-looking but untrusted line.",
      citedEvidenceId: "cash_change",
      latencyMs: 5,
    }).success).toBe(false);
  });

  it("publishes only the unversioned browser API", () => {
    const paths = Object.keys(CURRENT_OPENAPI_DOCUMENT.paths);
    expect(paths).toContain("/api/runs/{runId}/commands");
    expect(paths.some((path) => /\/api\/v[0-9]+\//.test(path))).toBe(false);
  });
});
