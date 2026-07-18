import { describe, expect, it } from "vitest";

import { calculateNetWorth } from "@/core/game-state";
import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";

import { projectRunView } from "../run-view";
import { currentRunState } from "./run-state.fixture";

describe("projectRunView", () => {
  it("projects an active run without exposing persisted schema metadata", () => {
    const state = currentRunState();

    const view = projectRunView(state);

    expect(view).toMatchObject({
      runId: "run.current",
      revision: 0,
      currentMonth: "2026-07",
      status: "active",
      player: {
        birthMonth: "1995-03",
        locationId: "location.seattle",
        careerId: "career.software",
      },
      finances: {
        cashCents: 1_000_000,
        taxableInvestmentsCents: 2_400_000,
        retirementCents: 3_500_000,
        netWorthCents: calculateNetWorth(state.finances),
      },
      income: { annualGrossSalaryCents: 12000000 },
      pendingInteraction: { kind: "none" },
      capabilities: {
        canAdvance: true,
        canAct: true,
        canRequestTeaching: true,
      },
    });
    expect(view).not.toHaveProperty("schemaVersion");
    expect(view).not.toHaveProperty("engineVersion");
    expect(view).not.toHaveProperty("ledger");
  });

  it("projects human event choices and resolved parameters", () => {
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const state = queueScheduledDeclarativePersonalEventV2(currentRunState(), {
      proposal: {
        eventId: "event.medical.1",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { gross_bill_cents: 425_000 },
      },
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    });

    expect(projectRunView(state).pendingInteraction).toMatchObject({
      kind: "event",
      parameters: { gross_bill_cents: 425_000 },
      choices: [
        {
          id: "pay_uninsured",
          label: "Pay without coverage",
          description: "Creates a temporary expense of $4,250.",
        },
        {
          id: "use_insurance",
          label: "Use health coverage",
          description: "Coverage limits the bill according to the active policy.",
        },
      ],
    });
  });

  it("projects pending career programs without exposing engine state", () => {
    expect(projectRunView(currentRunState()).career).toEqual({
      pendingProgramIds: [],
    });
  });
});
