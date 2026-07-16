import { describe, expect, it, vi } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { adjudicateHealthClaim } from "../insurance-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolvePersonalEventResponseV2 } from "../personal-event-effects-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function state() {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.personal-event-effects-v2",
    playerId: "player.personal-event-effects-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "personal-event-effects-v2",
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
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

describe("declarative personal-event v2 effects", () => {
  it("rejects a mitigation response when the declared coverage is unavailable", () => {
    const opening = state();
    const uninsured = {
      ...opening,
      gameplay: {
        ...opening.gameplay,
        insurance: { ...opening.gameplay.insurance, policyYear: null },
      },
    };
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    expect(() => resolvePersonalEventResponseV2(
      uninsured,
      template,
      {
        eventId: "evt.unavailable.medical.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { gross_bill_cents: 500_000 },
      },
      "use_insurance",
      "cmd.unavailable.medical.v2",
    )).toThrow(expect.objectContaining({ code: "MITIGATION_UNAVAILABLE" }));
  });

  it("rejects a health claim when no resolved health plan exists even with an active policy year", () => {
    const opening = state();
    const withoutResolvedPlan = {
      ...opening,
      gameplay: {
        ...opening.gameplay,
        catalogSnapshot: null,
      },
    };
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    expect(() => resolvePersonalEventResponseV2(
      withoutResolvedPlan,
      template,
      {
        eventId: "evt.missing-plan.medical.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { gross_bill_cents: 500_000 },
      },
      "use_insurance",
      "cmd.missing-plan.medical.v2",
    )).toThrow(expect.objectContaining({ code: "MITIGATION_UNAVAILABLE" }));
  });

  it("applies obligation, living-cost, and wellbeing operations without AI or network", () => {
    const fetch = vi.fn(() => { throw new Error("network is forbidden"); });
    vi.stubGlobal("fetch", fetch);
    const opening = state();
    const base = getPersonalEventTemplateV2("personal.lifestyle_upgrade");
    const template = {
      ...base,
      responses: [{
        id: "combined",
        label: "Apply combined effects",
        requiresMitigationIds: [],
        effects: [
          { type: "required_obligation_delta" as const, magnitude: { source: "fixed" as const, value: 10_000 } },
          { type: "annual_living_cost_delta" as const, magnitude: { source: "fixed" as const, value: 120_000 } },
          { type: "wellbeing_delta" as const, field: "happinessPpm" as const, magnitude: { source: "fixed" as const, value: 25_000 } },
        ],
      }],
    };
    const resolved = resolvePersonalEventResponseV2(
      opening,
      template,
      {
        eventId: "evt.combined.effects.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { annual_cost_increase_cents: 120_000 },
      },
      "combined",
      "cmd.combined.effects.v2",
    );
    expect(resolved.finances.requiredObligationsCents).toBe(opening.finances.requiredObligationsCents + 10_000);
    expect(resolved.finances.annualLivingCostCents).toBe(opening.finances.annualLivingCostCents + 120_000);
    expect(resolved.wellbeing.happinessPpm).toBe(opening.wellbeing.happinessPpm + 25_000);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("adjudicates health insurance through the authoritative insurance engine", () => {
    const opening = state();
    const template = getPersonalEventTemplateV2("personal.medical_bill");
    const grossBillCents = moneyCents(1_000_000);
    const expected = adjudicateHealthClaim(opening, grossBillCents, true);
    const resolved = resolvePersonalEventResponseV2(
      opening,
      template,
      {
        eventId: "evt.2026-07.personal.medical_bill.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { gross_bill_cents: grossBillCents },
      },
      "use_insurance",
      "cmd.resolve.medical.v2",
    );

    expect(resolved.finances.requiredObligationsCents).toBe(
      opening.finances.requiredObligationsCents,
    );
    expect(resolved.activeCashFlows).toEqual([{
      id: expect.stringMatching(/^pef\.[0-9a-f]{32}$/),
      sourceEventId: "evt.2026-07.personal.medical_bill.v2",
      sourceEffectId: "personal.medical_bill@2.use_insurance.effect.0",
      kind: "temporary_expense",
      amountCents: expected.playerResponsibilityCents,
      startMonth: opening.currentMonth,
      remainingMonths: 1,
    }]);
    expect(resolved.insurance).toEqual(expected.nextInsurance);
    expect(resolved.playerCostCents).toBe(expected.playerResponsibilityCents);
    expect(resolved.insurerCostCents).toBe(expected.insurerResponsibilityCents);
  });

  it("persists bounded temporary expense and income effects for the financial kernel", () => {
    const opening = state();
    const base = getPersonalEventTemplateV2("personal.lifestyle_upgrade");
    const template = {
      ...base,
      responses: [{
        id: "bounded_flows",
        label: "Apply bounded flows",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_expense" as const,
            magnitude: { source: "fixed" as const, value: 25_000 },
            durationMonths: 2,
          },
          {
            type: "temporary_income" as const,
            magnitude: { source: "fixed" as const, value: 10_000 },
            durationMonths: 3,
          },
        ],
      }],
    };
    const resolved = resolvePersonalEventResponseV2(
      opening,
      template,
      {
        eventId: "evt.bounded.flows.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { annual_cost_increase_cents: 120_000 },
      },
      "bounded_flows",
      "cmd.bounded.flows.v2",
    );

    expect(resolved.activeCashFlows).toEqual([
      expect.objectContaining({ kind: "temporary_expense", amountCents: 25_000, remainingMonths: 2 }),
      expect.objectContaining({ kind: "temporary_income", amountCents: 10_000, remainingMonths: 3 }),
    ]);
    expect(resolved.playerCostCents).toBe(50_000);
    expect(resolved.finances.requiredObligationsCents).toBe(opening.finances.requiredObligationsCents);
  });

  it.each([
    ["cash direction", { type: "cash_delta", direction: "sideways", magnitude: { source: "fixed", value: 1 } }],
    ["wellbeing field", { type: "wellbeing_delta", field: "energyPpm", magnitude: { source: "fixed", value: 1 } }],
    ["insurance coverage", { type: "insurance_claim", mitigationId: "health_plan", coverage: "dental", grossAmount: { source: "fixed", value: 1 } }],
  ])("rejects a malformed runtime %s before applying effects", (_name, effect) => {
    const opening = state();
    const base = getPersonalEventTemplateV2("personal.medical_bill");
    const invalid = {
      ...base,
      responses: [{
        id: "invalid_runtime",
        label: "Invalid runtime response",
        requiresMitigationIds: [],
        effects: [effect],
      }],
    } as unknown as typeof base;
    expect(() => resolvePersonalEventResponseV2(
      opening,
      invalid,
      {
        eventId: "evt.invalid.runtime.v2",
        templateId: invalid.id,
        templateVersion: invalid.version,
        parameters: { gross_bill_cents: 500_000 },
      },
      "invalid_runtime",
      "cmd.invalid.runtime.v2",
    )).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
    expect(opening.gameplay.eventLifecycle.activeCashFlows).toBeUndefined();
  });

  it("routes a positive cash opportunity to the authoritative financial kernel", () => {
    const opening = state();
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const resolved = resolvePersonalEventResponseV2(
      opening,
      template,
      {
        eventId: "evt.2026-07.personal.performance_bonus.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      "accept_bonus",
      "cmd.resolve.bonus.v2",
    );

    expect(resolved.finances.cashCents).toBe(opening.finances.cashCents);
    expect(resolved.ledger).toBe(opening.ledger);
    expect(resolved.activeCashFlows).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^pef\.[0-9a-f]{32}$/),
      kind: "temporary_income",
      amountCents: 250_000,
      remainingMonths: 1,
    })]);
  });

  it("uses deterministic unique flow ids for multiple cash effects", () => {
    const opening = state();
    const base = getPersonalEventTemplateV2("personal.performance_bonus");
    const template = {
      ...base,
      responses: [{
        ...base.responses[0]!,
        effects: [
          base.responses[0]!.effects[0]!,
          { type: "cash_delta" as const, direction: "add" as const, magnitude: { source: "fixed" as const, value: 10_000 } },
        ],
      }],
    };
    const resolved = resolvePersonalEventResponseV2(
      opening,
      template,
      {
        eventId: "evt.multiple.cash.v2",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { bonus_cents: 250_000 },
      },
      "accept_bonus",
      "cmd.resolve.multiple.cash.v2",
    );
    expect(resolved.activeCashFlows.map(({ id }) => id)).toHaveLength(2);
    expect(new Set(resolved.activeCashFlows.map(({ id }) => id)).size).toBe(2);
    expect(resolved.activeCashFlows.every(({ id }) => id.length <= 64)).toBe(true);
  });
});
