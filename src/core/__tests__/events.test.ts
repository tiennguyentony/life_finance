import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import {
  applyEvent,
  eventApplicabilityReasons,
  validateEventTemplate,
  type EventProposal,
  type EventTemplate,
} from "../events";
import { createInitialGameState, type GameState } from "../game-state";

function state(): GameState {
  return createInitialGameState({
    runId: "run_events",
    startMonth: "2026-07",
    randomSeed: "events",
    player: {
      playerId: "player_events",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "software_engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(10_000_00),
      taxableInvestmentsCents: moneyCents(20_000_00),
      retirementCents: moneyCents(30_000_00),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(10_000_00),
      creditUsedCents: moneyCents(5_000_00),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
    marketRegime: "expansion",
  });
}

function personalTemplate(): EventTemplate {
  return {
    schemaVersion: 1,
    id: "personal.medical_bill",
    version: 1,
    kind: "personal_shock",
    tier: "medium",
    teachingPrinciple: "Insurance and emergency funds turn a crisis into a manageable bill.",
    targetsWeaknesses: ["low_emergency_fund"],
    parameters: [
      {
        id: "gross_bill_cents",
        kind: "money_cents",
        minimum: 1_000_00,
        maximum: 20_000_00,
      },
    ],
    eligibility: [{ type: "maximum_emergency_fund_months", months: 3 }],
    automaticEffects: [],
    choices: [
      {
        id: "pay_uninsured",
        principle: "Without insurance, the whole bill becomes immediately payable.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: {
              source: "parameter",
              parameterId: "gross_bill_cents",
              multiplierPpm: ratePpm(1_000_000),
            },
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: { source: "fixed", value: 100_000 },
          },
        ],
      },
      {
        id: "use_insurance",
        principle: "Coverage trades premiums for a bounded emergency cost.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: {
              source: "parameter",
              parameterId: "gross_bill_cents",
              multiplierPpm: ratePpm(200_000),
            },
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: -25_000 },
          },
        ],
      },
    ],
  };
}

function macroTemplate(): EventTemplate {
  return {
    schemaVersion: 1,
    id: "macro.tech_boom",
    version: 2,
    kind: "macro",
    tier: "ambient",
    teachingPrinciple: "A hot narrative is not a diversified investment strategy.",
    targetsWeaknesses: ["market_timing", "portfolio_concentration"],
    parameters: [
      {
        id: "equity_impact_ppm",
        kind: "rate_ppm",
        minimum: 10_000,
        maximum: 80_000,
      },
    ],
    eligibility: [{ type: "market_regime", regimes: ["expansion", "recovery"] }],
    automaticEffects: [
      {
        type: "market_return_modifier",
        assetClass: "equity",
        magnitude: {
          source: "parameter",
          parameterId: "equity_impact_ppm",
          multiplierPpm: ratePpm(1_000_000),
        },
      },
      {
        type: "market_return_modifier",
        assetClass: "bonds",
        magnitude: {
          source: "parameter",
          parameterId: "equity_impact_ppm",
          multiplierPpm: ratePpm(-250_000),
        },
      },
    ],
    choices: [],
  };
}

function proposal(
  template: EventTemplate,
  parameters: Record<string, number>,
): EventProposal {
  return {
    eventId: "evt.2026-07.1",
    templateId: template.id,
    templateVersion: template.version,
    parameters,
  };
}

describe("event template validation", () => {
  it("accepts separated macro and personal-shock contracts", () => {
    expect(validateEventTemplate(personalTemplate())).toEqual([]);
    expect(validateEventTemplate(macroTemplate())).toEqual([]);
  });

  it("rejects AI-authoritative effects and broken parameter references", () => {
    const template: EventTemplate = {
      ...macroTemplate(),
      tier: "large",
      choices: personalTemplate().choices,
      automaticEffects: [
        {
          type: "required_obligation_delta",
          magnitude: {
            source: "parameter",
            parameterId: "invented_by_model",
            multiplierPpm: ratePpm(1_000_001),
          },
        },
      ],
    };

    expect(validateEventTemplate(template).map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "invalid_macro_tier",
        "macro_choices_forbidden",
        "invalid_macro_effect",
        "unknown_parameter",
        "invalid_multiplier",
      ]),
    );
  });
});

describe("event eligibility", () => {
  it("uses exact emergency-fund and credit-utilization boundaries", () => {
    const template: EventTemplate = {
      ...personalTemplate(),
      eligibility: [
        { type: "maximum_emergency_fund_months", months: 2 },
        {
          type: "minimum_credit_utilization",
          utilizationPpm: ratePpm(500_000),
        },
        { type: "career_track", careerTrackIds: ["software_engineer"] },
        { type: "location", locationIds: ["US-CA"] },
      ],
    };

    expect(eventApplicabilityReasons(template, state())).toEqual([]);
    expect(
      eventApplicabilityReasons(
        { ...template, eligibility: [{ type: "minimum_home_value", amountCents: moneyCents(1) }] },
        state(),
      ),
    ).toEqual(["minimum_home_value"]);
  });
});

describe("event application", () => {
  it("validates bounded Fed parameters and applies only the chosen engine effect", () => {
    const template = personalTemplate();
    const before = state();
    const applied = applyEvent(
      before,
      template,
      proposal(template, { gross_bill_cents: 6_000_00 }),
      "use_insurance",
    );

    expect(applied.finances.requiredObligationsCents).toBe(6_200_00);
    expect(applied.wellbeing.happinessPpm).toBe(775_000);
    expect(applied.wellbeing.burnoutPpm).toBe(200_000);
    expect(applied.event.choiceId).toBe("use_insurance");
    expect(before.finances.requiredObligationsCents).toBe(5_000_00);
    expect(Object.isFrozen(applied.event.parameters)).toBe(true);
  });

  it("turns macro news into exact modifiers without directly touching the wallet", () => {
    const template = macroTemplate();
    const before = state();
    const applied = applyEvent(
      before,
      template,
      proposal(template, { equity_impact_ppm: 55_555 }),
    );

    expect(applied.marketReturnModifiers).toEqual({
      equity: 55_555,
      bonds: -13_889,
      cash: 0,
      housing: 0,
    });
    expect(applied.finances).toEqual(before.finances);
    expect(applied.event.choiceId).toBeNull();
  });

  it.each([
    [{ gross_bill_cents: 999_99 }, "INVALID_PROPOSAL"],
    [{ gross_bill_cents: 6_000_00, model_amount: 1 }, "INVALID_PROPOSAL"],
  ])("rejects out-of-contract proposal parameters", (parameters, code) => {
    const template = personalTemplate();
    expect(() =>
      applyEvent(state(), template, proposal(template, parameters), "pay_uninsured"),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("requires a declared choice and rejects inapplicable events atomically", () => {
    const template = personalTemplate();
    const input = proposal(template, { gross_bill_cents: 6_000_00 });
    const before = state();

    expect(() => applyEvent(before, template, input, "invented_choice")).toThrow(
      expect.objectContaining({ code: "INVALID_CHOICE" }),
    );
    expect(() =>
      applyEvent(
        before,
        {
          ...template,
          eligibility: [{ type: "minimum_home_value", amountCents: moneyCents(1) }],
        },
        input,
        "pay_uninsured",
      ),
    ).toThrow(expect.objectContaining({ code: "EVENT_NOT_APPLICABLE" }));
    expect(before.finances.requiredObligationsCents).toBe(5_000_00);
  });
});
