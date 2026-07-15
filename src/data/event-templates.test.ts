import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../core/domain/money";
import { applyEvent, validateEventTemplate } from "../core/events";
import { createInitialGameState } from "../core/game-state";

import { EVENT_TEMPLATES, getEventTemplate } from "./event-templates";

function homeOwnerState() {
  return createInitialGameState({
    runId: "run_catalog",
    startMonth: "2026-07",
    randomSeed: "catalog",
    player: {
      playerId: "player_catalog",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "software_engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(5_000_00),
      taxableInvestmentsCents: moneyCents(10_000_00),
      retirementCents: moneyCents(20_000_00),
      homeValueCents: moneyCents(500_000_00),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(300_000_00),
      creditLimitCents: moneyCents(20_000_00),
      creditUsedCents: moneyCents(10_000_00),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
    marketRegime: "inflation",
  });
}

describe("engine-owned event catalog", () => {
  it("contains only valid, unique, deeply frozen templates", () => {
    expect(EVENT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(EVENT_TEMPLATES.map(({ id }) => id)).size).toBe(
      EVENT_TEMPLATES.length,
    );
    for (const template of EVENT_TEMPLATES) {
      expect(validateEventTemplate(template)).toEqual([]);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.parameters)).toBe(true);
      expect(Object.isFrozen(template.choices)).toBe(true);
    }
  });

  it("covers ambient macro stories and every personal severity tier", () => {
    expect(new Set(EVENT_TEMPLATES.map(({ tier }) => tier))).toEqual(
      new Set(["ambient", "micro", "medium", "large", "catastrophe"]),
    );
    expect(EVENT_TEMPLATES.filter(({ kind }) => kind === "macro").length).toBe(5);
    expect(
      EVENT_TEMPLATES.filter(({ kind }) => kind === "personal_shock").every(
        ({ choices }) => choices.length >= 2 && choices.length <= 3,
      ),
    ).toBe(true);
  });

  it("resolves only the catalog version requested", () => {
    expect(getEventTemplate("macro.rate_hike", 1).id).toBe("macro.rate_hike");
    expect(() => getEventTemplate("macro.rate_hike", 2)).toThrow(
      expect.objectContaining({ code: "TEMPLATE_VERSION_MISMATCH" }),
    );
    expect(() => getEventTemplate("macro.invented_by_model")).toThrow(
      expect.objectContaining({ code: "UNKNOWN_TEMPLATE" }),
    );
  });

  it("applies a catastrophe using catalog math rather than proposal-authored effects", () => {
    const template = getEventTemplate("personal.property_emergency");
    const applied = applyEvent(
      homeOwnerState(),
      template,
      {
        eventId: "evt.property.1",
        templateId: template.id,
        templateVersion: template.version,
        parameters: { restoration_cost_cents: 10_000_000 },
      },
      "file_covered_claim",
    );

    expect(applied.finances.requiredObligationsCents).toBe(1_500_000);
    expect(applied.wellbeing.burnoutPpm).toBe(300_000);
  });
});
