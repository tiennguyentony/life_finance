import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getEducationConcept } from "../../data/education-content";
import { TeachingMomentPanelV2 } from "../../features/play/teaching-moment-panel-v2";
import type { TeachingMomentResponseV2 } from "../../server/teaching/service-v2";
import { simulationMonth } from "../domain/month";
import { createTeachingFactPacketV2 } from "../teaching-facts-v2";
import { buildTeachingMomentV2 } from "../teaching-presentation-v2";

const triggerFacts = createTeachingFactPacketV2({
  asOfRevision: 3,
  asOfMonth: simulationMonth("2029-03"),
  facts: [
    {
      factId: "risk.emergency_fund_months",
      labelId: "emergency_fund_months",
      value: { kind: "months_ppm", value: 2_000_000 },
      source: {
        kind: "risk_snapshot",
        sourceId: "risk:2029-03:risk-v1.emergency_fund_months",
        supportingSourceIds: ["risk:2029-03:risk-v1.emergency_fund_months"],
        field: "metrics.emergency_fund_months.rawValue",
        revision: 3,
        month: simulationMonth("2029-03"),
      },
    },
  ],
});

describe("Teaching v2 just-in-time moment", () => {
  it("shows an automatic glossary concept once while requested help can repeat it", () => {
    const concept = getEducationConcept("emergency_fund");
    expect(concept).toBeDefined();

    const automatic = buildTeachingMomentV2({
      concept: concept!,
      trigger: "automatic",
      previouslyPresentedConceptIds: [],
      facts: triggerFacts,
      triggerFactIds: ["risk.emergency_fund_months"],
    });

    expect(automatic).toMatchObject({
      version: "teaching-moment-v2",
      conceptId: "emergency_fund",
      reasonCode: "first_verified_relevance",
      factIds: ["risk.emergency_fund_months"],
    });
    expect(automatic?.paragraphs).toHaveLength(2);
    expect(Object.isFrozen(automatic)).toBe(true);

    expect(
      buildTeachingMomentV2({
        concept: concept!,
        trigger: "automatic",
        previouslyPresentedConceptIds: ["emergency_fund"],
        facts: triggerFacts,
        triggerFactIds: ["risk.emergency_fund_months"],
      }),
    ).toBeNull();

    expect(
      buildTeachingMomentV2({
        concept: concept!,
        trigger: "requested_help",
        previouslyPresentedConceptIds: ["emergency_fund"],
        facts: triggerFacts,
        triggerFactIds: ["risk.emergency_fund_months"],
      }),
    ).toMatchObject({ reasonCode: "player_requested_help" });
  });

  it("renders owner-typed months facts as human months rather than raw ppm", () => {
    const concept = getEducationConcept("emergency_fund")!;
    const facts = createTeachingFactPacketV2({
      asOfRevision: 3,
      asOfMonth: simulationMonth("2029-03"),
      facts: [{
        ...triggerFacts.facts[0]!,
        value: { kind: "months_ppm", value: 3_000_000 },
      }],
    });
    const moment = buildTeachingMomentV2({
      concept,
      trigger: "automatic",
      previouslyPresentedConceptIds: [],
      facts,
      triggerFactIds: ["risk.emergency_fund_months"],
    });
    const html = renderToStaticMarkup(createElement(TeachingMomentPanelV2, {
      response: {
        source: "deterministic_template",
        moment,
        facts,
      } as unknown as TeachingMomentResponseV2,
      busy: false,
      onRequestHelp: () => undefined,
      rewrite: null,
    }));

    expect(html).toContain("3.0 months");
    expect(html).not.toContain(">3000000<");
  });
});
