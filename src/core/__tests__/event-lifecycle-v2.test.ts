import { describe, expect, it } from "vitest";

import { US_2026_SCENARIO_CATALOG, US_2026_SCENARIO_CATALOG_VERSION } from "../../data/scenario-catalog";
import { getEventTemplate } from "../../data/event-templates";
import { buildCheckpointEvidenceV2 } from "../checkpoint-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  queueScheduledPersonalEventV2,
  resolveEventChoiceV2,
  type ResolveEventChoiceV2Command,
} from "../event-lifecycle-v2";
import { adjudicateHealthClaim } from "../insurance-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

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
