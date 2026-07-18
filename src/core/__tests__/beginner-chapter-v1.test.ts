import { describe, expect, it } from "vitest";

import { simulationMonth } from "../domain/month";
import type { PreparednessAssessmentV1 } from "../preparedness-assessment-v1";
import { assessBeginnerChapterV1 } from "../beginner-chapter-v1";

function preparedness(
  scorePpm: number,
  components: Partial<PreparednessAssessmentV1["components"]> = {},
): PreparednessAssessmentV1 {
  const band = scorePpm < 250_000
    ? "critical"
    : scorePpm < 500_000
      ? "exposed"
      : scorePpm < 750_000
        ? "stable"
        : "resilient";
  return Object.freeze({
    version: "preparedness-assessment-v1",
    riskVersion: "risk-v1",
    asOfMonth: simulationMonth("2027-01"),
    scorePpm,
    band,
    components: Object.freeze({
      liquidityPpm: 500_000,
      cashFlowPpm: 500_000,
      debtPpm: 500_000,
      insurancePpm: 500_000,
      diversificationPpm: 500_000,
      ...components,
    }),
  });
}

describe("Beginner Chapter V1", () => {
  it("projects a checkpoint only at exactly 12 processed months", () => {
    const input = {
      startMonth: simulationMonth("2026-01"),
      preparedness: preparedness(350_000),
      outcome: null,
    } as const;

    expect(assessBeginnerChapterV1({
      ...input,
      currentMonth: simulationMonth("2026-01"),
    })).toBeNull();
    expect(assessBeginnerChapterV1({
      ...input,
      currentMonth: simulationMonth("2026-12"),
    })).toBeNull();
    expect(assessBeginnerChapterV1({
      ...input,
      currentMonth: simulationMonth("2027-01"),
    })).toMatchObject({
      version: "beginner-chapter-v1",
      checkpointMonth: simulationMonth("2027-01"),
      outcome: "developing",
      completed: true,
      scorePpm: 350_000,
    });
    expect(assessBeginnerChapterV1({
      ...input,
      currentMonth: simulationMonth("2027-02"),
    })).toBeNull();
  });

  it.each([
    [349_999, "fragile", false],
    [350_000, "developing", true],
    [499_999, "developing", true],
    [500_000, "strong", true],
  ] as const)(
    "grades %i PPM as %s",
    (scorePpm, outcome, completed) => {
      expect(assessBeginnerChapterV1({
        startMonth: simulationMonth("2026-01"),
        currentMonth: simulationMonth("2027-01"),
        preparedness: preparedness(scorePpm),
        outcome: null,
      })).toMatchObject({ outcome, completed, scorePpm });
    },
  );

  it("lets authoritative bankruptcy override a strong preparedness score", () => {
    expect(assessBeginnerChapterV1({
      startMonth: simulationMonth("2026-01"),
      currentMonth: simulationMonth("2027-01"),
      preparedness: preparedness(800_000),
      outcome: { kind: "bankruptcy" },
    })).toMatchObject({
      outcome: "bankrupt",
      completed: false,
      scorePpm: 800_000,
    });
  });

  it("uses deterministic weakest-component order and freezes its evidence", () => {
    const result = assessBeginnerChapterV1({
      startMonth: simulationMonth("2026-01"),
      currentMonth: simulationMonth("2027-01"),
      preparedness: preparedness(500_000, {
        liquidityPpm: 100_000,
        cashFlowPpm: 100_000,
        debtPpm: 400_000,
      }),
      outcome: null,
    });

    expect(result).toMatchObject({
      weakestComponent: "liquidity",
      lessonKey: "lesson.emergency_fund",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
