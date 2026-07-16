import { describe, expect, it } from "vitest";

import { US_2026_SCENARIO_CATALOG, US_2026_SCENARIO_CATALOG_VERSION } from "../../data/scenario-catalog";
import { getEventTemplate } from "../../data/event-templates";
import { buildCheckpointEvidenceV2 } from "../checkpoint-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  queueScheduledDeclarativePersonalEventV2,
  queueScheduledPersonalEventV2,
  resolveEventChoiceV2,
  type ResolveEventChoiceV2Command,
} from "../event-lifecycle-v2";
import { adjudicateHealthClaim } from "../insurance-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { finalizeGameStateV2, validateGameStateV2 } from "../game-state-v2";
import { scheduleDeclarativePersonalEventV2 } from "../personal-event-v2";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import { decodePersistedGameState } from "../persisted-game-state";
import { sha256Canonical } from "../canonical";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";

function state() {
  const resolvedScenario = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId: "scenario.fresh_start",
  });
  return createNativeGameStateV2({
    runId: "run.event-lifecycle-v2",
    playerId: "player.event-lifecycle-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "event-lifecycle-v2",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(100_000),
      taxableBroadIndexCents: moneyCents(200_000),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(800_000),
    },
    wellbeing: { burnoutPpm: ratePpm(100_000), happinessPpm: ratePpm(900_000) },
  });
}

function queue(templateId: "personal.unexpected_repair" | "personal.medical_bill", amount: number) {
  const initial = state();
  const template = getEventTemplate(templateId);
  const parameterId = template.parameters[0]!.id;
  return {
    initial,
    queued: queueScheduledPersonalEventV2(initial, {
      proposal: {
        eventId: `evt.2026-07.${templateId}`,
        templateId,
        templateVersion: template.version,
        parameters: { [parameterId]: amount },
      },
      template,
      targetedWeakness: "low_emergency_fund",
    }),
  };
}

function command(
  queued: ReturnType<typeof state>,
  choiceId: string,
): ResolveEventChoiceV2Command {
  return {
    schemaVersion: 2,
    id: `cmd.choice.${choiceId}`,
    type: "resolve_event_choice",
    expectedRevision: queued.revision,
    effectiveMonth: queued.currentMonth,
    payload: { eventId: queued.gameplay.eventLifecycle.pending!.eventId, choiceId },
  };
}

describe("v2 event lifecycle", () => {
  it("queues and resolves declarative v2 metadata, recovery, and follow-ups", () => {
    const initial = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.2026-07.personal.performance_bonus.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    expect(queued.gameplay.eventLifecycle.pending).toMatchObject({
      eventSchemaVersion: 2,
      category: "opportunity",
      classification: "positive",
      pressureCost: 0,
      recoveryDurationMonths: 0,
      choiceIds: ["accept_bonus"],
      fallbackNarrative: template.fallbackNarrative,
    });

    const resolved = resolveEventChoiceV2(
      queued,
      command(queued, "accept_bonus"),
    );
    expect(resolved.finances.cashCents).toBe(initial.finances.cashCents);
    expect(resolved.gameplay.eventLifecycle.activeCashFlows).toEqual([
      expect.objectContaining({ kind: "temporary_income", amountCents: 250_000, remainingMonths: 1 }),
    ]);
    expect(resolved.gameplay.eventLifecycle.history.at(-1)).toMatchObject({
      eventSchemaVersion: 2,
      category: "opportunity",
      classification: "positive",
      lessonTags: template.lessonTags,
      pressureCost: 0,
      recoveryDurationMonths: 0,
      scheduledCashFlows: [expect.objectContaining({
        kind: "temporary_income",
        amountCents: 250_000,
        durationMonths: 1,
        startMonth: "2026-07",
        sourceEffectId: "personal.performance_bonus@2.accept_bonus.effect.0",
      })],
    });
    expect(resolved.gameplay.eventLifecycle.scheduledFollowUps).toEqual([{
      sourceEventId: "evt.2026-07.personal.performance_bonus.v2",
      templateId: "personal.utility_rebate",
      templateVersion: 2,
      eligibleMonth: "2026-09",
    }]);
    expect(resolved.gameplay.eventLifecycle.cooldowns).toContainEqual({
      templateId: "personal.performance_bonus",
      eligibleAgainMonth: "2027-07",
    });
  });

  it("rejects forged declarative metadata even when id, version, and parameters match", () => {
    const initial = state();
    const canonical = getPersonalEventTemplateV2("personal.performance_bonus");
    expect(() => queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.forged.personal.performance_bonus.v2",
        templateId: canonical.id,
        templateVersion: canonical.version,
        parameters: { bonus_cents: 250_000 },
      },
      template: { ...canonical, category: "health" },
      targetedWeakness: "unrelated_hazard",
    })).toThrow(expect.objectContaining({ code: "INVALID_COMMAND" }));
  });

  it("rejects persisted v2 event metadata and follow-ups that drift from the exact registry version", () => {
    const initial = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.validate.personal.performance_bonus.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    const corruptPending = {
      ...queued,
      gameplay: {
        ...queued.gameplay,
        eventLifecycle: {
          ...queued.gameplay.eventLifecycle,
          pending: { ...queued.gameplay.eventLifecycle.pending!, category: "health" },
        },
      },
    };
    expect(validateGameStateV2(corruptPending).map(({ code }) => code)).toContain(
      "event_template_metadata_mismatch",
    );

    const resolved = resolveEventChoiceV2(queued, command(queued, "accept_bonus"));
    const corruptFollowUp = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          scheduledFollowUps: [{
            ...resolved.gameplay.eventLifecycle.scheduledFollowUps![0]!,
            templateVersion: 999,
          }],
        },
      },
    };
    expect(validateGameStateV2(corruptFollowUp).map(({ code }) => code)).toContain(
      "invalid_scheduled_followup",
    );
    const duplicateFollowUp = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          scheduledFollowUps: [
            resolved.gameplay.eventLifecycle.scheduledFollowUps![0]!,
            resolved.gameplay.eventLifecycle.scheduledFollowUps![0]!,
          ],
        },
      },
    };
    expect(validateGameStateV2(duplicateFollowUp).map(({ code }) => code)).toContain(
      "duplicate_scheduled_followup",
    );
  });

  it("rejects discriminator misuse and exact-template proposal or choice drift", () => {
    const initial = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.validate.exact.personal.performance_bonus.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    const withPending = (pending: unknown) => ({
      ...queued,
      gameplay: {
        ...queued.gameplay,
        eventLifecycle: { ...queued.gameplay.eventLifecycle, pending },
      },
    }) as typeof queued;
    expect(validateGameStateV2(withPending({
      ...queued.gameplay.eventLifecycle.pending!,
      eventSchemaVersion: 3,
    })).map(({ code }) => code)).toContain("unsupported_event_schema_version");
    expect(validateGameStateV2(withPending({
      ...queued.gameplay.eventLifecycle.pending!,
      eventSchemaVersion: undefined,
    })).map(({ code }) => code)).toContain("missing_event_schema_discriminator");
    expect(validateGameStateV2(withPending({
      ...queued.gameplay.eventLifecycle.pending!,
      parameters: { bonus_cents: 250_000, invented: 1 },
    })).map(({ code }) => code)).toContain("event_template_proposal_mismatch");

    const resolved = resolveEventChoiceV2(queued, command(queued, "accept_bonus"));
    const corruptHistory = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          history: [{
            ...resolved.gameplay.eventLifecycle.history[0]!,
            parameters: { bonus_cents: 999_999_999 },
            choiceId: "invented_choice",
            availableChoiceIds: ["invented_choice"],
          }],
        },
      },
    };
    expect(validateGameStateV2(corruptHistory).map(({ code }) => code)).toEqual(
      expect.arrayContaining(["event_template_metadata_mismatch", "event_template_proposal_mismatch"]),
    );
  });

  it("rejects invalid or duplicate persisted personal-event cash flows", () => {
    const initial = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.validate.flow.personal.performance_bonus.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    const resolved = resolveEventChoiceV2(queued, command(queued, "accept_bonus"));
    const flow = resolved.gameplay.eventLifecycle.activeCashFlows![0]!;
    const invalid = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          activeCashFlows: [flow, { ...flow, amountCents: -1, remainingMonths: 0 }],
        },
      },
    } as typeof resolved;
    expect(validateGameStateV2(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(["duplicate_event_cash_flow", "invalid_event_cash_flow"]),
    );

    const forgedFlows = [
      { ...flow, amountCents: moneyCents(flow.amountCents + 1) },
      { ...flow, kind: "recurring_expense" as const },
      { ...flow, sourceEffectId: "personal.performance_bonus@2.accept_bonus.effect.999" },
      { ...flow, startMonth: simulationMonth("2026-06") },
      { ...flow, remainingMonths: 2 },
      { ...flow, id: "pef.forged" },
    ];
    for (const forged of forgedFlows) {
      const corrupt = {
        ...resolved,
        gameplay: {
          ...resolved.gameplay,
          eventLifecycle: {
            ...resolved.gameplay.eventLifecycle,
            activeCashFlows: [forged],
          },
        },
      } as typeof resolved;
      expect(validateGameStateV2(corrupt).map(({ code }) => code)).toContain(
        "invalid_event_cash_flow",
      );
    }
    const erased = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          activeCashFlows: [],
        },
      },
    } as typeof resolved;
    expect(validateGameStateV2(erased).map(({ code }) => code)).toContain(
      "invalid_event_cash_flow",
    );

    const forgedEvidence = {
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          history: [{
            ...resolved.gameplay.eventLifecycle.history[0]!,
            scheduledCashFlows: [{
              ...resolved.gameplay.eventLifecycle.history[0]!.scheduledCashFlows![0]!,
              amountCents: moneyCents(1),
            }],
          }],
        },
      },
    } as typeof resolved;
    expect(validateGameStateV2(forgedEvidence).map(({ code }) => code)).toContain(
      "event_scheduled_cash_flow_mismatch",
    );
  });

  it("queues a due exact-version follow-up once and consumes its persisted schedule", () => {
    const initial = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(initial, {
      proposal: {
        eventId: "evt.followup.source.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    const resolved = resolveEventChoiceV2(queued, command(queued, "accept_bonus"));
    const dueState = finalizeGameStateV2({
      ...resolved,
      currentMonth: simulationMonth("2026-09"),
      gameplay: {
        ...resolved.gameplay,
        eventLifecycle: {
          ...resolved.gameplay.eventLifecycle,
          activeCashFlows: [],
        },
      },
    });
    const schedule = scheduleDeclarativePersonalEventV2(
      dueState,
      PERSONAL_EVENT_TEMPLATES_V2,
    );
    expect(schedule.event).toMatchObject({
      followUpSourceEventId: "evt.followup.source.v2",
      template: { id: "personal.utility_rebate", version: 2 },
    });
    const followUpQueued = queueScheduledDeclarativePersonalEventV2(
      dueState,
      schedule.event!,
    );
    expect(followUpQueued.gameplay.eventLifecycle.scheduledFollowUps).toEqual([]);
  });

  it("round-trips current v2 event state while absent optional fields keep the historical checksum", () => {
    const legacyShape = state();
    expect(legacyShape.gameplay.eventLifecycle.scheduledFollowUps).toBeUndefined();
    expect(sha256Canonical(decodePersistedGameState(legacyShape))).toBe(
      sha256Canonical(legacyShape),
    );

    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const queued = queueScheduledDeclarativePersonalEventV2(legacyShape, {
      proposal: {
        eventId: "evt.persisted.current.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      template,
      targetedWeakness: "unrelated_hazard",
    });
    const resolved = resolveEventChoiceV2(queued, command(queued, "accept_bonus"));
    expect(sha256Canonical(decodePersistedGameState(resolved))).toBe(
      sha256Canonical(resolved),
    );
  });

  it("persists the exact scheduled proposal and resolves one declared choice", () => {
    const { initial, queued } = queue("personal.unexpected_repair", 100_000);
    expect(queued.gameplay.eventLifecycle.pending).toMatchObject({
      templateId: "personal.unexpected_repair",
      parameters: { repair_cost_cents: 100_000 },
      choiceIds: ["repair_now", "negotiate_repair"],
      scheduledMonth: "2026-07",
      expiresMonth: "2026-08",
    });

    const resolved = resolveEventChoiceV2(queued, command(queued, "negotiate_repair"));
    expect(resolved.revision).toBe(initial.revision + 1);
    expect(resolved.gameplay.eventLifecycle.pending).toBeNull();
    expect(resolved.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents + 80_000,
    );
    expect(resolved.gameplay.eventLifecycle.history[0]).toMatchObject({
      commandId: "cmd.choice.negotiate_repair",
      resultingRevision: 1,
      choiceId: "negotiate_repair",
      availableChoiceIds: ["repair_now", "negotiate_repair"],
      playerCostCents: 80_000,
      insurerCostCents: 0,
    });
    expect(resolved.gameplay.eventLifecycle.cooldowns).toEqual([
      { templateId: "personal.unexpected_repair", eligibleAgainMonth: "2026-10" },
    ]);
    expect(buildCheckpointEvidenceV2(initial, resolved, []).eventChoices).toEqual(
      resolved.gameplay.eventLifecycle.history,
    );
  });

  it("rejects client-selected event ids and undeclared choices without mutation", () => {
    const { queued } = queue("personal.unexpected_repair", 100_000);
    const wrongEvent = {
      ...command(queued, "repair_now"),
      payload: { eventId: "evt.client-invented", choiceId: "repair_now" },
    };
    expect(() => resolveEventChoiceV2(queued, wrongEvent)).toThrowError(
      expect.objectContaining({ code: "EVENT_MISMATCH" }),
    );
    expect(() => resolveEventChoiceV2(queued, command(queued, "invented"))).toThrowError(
      expect.objectContaining({ code: "INVALID_CHOICE" }),
    );
    expect(queued.gameplay.eventLifecycle.history).toEqual([]);
  });

  it("replaces the simplified medical estimate with exact policy adjudication", () => {
    const grossBill = moneyCents(1_000_000);
    const { initial, queued } = queue("personal.medical_bill", grossBill);
    const expected = adjudicateHealthClaim(initial, grossBill, true);
    const resolved = resolveEventChoiceV2(queued, command(queued, "use_insurance"));

    expect(resolved.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents + expected.playerResponsibilityCents,
    );
    expect(resolved.gameplay.insurance).toEqual(expected.nextInsurance);
    expect(resolved.gameplay.eventLifecycle.history[0]).toMatchObject({
      playerCostCents: expected.playerResponsibilityCents,
      insurerCostCents: expected.insurerResponsibilityCents,
    });
  });
});
