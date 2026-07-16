import { describe, expect, it } from "vitest";

import {
  AI_ROLE_MODELS,
  explanationRequestSchema,
  explanationResponseSchema,
  hostileFedRequestSchema,
  hostileFedResponseSchema,
  onboardingResponseSchema,
  scenarioDirectorRequestSchema,
  scenarioDirectorResponseSchema,
  teacherResponseSchema,
} from "../contracts";
import { AI_PRIVACY_NOTICE, AI_PRIVACY_NOTICE_VERSION } from "../privacy-notice";

describe("AI role contracts", () => {
  it("locks expensive and balanced GPT-5.6 models to their intended roles", () => {
    expect(AI_ROLE_MODELS).toEqual({
      hostile_fed: "gpt-5.6-sol",
      scenario_director: "gpt-5.6-sol",
      teacher: "gpt-5.6-sol",
      onboarding: "gpt-5.6-terra",
      explanation: "gpt-5.6-terra",
    });
  });

  it("limits Scenario Director to rank-only metadata", () => {
    const director = {
      version: "scenario-director-ai-request-v1",
      candidateSetChecksum: "a".repeat(64),
      difficulty: "normal",
      macro: { regime: "recession", tags: ["macro.recession"] },
      riskFacts: [
        { metricId: "emergency_fund_months", severityBand: "high" },
      ],
      candidates: [
        {
          templateId: "personal.medical_bill",
          templateVersion: 2,
          category: "health",
          tier: "medium",
          targetedWeakness: "low_emergency_fund",
          lessonTags: {
            primary: "lesson.insurance",
            secondary: ["lesson.emergency_fund"],
          },
          directorTags: ["director.category.health"],
          intendedLesson: "lesson.insurance",
          reasonCodes: ["weakness_relevance"],
        },
      ],
      recentDecisions: [],
      recentEvents: [],
      lessonHistory: [],
    } as const;
    const request = scenarioDirectorRequestSchema.parse({
      contractVersion: 2,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "scenario_director",
      director,
    });
    expect(request.director.candidates[0]?.templateId).toBe(
      "personal.medical_bill",
    );
    expect(() =>
      scenarioDirectorRequestSchema.parse({
        contractVersion: 2,
        privacyNoticeVersion: 2,
        dataUseAccepted: true,
        role: "scenario_director",
        director: {
          ...director,
          candidates: [{ ...director.candidates[0], amountCents: 500_000 }],
        },
      }),
    ).toThrow();
    expect(() =>
      scenarioDirectorResponseSchema.parse({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: "a".repeat(64),
        ranked: [{
          templateId: "personal.medical_bill",
          templateVersion: 2,
          intendedLesson: "lesson.insurance",
          reasonCodes: ["weakness_relevance"],
          approved: true,
        }],
      }),
    ).toThrow();
  });

  it("accepts only bounded engine-owned Hostile Fed candidates", () => {
    const request = hostileFedRequestSchema.parse({
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "hostile_fed",
      simulationMonth: "2026-07",
      marketRegime: "recession",
      weaknesses: [
        {
          id: "low_emergency_fund",
          severityPpm: 900_000,
          evidence: [{ id: "cash_months", label: "Cash buffer", value: "0.8 months" }],
        },
      ],
      candidates: [
        {
          templateId: "personal.industry_layoff",
          templateVersion: 1,
          tier: "large",
          teachingPrinciple: "Liquidity matters when earned income disappears.",
          targetsWeaknesses: ["low_emergency_fund"],
          parameters: [{ id: "income_gap_cents", minimum: 300_000, maximum: 2_500_000 }],
        },
      ],
    });

    expect(request.candidates[0]?.templateId).toBe("personal.industry_layoff");
    expect(() =>
      hostileFedRequestSchema.parse({
        ...request,
        candidates: [{ ...request.candidates[0], arbitraryEffectCents: 9_999_999 }],
      }),
    ).toThrow();
  });

  it("requires affirmative acceptance of the published privacy notice", () => {
    expect(AI_PRIVACY_NOTICE.version).toBe(AI_PRIVACY_NOTICE_VERSION);
    expect(AI_PRIVACY_NOTICE.disclosures.join(" ")).toContain("retained indefinitely");
    const valid = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "explanation",
      conceptId: "emergency_fund",
      audienceLevel: "beginner",
      whyNow: "A repair is due.",
      evidence: [],
    };
    expect(explanationRequestSchema.parse(valid).dataUseAccepted).toBe(true);
    expect(() =>
      explanationRequestSchema.parse({
        contractVersion: 1,
        privacyNoticeVersion: 2,
        role: "explanation",
        conceptId: "emergency_fund",
        audienceLevel: "beginner",
        whyNow: "A repair is due.",
        evidence: [],
      }),
    ).toThrow();
  });

  it("rejects invented Hostile Fed fields and unsafe parameter numbers", () => {
    const valid = {
      templateId: "personal.industry_layoff",
      templateVersion: 1,
      targetedWeaknessId: "low_emergency_fund",
      parameters: [{ id: "income_gap_cents", value: 500_000 }],
      headline: "The paycheck stops before the bills do",
      narrative: "Your industry contracts while fixed costs remain due.",
      rationale: "This tests the thin cash buffer.",
      citedEvidenceIds: ["cash_months"],
    };
    expect(hostileFedResponseSchema.parse(valid)).toEqual(valid);
    expect(() => hostileFedResponseSchema.parse({ ...valid, mutateCashCents: 0 })).toThrow();
    expect(() =>
      hostileFedResponseSchema.parse({
        ...valid,
        parameters: [
          { id: "income_gap_cents", value: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).toThrow();
  });

  it("requires teacher conclusions to cite engine-provided evidence", () => {
    expect(() =>
      teacherResponseSchema.parse({
        grade: "B",
        title: "A resilient run with one costly gap",
        summary: "You built assets but carried too little cash into a downturn.",
        decisiveMoments: [
          {
            decisionId: "decision.12",
            lesson: "The investment increased expected growth but reduced resilience.",
            citedEvidenceIds: [],
          },
        ],
        nextSteps: ["Build a three-month cash buffer."],
      }),
    ).toThrow();
  });

  it("keeps onboarding amounts as source strings instead of model-computed money", () => {
    const result = onboardingResponseSchema.parse({
      birthMonth: "1990-04",
      locationId: "us-ca",
      careerTrackId: "software",
      filingStatus: "single",
      statedAmounts: [
        { field: "cash", valueAsStated: "$12,500", sourceExcerpt: "I have $12,500 in cash" },
      ],
      missingFields: ["annual_living_cost"],
      clarificationQuestion: "About how much do you spend in a year?",
    });
    expect(result.statedAmounts[0]?.valueAsStated).toBe("$12,500");
  });

  it("bounds explanation length and action count", () => {
    expect(() =>
      explanationResponseSchema.parse({
        title: "Emergency funds",
        explanation: "Cash absorbs shocks without forcing an investment sale.",
        whyItMattersNow: "Your current buffer is below one month.",
        actionTips: ["One", "Two", "Three", "Four"],
        citedEvidenceIds: ["cash_months"],
      }),
    ).toThrow();
  });
});
