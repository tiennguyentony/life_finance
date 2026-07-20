import { describe, expect, it, vi } from "vitest";

import { moneyCents, ratePpm } from "@/core/domain/money";
import { simulationMonth } from "@/core/domain/month";
import { calculateNetWorth } from "@/core/game-state";
import {
  queueScheduledDeclarativePersonalEventV2,
  resolveEventChoiceV2,
} from "@/core/event-lifecycle-v2";
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
        monthlyObligations: {
          livingCostCents: expect.any(Number),
          healthPremiumCents: 11_000,
          additionalInsurancePremiumsCents: 1_800,
          termDebtMinimumsCents: 25_000,
          revolvingCreditMinimumCents: 6_120,
          eventExpensesDueCents: 0,
          eventIncomeDueCents: 0,
          otherRequiredCents: 0,
          totalRequiredCashCents:
            state.finances.requiredObligationsCents + 6_120,
        },
      },
      debts: {
        termDebts: [expect.objectContaining({
          kind: "student_loan",
          principalCents: 2_000_000,
          minimumPaymentCents: 25_000,
        })],
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
          enabled: true,
          description: "Schedules $4,250.00 to be paid this month.",
          preview: {
            status: "available",
            immediateCashChangeCents: -425_000,
          },
        },
        {
          id: "use_insurance",
          label: "Use health coverage",
          enabled: true,
          preview: { status: "available" },
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
        enabled: true,
        description: "Schedules $425.00 to be received this month.",
        preview: {
          status: "available",
          immediateCashChangeCents: 42_500,
        },
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
        enabled: true,
        description: "Schedules $850.00 to be paid this month.",
        preview: {
          status: "available",
          immediateCashChangeCents: -85_000,
        },
      }],
    });
  });

  it("shows resolved event cash flows as due until the financial kernel applies them", () => {
    const opening = currentRunState();
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const queued = queueScheduledDeclarativePersonalEventV2(opening, {
      proposal: {
        eventId: "event.medical.due",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { gross_bill_cents: 425_000 },
      },
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    });
    const resolved = resolveEventChoiceV2(queued, {
      schemaVersion: 2,
      id: "command.medical.due",
      type: "resolve_event_choice",
      expectedRevision: queued.revision,
      effectiveMonth: queued.currentMonth,
      payload: { eventId: "event.medical.due", choiceId: "pay_uninsured" },
    });
    const view = projectRunView(resolved);

    expect(view.finances.cashCents).toBe(opening.finances.cashCents);
    expect(view.finances.monthlyObligations).toMatchObject({
      eventExpensesDueCents: 425_000,
      eventIncomeDueCents: 0,
      totalRequiredCashCents:
        resolved.finances.requiredObligationsCents +
        view.finances.monthlyObligations.revolvingCreditMinimumCents +
        425_000,
    });
  });

  it("projects pending career programs without exposing engine state", () => {
    expect(projectRunView(currentRunState()).career).toEqual({
      pendingProgramIds: [],
    });
  });

  it("projects the debt-adjusted FI numerator used by goal progress", () => {
    const base = currentRunState();
    const view = projectRunView({
      ...base,
      finances: {
        ...base.finances,
        nonCreditLiabilitiesCents: moneyCents(250_000),
        creditUsedCents: moneyCents(100_000),
      },
    });

    expect(view.goal.currentCents).toBe(
      Math.max(0, view.finances.investableAssetsCents - 350_000),
    );
    expect(view.goal.progressPpm).toBe(
      Math.floor((view.goal.currentCents * 1_000_000) / view.goal.targetCents),
    );
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

  it("projects the enrolled benefits a player is actually charged for", () => {
    expect(projectRunView(currentRunState()).benefits).toEqual({
      retirementPlan: {
        label: "401(k) standard match",
        employeeAnnualLimitCents: 2_450_000,
        employerMatchTiers: [
          { employeeContributionRateUpToPpm: 30_000, employerMatchRatePpm: 1_000_000 },
          { employeeContributionRateUpToPpm: 50_000, employerMatchRatePpm: 500_000 },
        ],
      },
      healthPlan: {
        label: "HDHP with HSA",
        hsaEligible: true,
        monthlyPremiumCents: 11_000,
        annualDeductibleCents: 180_000,
        annualOutOfPocketMaximumCents: 800_000,
        coinsurancePpm: 200_000,
      },
      insuranceCoverages: [expect.objectContaining({ id: "insurance.renters", kind: "renters" })],
    });
  });

  it("projects only currently active optional insurance coverage", () => {
    const base = currentRunState();
    const state: GameStateV2 = {
      ...base,
      gameplay: {
        ...base.gameplay,
        recurringStrategy: {
          ...base.gameplay.recurringStrategy,
          insuranceCoverageIds: [],
        },
      },
    };

    expect(projectRunView(state).benefits?.insuranceCoverages).toEqual([]);
    expect(
      projectRunView(state).finances.monthlyObligations
        .additionalInsurancePremiumsCents,
    ).toBe(0);
  });

  it("reports unknown benefits for a run with no catalog snapshot", () => {
    const base = currentRunState();
    const state: GameStateV2 = {
      ...base,
      gameplay: { ...base.gameplay, catalogSnapshot: null },
    };

    expect(projectRunView(state).benefits).toBeNull();
  });

  it("projects every deterministic declared expense and income summary", () => {
    const base = currentRunState();
    const template: PersonalEventTemplateV2 = {
      ...getPersonalEventTemplateV2("personal.medical_bill"),
      id: "personal.projection-summaries",
      parameters: [
        {
          id: "obligation_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 120_000,
          maximum: 120_000,
        },
        {
          id: "recurring_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 30_000,
          maximum: 30_000,
        },
        {
          id: "income_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 85_000,
          maximum: 85_000,
        },
      ],
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
          enabled: true,
          preview: { status: "available" },
        },
        {
          id: "pay_recurring",
          enabled: true,
          description: "Pay $300.00 per month for 6 months ($1,800.00 total).",
          preview: {
            status: "available",
            recurringCashFlows: [{
              direction: "expense",
              monthlyCents: 30_000,
              durationMonths: 6,
              totalCents: 180_000,
            }],
          },
        },
        {
          id: "receive_income",
          enabled: true,
          description: "Schedules $850.00 to be received this month.",
          preview: {
            status: "available",
            immediateCashChangeCents: 85_000,
          },
        },
      ],
    });
  });
});
