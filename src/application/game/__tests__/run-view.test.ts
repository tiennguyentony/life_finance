import { describe, expect, it, vi } from "vitest";

import { moneyCents, ratePpm } from "@/core/domain/money";
import { simulationMonth } from "@/core/domain/month";
import { calculateNetWorth } from "@/core/game-state";
import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import type { GameStateV2 } from "@/core/game-state-v2";
import type { PersonalEventTemplateV2 } from "@/core/personal-event-v2";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";

import { projectRunView } from "../run-view";
import { currentRunState } from "./run-state.fixture";

vi.mock("@/data/personal-event-templates-v2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/personal-event-templates-v2")>();
  return {
    ...actual,
    getPersonalEventTemplateV2: vi.fn(actual.getPersonalEventTemplateV2),
  };
});

describe("projectRunView", () => {
  it("projects an active run without exposing persisted schema metadata", () => {
    const state = currentRunState();

    const view = projectRunView(state);

    expect(view).toMatchObject({
      runId: "run.current",
      revision: 0,
      startMonth: "2026-07",
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
      preparedness: {
        version: "preparedness-assessment-v1",
        scorePpm: expect.any(Number),
        band: expect.stringMatching(/critical|exposed|stable|resilient/),
      },
      beginnerCheckpoint: null,
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

  it("projects the immutable beginner checkpoint at month 12", () => {
    const base = currentRunState();
    const state: GameStateV2 = {
      ...base,
      currentMonth: simulationMonth("2027-07"),
    };

    expect(projectRunView(state)).toMatchObject({
      startMonth: "2026-07",
      currentMonth: "2027-07",
      preparedness: {
        version: "preparedness-assessment-v1",
        scorePpm: expect.any(Number),
        components: {
          liquidityPpm: expect.any(Number),
          cashFlowPpm: expect.any(Number),
          debtPpm: expect.any(Number),
          insurancePpm: expect.any(Number),
          diversificationPpm: expect.any(Number),
        },
      },
      beginnerCheckpoint: {
        version: "beginner-chapter-v1",
        checkpointMonth: "2027-07",
        outcome: expect.stringMatching(/fragile|developing|strong/),
        scorePpm: expect.any(Number),
      },
    });
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

  it("projects a deterministic utility rebate as next-month income", () => {
    const template = getPersonalEventTemplateV2("personal.utility_rebate");
    const state = queueScheduledDeclarativePersonalEventV2(currentRunState(), {
      proposal: {
        eventId: "event.utility-rebate.1",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { rebate_cents: 42_500 },
      },
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    });

    expect(projectRunView(state).pendingInteraction).toMatchObject({
      choices: [{
        id: "claim_rebate",
        description: "Adds $425 of income in the next processed month.",
      }],
    });
  });

  it("projects a cash subtraction as next-month expense", () => {
    const base = currentRunState();
    const template: PersonalEventTemplateV2 = {
      ...getPersonalEventTemplateV2("personal.utility_rebate"),
      id: "personal.projection-cash-subtraction",
      responses: [{
        id: "pay_cost",
        label: "Pay the cost",
        requiresMitigationIds: [],
        effects: [{
          type: "cash_delta",
          direction: "subtract",
          magnitude: { source: "fixed", value: 85_000 },
        }],
      }],
    };
    const state = queueScheduledDeclarativePersonalEventV2(base, {
      proposal: {
        eventId: "event.cash-subtraction.1",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { rebate_cents: 42_500 },
      },
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    }, { personalEventCatalog: [template] });
    vi.mocked(getPersonalEventTemplateV2).mockImplementationOnce(() => template);

    expect(projectRunView(state).pendingInteraction).toMatchObject({
      choices: [{
        id: "pay_cost",
        description: "Adds $850 of expense in the next processed month.",
      }],
    });
  });

  it("projects pending career programs without exposing engine state", () => {
    expect(projectRunView(currentRunState()).career).toEqual({
      pendingProgramIds: [],
    });
  });

  it("projects pending career program IDs", () => {
    const base = currentRunState();
    const state: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        careerDevelopment: {
          ...base.gameplay.careerDevelopment,
          pending: [{
            commandId: "command.career.1",
            programId: "upskill.certificate",
            catalogVersion: "career-catalog-v1",
            startedMonth: base.currentMonth,
            completesMonth: base.currentMonth,
            annualSalaryIncreaseCents: moneyCents(600_000),
          }],
        },
      },
    };

    expect(projectRunView(state).career).toEqual({
      pendingProgramIds: ["upskill.certificate"],
    });
  });

  it("projects every deterministic declared expense and income summary", () => {
    const base = currentRunState();
    const template: PersonalEventTemplateV2 = {
      ...getPersonalEventTemplateV2("personal.medical_bill"),
      id: "personal.projection-summaries",
      responses: [
        {
          id: "increase_obligation",
          label: "Increase obligation",
          requiresMitigationIds: [],
          effects: [{
            type: "required_obligation_delta",
            magnitude: {
              source: "parameter",
              parameterId: "obligation_cents",
              multiplierPpm: ratePpm(1_000_000),
            },
          }],
        },
        {
          id: "pay_recurring",
          label: "Pay recurring",
          requiresMitigationIds: [],
          effects: [{
            type: "recurring_expense",
            magnitude: {
              source: "parameter",
              parameterId: "recurring_cents",
              multiplierPpm: ratePpm(1_000_000),
            },
            durationMonths: 6,
          }],
        },
        {
          id: "receive_income",
          label: "Receive income",
          requiresMitigationIds: [],
          effects: [{
            type: "temporary_income",
            magnitude: {
              source: "parameter",
              parameterId: "income_cents",
              multiplierPpm: ratePpm(1_000_000),
            },
            durationMonths: 1,
          }],
        },
      ],
    };
    const state: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        eventLifecycle: {
          ...base.gameplay.eventLifecycle,
          pending: {
            eventId: "event.projection-summaries.1",
            templateId: template.id,
            templateVersion: template.version,
            tier: "medium",
            targetedWeakness: UNRELATED_HAZARD_TARGET,
            parameters: {
              obligation_cents: 120_000,
              recurring_cents: 30_000,
              income_cents: 85_000,
            },
            choiceIds: template.responses.map(({ id }) => id),
            scheduledMonth: base.currentMonth,
            expiresMonth: base.currentMonth,
            eventSchemaVersion: 2,
          },
        },
      },
    };
    vi.mocked(getPersonalEventTemplateV2).mockImplementationOnce(() => template);

    expect(projectRunView(state).pendingInteraction).toMatchObject({
      choices: [
        {
          id: "increase_obligation",
          description: "Required obligations change by $1,200.",
        },
        {
          id: "pay_recurring",
          description: "Adds a recurring expense of $300 for 6 months.",
        },
        {
          id: "receive_income",
          description: "Adds temporary income of $850 for 1 month.",
        },
      ],
    });
  });
});
