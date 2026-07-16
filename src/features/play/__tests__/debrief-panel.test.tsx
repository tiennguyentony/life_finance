import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type { DeterministicGameOutcomeV1 } from "../../../core/game-state";
import { DebriefPanel } from "../debrief-panel";

const richOutcome: DeterministicGameOutcomeV1 = {
  outcomePolicyVersion: "1.0.0",
  kind: "retirement_age",
  grade: "B",
  reachedMonth: simulationMonth("2065-07"),
  reasonCode: "configured_retirement_age_reached",
  reasonCodes: [
    "configured_retirement_age_reached",
    "financial_independence_target_not_reached",
  ],
  financialIndependence: {
    goalSource: "current_lifestyle_default",
    investableAssetsCents: moneyCents(1_200_000),
    targetCents: moneyCents(2_000_000),
    progressPpm: ratePpm(600_000),
  },
  displayedNetWorthCents: moneyCents(1_500_000),
  automaticLiquidSolvency: {
    requiredCashCents: moneyCents(100_000),
    automaticLiquidityCents: moneyCents(250_000),
    residualShortfallCents: moneyCents(0),
    isSolvent: true,
  },
  retirementReadiness: {
    retirementAgeYears: 65,
    currentAgeYears: 65,
    reachedRetirementAge: true,
    gradeIfRetiredNow: "B",
  },
};

describe("final debrief panel", () => {
  it("renders the immutable rich outcome evidence before AI consent", () => {
    const html = renderToStaticMarkup(
      <DebriefPanel
        busy={false}
        consented={false}
        outcome={richOutcome}
        result={null}
        onConsentChange={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(html).toContain("Deterministic final result");
    expect(html).toContain("Grade B");
    expect(html).toContain("$20,000");
    expect(html).toContain("60.0%");
    expect(html).toContain("$15,000");
    expect(html).toContain("$2,500");
    expect(html).toContain("Current lifestyle default");
    expect(html).toContain("configured retirement age reached");
  });
});
