import { describe, expect, it } from "vitest";

import {
  EDUCATION_CONCEPTS,
  EDUCATION_CONTENT_VERSION,
  getEducationConcept,
} from "../education-content";

describe("versioned educational content", () => {
  it("provides unique, complete concepts for the core learning loop", () => {
    const ids = EDUCATION_CONCEPTS.map(({ id }) => id);

    expect(EDUCATION_CONTENT_VERSION).toBe("education.en-US.2026.1");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "financial_independence",
        "401k",
        "hsa",
        "tax_estimate",
        "exposure",
        "compounding",
      ]),
    );
    for (const concept of EDUCATION_CONCEPTS) {
      expect(concept.title.length).toBeGreaterThan(0);
      expect(concept.shortDefinition.length).toBeGreaterThan(40);
      expect(concept.whyItMatters.length).toBeGreaterThan(40);
      expect(concept.decisionTradeoff.length).toBeGreaterThan(40);
      expect(Object.isFrozen(concept)).toBe(true);
    }
  });

  it("looks up known concepts without inventing unknown content", () => {
    expect(getEducationConcept("401k")?.title).toBe("401(k)");
    expect(getEducationConcept("not-a-concept")).toBeUndefined();
  });
});

