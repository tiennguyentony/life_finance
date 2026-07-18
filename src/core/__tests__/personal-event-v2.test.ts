import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  PERSONAL_EVENT_SCHEMA_V2,
  generateDeclarativePersonalEventCandidatesV2,
  scheduleDeclarativePersonalEventV2,
  validatePersonalEventCatalogV2,
  validatePersonalEventTemplateV2,
  type PersonalEventTemplateV2,
} from "../personal-event-v2";
import {
  ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
  HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_TEMPLATES_V2,
  PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2,
  getActivePersonalEventTemplateV2,
  getPersonalEventTemplateV2,
} from "../../data/personal-event-templates-v2";
import {
  PERSONAL_EVENT_PRESENTATIONS_V1,
  getPersonalEventPresentationV1,
  validatePersonalEventPresentationCatalogV1,
} from "../../data/personal-event-presentation-v1";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
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
    runId: "run.personal-event-v2",
    playerId: "player.personal-event-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "personal-event-v2",
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

function alwaysTemplate(): PersonalEventTemplateV2 {
  return {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.test_setback",
    version: 2,
    category: "maintenance",
    classification: "negative",
    lessonTags: { primary: "lesson.emergency_fund", secondary: [] },
    eligibility: [],
    hazard: {
      baseChancePpm: 1_000_000,
      minimumChancePpm: 0,
      maximumChancePpm: 1_000_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 1,
    parameters: [{
      id: "cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 10_000,
      maximum: 20_000,
    }],
    mitigations: [],
    responses: [{
      id: "pay",
      label: "Pay it",
      requiresMitigationIds: [],
      effects: [{
        type: "required_obligation_delta",
        magnitude: { source: "parameter", parameterId: "cost_cents", multiplierPpm: 1_000_000 },
      }],
    }],
    followUps: [],
    cooldowns: { eventMonths: 2, categoryMonths: 1, lessonMonths: 1 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 1 },
    fallbackNarrative: { headline: "A test setback", body: "A bounded expense arrives." },
  };
}

describe("declarative personal-event v2 catalog", () => {
  it("separates exact replay, highest-version active, and gated production catalogs", () => {
    expect(getPersonalEventTemplateV2("personal.medical_bill", 2).responses.map(({ id }) => id))
      .toEqual(["pay_uninsured", "use_insurance"]);
    expect(getPersonalEventTemplateV2("personal.transport_repair", 2).followUps)
      .toEqual([{
        templateId: "personal.transport_repair_followup",
        templateVersion: 2,
        delayMonths: 2,
        whenResponseIds: ["defer_repair"],
      }]);
    expect(PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2)
      .toEqual(HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2);
    expect(new Set(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.map(({ id }) => id)).size)
      .toBe(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.length);
    expect(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.every((template) =>
      getActivePersonalEventTemplateV2(template.id) === template,
    )).toBe(true);
    expect(Object.isFrozen(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2)).toBe(true);
  });

  it("keeps historical V2 meanings while active scheduling selects expanded V3 choices", () => {
    expect(getPersonalEventTemplateV2("personal.medical_bill", 2).responses.map(({ id }) => id))
      .toEqual(["pay_uninsured", "use_insurance"]);
    expect(getPersonalEventTemplateV2("personal.medical_bill", 3).responses.map(({ id }) => id))
      .toEqual([
        "use_insurance",
        "negotiate_bill",
        "medical_payment_plan",
        "pay_uninsured",
      ]);
    expect(getActivePersonalEventTemplateV2("personal.medical_bill").version).toBe(3);
    expect(getActivePersonalEventTemplateV2("personal.lifestyle_upgrade").responses)
      .toHaveLength(3);
    expect(getActivePersonalEventTemplateV2("personal.performance_bonus").responses)
      .toHaveLength(3);
    expect(getActivePersonalEventTemplateV2("personal.utility_rebate").responses)
      .toHaveLength(3);
    expect(getPersonalEventTemplateV2("personal.transport_repair", 2).followUps[0])
      .toMatchObject({ templateVersion: 2 });
    expect(getActivePersonalEventTemplateV2("personal.transport_repair").followUps[0])
      .toMatchObject({ templateVersion: 3 });
    expect(getActivePersonalEventTemplateV2("personal.transport_repair_followup").responses)
      .toHaveLength(3);
  });

  it("contains valid setbacks, traps, and at least two opportunities", () => {
    expect(validatePersonalEventCatalogV2(PERSONAL_EVENT_TEMPLATES_V2)).toEqual([]);
    expect(PERSONAL_EVENT_TEMPLATES_V2.some(({ classification }) => classification === "negative")).toBe(true);
    expect(PERSONAL_EVENT_TEMPLATES_V2.some(({ category }) => category === "behavioral_trap")).toBe(true);
    expect(PERSONAL_EVENT_TEMPLATES_V2.filter(({ classification }) => classification === "positive").length)
      .toBeGreaterThanOrEqual(2);
  });

  it("adds eight low-stakes humorous roots with distinct three-or-four-way decisions", () => {
    const expected = [
      ["personal.subscription_archaeology", "relatable_comedy", 180_000],
      ["personal.group_chat_gift", "relatable_comedy", 180_000],
      ["personal.countertop_gadget_sale", "relatable_comedy", 180_000],
      ["personal.double_grocery_delivery", "relatable_comedy", 180_000],
      ["personal.mascot_side_hustle", "relatable_comedy", 180_000],
      ["personal.laundry_final_spin", "relatable_comedy", 180_000],
      ["personal.raccoon_sanitation", "absurd_comedy", 90_000],
      ["personal.rare_yard_sale_lamp", "absurd_comedy", 90_000],
    ] as const;

    for (const [id, tone, chancePpm] of expected) {
      const template = getPersonalEventTemplateV2(id, 2);
      expect(template).toMatchObject({
        severityTier: "micro",
        hazard: {
          baseChancePpm: chancePpm,
          minimumChancePpm: chancePpm,
          maximumChancePpm: chancePpm,
          modifiers: [],
        },
        cooldowns: { eventMonths: 12, categoryMonths: 1, lessonMonths: 1 },
        maximumOccurrences: 1,
      });
      expect(template.pressureCost).toBeLessThanOrEqual(1);
      expect(template.responses.length).toBeGreaterThanOrEqual(3);
      expect(template.responses.length).toBeLessThanOrEqual(4);
      expect(new Set(template.responses.map(({ effects }) => JSON.stringify(effects))).size)
        .toBe(template.responses.length);
      expect(getPersonalEventPresentationV1(id, 2)).toMatchObject({
        tone,
        cadenceRole: "engagement",
      });
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.responses)).toBe(true);
    }
  });

  it("encodes the approved funny-event economy and declared follow-ups", () => {
    const gadget = getPersonalEventTemplateV2("personal.countertop_gadget_sale", 2);
    expect(gadget.responses.find(({ id }) => id === "four_month_plan")?.effects)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        type: "recurring_expense",
        magnitude: expect.objectContaining({ multiplierPpm: 300_000 }),
        durationMonths: 4,
      })]));

    const groceries = getPersonalEventTemplateV2("personal.double_grocery_delivery", 2);
    expect(groceries.responses.find(({ id }) => id === "resell_surplus")?.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "temporary_expense",
          magnitude: expect.objectContaining({ multiplierPpm: 1_000_000 }),
        }),
        expect.objectContaining({
          type: "temporary_income",
          magnitude: expect.objectContaining({ multiplierPpm: 800_000 }),
        }),
      ]));

    const mascot = getPersonalEventTemplateV2("personal.mascot_side_hustle", 2);
    const weekendIncomePpm = mascot.responses
      .find(({ id }) => id === "work_weekend")!
      .effects
      .filter((effect) => effect.type === "temporary_income")
      .reduce((sum, effect) => sum + (
        effect.type === "temporary_income" && effect.magnitude.source === "parameter"
          ? effect.magnitude.multiplierPpm
          : 0
      ), 0);
    expect(weekendIncomePpm).toBe(2_200_000);

    expect(getPersonalEventTemplateV2("personal.raccoon_sanitation", 2).followUps)
      .toEqual([{
        templateId: "personal.raccoon_management_followup",
        templateVersion: 2,
        delayMonths: 2,
        whenResponseIds: ["ignore_inspector"],
      }]);
    expect(getPersonalEventTemplateV2("personal.rare_yard_sale_lamp", 2).followUps)
      .toEqual([{
        templateId: "personal.lamp_market_followup",
        templateVersion: 2,
        delayMonths: 2,
        whenResponseIds: ["buy_restore_and_list"],
      }]);
    for (const id of [
      "personal.raccoon_management_followup",
      "personal.lamp_market_followup",
    ]) {
      expect(getPersonalEventTemplateV2(id, 2).hazard.maximumChancePpm).toBe(0);
      expect(getPersonalEventPresentationV1(id, 2).cadenceRole).toBe("follow_up");
    }
  });

  it("requires immutable exact-version presentation metadata for the complete catalog", () => {
    expect(validatePersonalEventPresentationCatalogV1(
      PERSONAL_EVENT_TEMPLATES_V2,
      PERSONAL_EVENT_PRESENTATIONS_V1,
    )).toEqual([]);
    expect(PERSONAL_EVENT_PRESENTATIONS_V1).toHaveLength(PERSONAL_EVENT_TEMPLATES_V2.length);
    expect(Object.isFrozen(PERSONAL_EVENT_PRESENTATIONS_V1)).toBe(true);
    expect(Object.isFrozen(PERSONAL_EVENT_PRESENTATIONS_V1[0])).toBe(true);
  });

  it("rejects missing, duplicate, unknown, unsafe-humor, and exogenous-follow-up metadata", () => {
    const first = PERSONAL_EVENT_PRESENTATIONS_V1[0]!;
    expect(validatePersonalEventPresentationCatalogV1(
      PERSONAL_EVENT_TEMPLATES_V2,
      PERSONAL_EVENT_PRESENTATIONS_V1.slice(1),
    ).map(({ code }) => code)).toContain("missing_presentation_identity");
    expect(validatePersonalEventPresentationCatalogV1(
      PERSONAL_EVENT_TEMPLATES_V2,
      [...PERSONAL_EVENT_PRESENTATIONS_V1, first],
    ).map(({ code }) => code)).toContain("duplicate_presentation_identity");
    expect(validatePersonalEventPresentationCatalogV1(
      PERSONAL_EVENT_TEMPLATES_V2,
      [...PERSONAL_EVENT_PRESENTATIONS_V1, {
        templateId: "personal.unknown",
        templateVersion: 2,
        tone: "serious",
        cadenceRole: "challenge",
      }],
    ).map(({ code }) => code)).toContain("unknown_presentation_identity");

    const funny = getPersonalEventTemplateV2("personal.raccoon_sanitation", 2);
    expect(validatePersonalEventPresentationCatalogV1(
      [{ ...funny, severityTier: "medium" }],
      [getPersonalEventPresentationV1(funny.id, funny.version)],
    ).map(({ code }) => code)).toContain("unsafe_humorous_root");

    const followUp = getPersonalEventTemplateV2("personal.lamp_market_followup", 2);
    expect(validatePersonalEventPresentationCatalogV1(
      [{
        ...followUp,
        hazard: { ...followUp.hazard, maximumChancePpm: 1 },
      }],
      [getPersonalEventPresentationV1(followUp.id, followUp.version)],
    ).map(({ code }) => code)).toContain("exogenous_follow_up");
  });

  it("contains six distinct beginner decisions with materially different responses", () => {
    const decisionIds = [
      "personal.transport_repair",
      "personal.rent_renewal",
      "personal.family_care_request",
      "personal.work_device_replacement",
      "personal.reduced_work_hours",
      "personal.social_commitment",
    ] as const;

    expect(PERSONAL_EVENT_TEMPLATES_V2.length).toBeGreaterThanOrEqual(11);
    for (const id of decisionIds) {
      const template = getPersonalEventTemplateV2(id);
      expect(template.responses.length).toBeGreaterThanOrEqual(2);
      expect(new Set(template.responses.map(({ effects }) => JSON.stringify(effects))).size)
        .toBe(template.responses.length);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.responses)).toBe(true);
    }

    const repair = getPersonalEventTemplateV2("personal.transport_repair");
    expect(repair.responses.map(({ id }) => id)).toEqual([
      "pay_now",
      "payment_plan",
      "defer_repair",
    ]);
    expect(repair.followUps).toEqual([expect.objectContaining({
      templateId: "personal.transport_repair_followup",
      whenResponseIds: ["defer_repair"],
    })]);
    expect(getPersonalEventTemplateV2("personal.transport_repair_followup"))
      .toMatchObject({
        classification: "negative",
        severityTier: "large",
        parameters: [{ minimum: 500_000, maximum: 1_500_000 }],
        recovery: { durationMonths: 12 },
      });
    expect(repair).toMatchObject({
      hazard: { baseChancePpm: 100_000 },
      parameters: [{ minimum: 100_000, maximum: 400_000 }],
      recovery: { durationMonths: 9 },
    });
    const reducedHours = getPersonalEventTemplateV2("personal.reduced_work_hours");
    expect(reducedHours).toMatchObject({
      hazard: { baseChancePpm: 80_000 },
      parameters: [{ minimum: 300_000, maximum: 700_000 }],
      recovery: { durationMonths: 9 },
    });
    expect(reducedHours.responses.find(({ id }) => id === "spread_income_gap"))
      .toMatchObject({
        effects: [{
          type: "recurring_expense",
          magnitude: { source: "parameter", multiplierPpm: 600_000 },
          durationMonths: 6,
        }],
      });
    for (const id of [
      "personal.rent_renewal",
      "personal.family_care_request",
    ]) {
      expect(getPersonalEventTemplateV2(id).recovery.durationMonths).toBe(9);
    }
  });

  it("rejects duplicate identities, invalid bounds, missing lessons, and responses without effects", () => {
    const valid = alwaysTemplate();
    const invalid: PersonalEventTemplateV2 = {
      ...valid,
      lessonTags: { primary: "", secondary: [] },
      parameters: [{ ...valid.parameters[0]!, minimum: 30_000, maximum: 20_000 }],
      responses: [{ ...valid.responses[0]!, effects: [] }],
    };
    expect(validatePersonalEventTemplateV2(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(["missing_primary_lesson", "invalid_parameter_bounds", "missing_machine_effect"]),
    );
    expect(validatePersonalEventCatalogV2([valid, valid]).map(({ code }) => code)).toContain("duplicate_event_identity");
    expect(
      validatePersonalEventTemplateV2({ ...valid, responses: [] }).map(({ code }) => code),
    ).toContain("missing_response");
  });

  it("rejects unsafe declarative configuration before startup", () => {
    const valid = alwaysTemplate();
    const invalid = {
      ...valid,
      category: "invented_category",
      classification: "harmful",
      severityTier: "ambient",
      eligibility: [{
        type: "macro_regime",
        required: ["expansion"],
        blocked: ["expansion"],
      }, { type: "invented_eligibility" }],
      hazard: {
        ...valid.hazard,
        modifiers: [{ type: "invented_modifier", deltaPpm: 1 }],
      },
      parameters: [{
        ...valid.parameters[0]!,
        kind: "decimal_dollars",
        distribution: "normal_random",
      }],
      mitigations: [
        { id: "coverage", type: "selected_coverage" },
        { id: "coverage", type: "selected_coverage", coverageId: "insurance.renters" },
      ],
      responses: [
        valid.responses[0],
        {
          ...valid.responses[0],
          effects: [
            { type: "invented_executable_effect", run: () => 1 },
            { type: "liquidate_asset", account: "retirement", magnitude: { source: "fixed", value: 10_000 } },
            { type: "cash_delta", direction: "sideways", magnitude: { source: "fixed", value: 10_000 } },
            { type: "wellbeing_delta", field: "energyPpm", magnitude: { source: "fixed", value: 1 } },
            { type: "insurance_claim", mitigationId: "coverage", coverage: "dental", grossAmount: { source: "fixed", value: 10_000 } },
          ],
        },
      ],
      cooldowns: { eventMonths: 0, categoryMonths: 1, lessonMonths: 1 },
      recovery: { durationMonths: 1 },
      followUps: [{
        templateId: "personal.missing_followup",
        templateVersion: 2,
        delayMonths: -1,
        whenResponseIds: ["missing_response"],
      }],
    } as unknown as PersonalEventTemplateV2;

    expect(validatePersonalEventTemplateV2(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "macro_condition_conflict",
        "duplicate_mitigation_id",
        "unsupported_coverage_reference",
        "duplicate_response_id",
        "invalid_effect_operation",
        "unsupported_account_reference",
        "non_json_value",
        "cooldown_recovery_conflict",
        "invalid_followup_delay",
        "unknown_followup_response",
        "invalid_category",
        "invalid_classification",
        "invalid_severity_tier",
        "invalid_eligibility_rule",
        "invalid_hazard_modifier_type",
        "invalid_parameter_kind",
        "invalid_parameter_distribution",
        "invalid_cash_direction",
        "invalid_wellbeing_field",
        "invalid_insurance_coverage",
      ]),
    );
    expect(validatePersonalEventCatalogV2([invalid]).map(({ code }) => code)).toContain(
      "unknown_followup_target",
    );
  });

  it("uses the authoritative inflation and recovery market regimes", () => {
    const valid = alwaysTemplate();
    for (const regime of ["inflation", "recovery"] as const) {
      expect(
        validatePersonalEventTemplateV2({
          ...valid,
          eligibility: [{
            type: "macro_regime",
            required: [regime],
            blocked: [],
          }],
          hazard: {
            ...valid.hazard,
            modifiers: [{
              type: "macro_regime",
              regimes: [regime],
              deltaPpm: 10_000,
            }],
          },
        }),
      ).toEqual([]);
    }

    const obsoleteNeutral = {
      ...valid,
      eligibility: [{
        type: "macro_regime",
        required: ["neutral"],
        blocked: [],
      }],
    } as unknown as PersonalEventTemplateV2;
    expect(
      validatePersonalEventTemplateV2(obsoleteNeutral).map(({ code }) => code),
    ).toContain("macro_condition_conflict");
  });

  it("rejects duplicate exact follow-up declarations", () => {
    const source = getPersonalEventTemplateV2("personal.performance_bonus");
    const duplicate: PersonalEventTemplateV2 = {
      ...source,
      followUps: [source.followUps[0]!, source.followUps[0]!],
    };
    expect(
      validatePersonalEventCatalogV2([
        duplicate,
        getPersonalEventTemplateV2("personal.utility_rebate"),
      ]).map(({ code }) => code),
    ).toContain("duplicate_followup_declaration");
  });

  it("rejects mitigation mismatches and parameter-unit mismatches", () => {
    const valid = alwaysTemplate();
    const unknownMitigation = {
      ...valid,
      mitigations: [{ id: "mystery", type: "invented_mitigation" }],
    } as unknown as PersonalEventTemplateV2;
    expect(validatePersonalEventTemplateV2(unknownMitigation).map(({ code }) => code)).toContain(
      "invalid_mitigation_type",
    );

    const healthClaim = {
      ...valid,
      mitigations: [{ id: "health_plan", type: "health_insurance" as const }],
      responses: [{
        id: "claim",
        label: "Claim",
        requiresMitigationIds: [],
        effects: [{
          type: "insurance_claim" as const,
          mitigationId: "health_plan",
          coverage: "health" as const,
          grossAmount: { source: "parameter" as const, parameterId: "cost_cents", multiplierPpm: 1_000_000 },
        }],
      }],
    };
    expect(validatePersonalEventTemplateV2(healthClaim).map(({ code }) => code)).toContain(
      "unrequired_claim_mitigation",
    );
    const multipleClaims = {
      ...healthClaim,
      responses: [{
        ...healthClaim.responses[0]!,
        requiresMitigationIds: ["health_plan"],
        effects: [healthClaim.responses[0]!.effects[0]!, healthClaim.responses[0]!.effects[0]!],
      }],
    };
    expect(validatePersonalEventTemplateV2(multipleClaims).map(({ code }) => code)).toContain(
      "multiple_insurance_claims",
    );
    const mismatchedCoverage = {
      ...healthClaim,
      mitigations: [{ id: "health_plan", type: "selected_coverage" as const, coverageId: "insurance.renters" }],
      responses: [{
        ...healthClaim.responses[0]!,
        requiresMitigationIds: ["health_plan"],
      }],
    };
    expect(validatePersonalEventTemplateV2(mismatchedCoverage).map(({ code }) => code)).toContain(
      "claim_mitigation_mismatch",
    );
    const mismatchedCoverageId = {
      ...mismatchedCoverage,
      responses: [{
        ...mismatchedCoverage.responses[0]!,
        effects: [{
          ...mismatchedCoverage.responses[0]!.effects[0]!,
          coverage: "selected_coverage" as const,
          coverageId: "insurance.auto",
        }],
      }],
    };
    expect(validatePersonalEventTemplateV2(mismatchedCoverageId).map(({ code }) => code)).toContain(
      "claim_mitigation_mismatch",
    );

    const wrongUnits: PersonalEventTemplateV2 = {
      ...valid,
      parameters: [{ ...valid.parameters[0]!, kind: "rate_ppm" }],
    };
    expect(validatePersonalEventTemplateV2(wrongUnits).map(({ code }) => code)).toContain(
      "invalid_effect_parameter_kind",
    );
    const wellbeingWrongUnits: PersonalEventTemplateV2 = {
      ...valid,
      responses: [{
        ...valid.responses[0]!,
        effects: [{
          type: "wellbeing_delta",
          field: "happinessPpm",
          magnitude: { source: "parameter", parameterId: "cost_cents", multiplierPpm: 1_000_000 },
        }],
      }],
    };
    expect(validatePersonalEventTemplateV2(wellbeingWrongUnits).map(({ code }) => code)).toContain(
      "invalid_effect_parameter_kind",
    );
    const negativeCash: PersonalEventTemplateV2 = {
      ...valid,
      responses: [{
        ...valid.responses[0]!,
        effects: [{
          type: "cash_delta",
          direction: "subtract",
          magnitude: { source: "fixed", value: -1 },
        }],
      }],
    };
    expect(validatePersonalEventTemplateV2(negativeCash).map(({ code }) => code)).toContain(
      "negative_effect_magnitude",
    );
  });
});

describe("declarative personal-event v2 scheduling", () => {
  it("evaluates home, employment, and required/blocked macro eligibility declaratively", () => {
    const opening = state();
    const template: PersonalEventTemplateV2 = {
      ...alwaysTemplate(),
      eligibility: [
        { type: "home_owned", expected: false },
        { type: "employment_status", statuses: ["employed"] },
        { type: "macro_regime", required: ["expansion"], blocked: ["recession"] },
      ],
    };
    expect(scheduleDeclarativePersonalEventV2(opening, [template]).event).not.toBeNull();
    const homeowner = {
      ...opening,
      finances: { ...opening.finances, homeValueCents: moneyCents(1) },
    };
    expect(scheduleDeclarativePersonalEventV2(homeowner, [template])).toMatchObject({
      event: null,
      eligibleTemplateIds: [],
    });
  });

  it("is deterministic and keeps incident sampling independent of financial vulnerability", () => {
    const vulnerable = state();
    const resilient = {
      ...vulnerable,
      finances: {
        ...vulnerable.finances,
        cashCents: moneyCents(10_000_000),
        creditUsedCents: moneyCents(0),
      },
      gameplay: {
        ...vulnerable.gameplay,
        benefits: { ...vulnerable.gameplay.benefits, insuranceCoverageIds: [] },
      },
    };
    const catalog = [alwaysTemplate()];
    const left = scheduleDeclarativePersonalEventV2(vulnerable, catalog);
    const right = scheduleDeclarativePersonalEventV2(resilient, catalog);
    expect(left).toEqual(right);
    expect(left.event?.proposal.parameters.cost_cents).toBeGreaterThanOrEqual(10_000);
    expect(left.event?.proposal.parameters.cost_cents).toBeLessThanOrEqual(20_000);
    expect(left.event?.targetedWeakness).toBe("unrelated_hazard");
  });

  it("exposes hazard candidates before parameter sampling without reading vulnerability", () => {
    const vulnerable = state();
    const resilient = {
      ...vulnerable,
      finances: {
        ...vulnerable.finances,
        cashCents: moneyCents(10_000_000),
        creditUsedCents: moneyCents(0),
      },
    };
    const catalog = [alwaysTemplate()];
    const left = generateDeclarativePersonalEventCandidatesV2(vulnerable, catalog);
    const right = generateDeclarativePersonalEventCandidatesV2(resilient, catalog);

    expect(left).toEqual(right);
    expect(left.candidates).toEqual([
      expect.objectContaining({
        template: expect.objectContaining({ id: "personal.test_setback" }),
        targetedWeakness: "unrelated_hazard",
      }),
    ]);
    expect(left.candidates[0]).not.toHaveProperty("proposal.parameters");
  });

  it("applies only explicit causal hazard modifiers", () => {
    const base = alwaysTemplate();
    const sectorTemplate: PersonalEventTemplateV2 = {
      ...base,
      hazard: {
        ...base.hazard,
        baseChancePpm: 0,
        modifiers: [{
          type: "employment_sector",
          sectorIds: ["sector.technology"],
          deltaPpm: 1_000_000,
        }],
      },
    };
    const employed = state();
    expect(scheduleDeclarativePersonalEventV2(employed, [sectorTemplate]).event).not.toBeNull();
    if (employed.gameplay.employment.status !== "employed") {
      throw new Error("native test state must be employed");
    }
    const otherSector = {
      ...employed,
      gameplay: {
        ...employed.gameplay,
        employment: { ...employed.gameplay.employment, sectorId: "sector.healthcare" },
      },
    };
    expect(scheduleDeclarativePersonalEventV2(otherSector, [sectorTemplate]).event).toBeNull();
  });

  it("applies an explicit macro-regime hazard modifier and no unrelated state", () => {
    const base = alwaysTemplate();
    const template: PersonalEventTemplateV2 = {
      ...base,
      hazard: {
        ...base.hazard,
        baseChancePpm: 0,
        modifiers: [{ type: "macro_regime", regimes: ["expansion"], deltaPpm: 1_000_000 }],
      },
    };
    const expansion = state();
    expect(scheduleDeclarativePersonalEventV2(expansion, [template]).event).not.toBeNull();
    expect(scheduleDeclarativePersonalEventV2({ ...expansion, marketRegime: "recession" }, [template]).event).toBeNull();
  });

  it("sorts equal event ids by version before consuming RNG", () => {
    const v2 = alwaysTemplate();
    const v3: PersonalEventTemplateV2 = { ...v2, version: 3 };
    expect(scheduleDeclarativePersonalEventV2(state(), [v3, v2])).toEqual(
      scheduleDeclarativePersonalEventV2(state(), [v2, v3]),
    );
  });

  it("enforces maximum occurrences from resolved authoritative history", () => {
    const opening = state();
    const template = alwaysTemplate();
    const history = ["one", "two"].map((suffix, index) => ({
      commandId: `cmd.${suffix}`,
      resultingRevision: index + 1,
      eventId: `evt.${suffix}`,
      templateId: template.id,
      templateVersion: template.version,
      tier: template.severityTier,
      targetedWeakness: "unrelated_hazard" as const,
      parameters: { cost_cents: 10_000 },
      choiceId: "pay",
      availableChoiceIds: ["pay"],
      scheduledMonth: simulationMonth("2026-01"),
      resolvedMonth: simulationMonth("2026-01"),
      playerCostCents: moneyCents(10_000),
      insurerCostCents: moneyCents(0),
    }));
    const exhausted = {
      ...opening,
      gameplay: {
        ...opening.gameplay,
        eventLifecycle: { ...opening.gameplay.eventLifecycle, history },
      },
    };
    expect(scheduleDeclarativePersonalEventV2(exhausted, [template])).toMatchObject({
      event: null,
      eligibleTemplateIds: [],
    });
  });

  it.each([
    ["event", "personal.test_setback", "maintenance", "lesson.emergency_fund"],
    ["category", "personal.prior", "maintenance", "lesson.other"],
    ["lesson", "personal.prior", "career", "lesson.emergency_fund"],
  ])("enforces %s cooldown from resolved history", (_scope, priorId, priorCategory, priorLesson) => {
    const opening = state();
    const template = alwaysTemplate();
    const prior: PersonalEventTemplateV2 = {
      ...template,
      id: priorId,
      category: priorCategory as PersonalEventTemplateV2["category"],
      lessonTags: { primary: priorLesson, secondary: [] },
    };
    const withHistory = {
      ...opening,
      gameplay: {
        ...opening.gameplay,
        eventLifecycle: {
          ...opening.gameplay.eventLifecycle,
          history: [{
            commandId: "cmd.prior",
            resultingRevision: 1,
            eventId: "evt.prior",
            templateId: prior.id,
            templateVersion: prior.version,
            tier: prior.severityTier,
            targetedWeakness: "unrelated_hazard" as const,
            parameters: { cost_cents: 10_000 },
            choiceId: "pay",
            availableChoiceIds: ["pay"],
            scheduledMonth: opening.currentMonth,
            resolvedMonth: opening.currentMonth,
            playerCostCents: moneyCents(10_000),
            insurerCostCents: moneyCents(0),
          }],
        },
      },
    };
    expect(scheduleDeclarativePersonalEventV2(withHistory, [template, prior]).eligibleTemplateIds).not.toContain(template.id);
  });
});
