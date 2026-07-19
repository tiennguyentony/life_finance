import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  SCENARIO_DIRECTOR_POLICY_V1,
  validateScenarioDirectorPolicyV2,
  type ScenarioDirectorPolicyV2,
} from "../scenario-director-policy-v2";
import {
  applyScenarioDirectorRankingOverrideV2,
  ScenarioDirectorInputErrorV2,
  rankScenarioCandidatesV2,
  validateScenarioDirectorPermutationV2,
  type ScenarioDirectorCandidateV2,
  type ScenarioDirectorInputV2,
} from "../scenario-director-v2";
import { analyzeRiskV1 } from "../risk-v1";

function state(cashCents = 2_500_000): GameStateV2 {
  const resolved = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.scenario-director-v2",
    playerId: "player.scenario-director-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "scenario-director-v2",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(cashCents),
      taxableBroadIndexCents: moneyCents(2_000_000),
      taxableSectorCents: moneyCents(500_000),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(3_000_000),
      retirementIraCents: moneyCents(500_000),
      hsaCents: moneyCents(100_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

const candidate = (
  templateId: string,
  overrides: Partial<ScenarioDirectorCandidateV2> = {},
): ScenarioDirectorCandidateV2 => ({
  templateId,
  templateVersion: 1,
  category: "maintenance",
  tier: "medium",
  targetedWeakness: "unrelated_hazard",
  lessonTags: { primary: "lesson.shared", secondary: [] },
  directorTags: [],
  ...overrides,
});

function input(
  candidates: readonly ScenarioDirectorCandidateV2[],
  overrides: Partial<ScenarioDirectorInputV2> = {},
): ScenarioDirectorInputV2 {
  const riskSnapshot = analyzeRiskV1(state());
  return {
    version: "scenario-director-v2",
    month: riskSnapshot.asOfMonth,
    riskSnapshot,
    macro: { regime: "recovery", tags: [] },
    candidates,
    recentDecisions: [],
    recentEvents: [],
    lessonExposureCounts: [],
    difficulty: "normal",
    ...overrides,
  };
}

describe("Scenario Director persisted AI ranking", () => {
  it("allows only an exact reordered permutation and preserves policy facts", () => {
    const request = input([candidate("event.alpha"), candidate("event.beta")]);
    const fallback = rankScenarioCandidatesV2(request);
    const decision = applyScenarioDirectorRankingOverrideV2(request, {
      version: "scenario-director-ranking-override-v1",
      candidateSetChecksum: fallback.candidateSetChecksum,
      rankingInputChecksum: fallback.rankingInputChecksum,
      ranked: [...fallback.ranked]
        .reverse()
        .map(({ templateId, templateVersion }) => ({ templateId, templateVersion })),
    });

    expect(decision.rankingSource).toBe("validated_ai_ranking");
    expect(decision.ranked.map(({ templateId }) => templateId)).toEqual(
      [...fallback.ranked].reverse().map(({ templateId }) => templateId),
    );
    expect(decision.ranked[0]?.intendedLesson).toBe("lesson.shared");
  });

  it("rejects stale checksums and incomplete rankings", () => {
    const request = input([candidate("event.alpha"), candidate("event.beta")]);
    const fallback = rankScenarioCandidatesV2(request);
    expect(() => applyScenarioDirectorRankingOverrideV2(request, {
      version: "scenario-director-ranking-override-v1",
      candidateSetChecksum: "0".repeat(64),
      rankingInputChecksum: fallback.rankingInputChecksum,
      ranked: fallback.ranked,
    })).toThrow("checksums");
    expect(() => applyScenarioDirectorRankingOverrideV2(request, {
      version: "scenario-director-ranking-override-v1",
      candidateSetChecksum: fallback.candidateSetChecksum,
      rankingInputChecksum: fallback.rankingInputChecksum,
      ranked: fallback.ranked.slice(0, 1),
    })).toThrow("exact candidate permutation");
  });
});

describe("Scenario Director policy v2", () => {
  it("is frozen, complete, and valid for startup use", () => {
    expect(Object.isFrozen(SCENARIO_DIRECTOR_POLICY_V1)).toBe(true);
    expect(validateScenarioDirectorPolicyV2(SCENARIO_DIRECTOR_POLICY_V1)).toEqual([]);
    expect(Object.keys(SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings)).toHaveLength(14);
  });

  it("rejects invalid weights, limits, mappings, affinities, and difficulty tuning", () => {
    const invalid = {
      ...SCENARIO_DIRECTOR_POLICY_V1,
      maximumCandidates: 0,
      severityStepPpm: 0,
      weights: {
        ...SCENARIO_DIRECTOR_POLICY_V1.weights,
        weaknessSeverityStep: -1,
      },
      riskMetricMappings: {
        ...SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings,
        emergency_fund_months: undefined,
      },
      macroCategoryAffinity: {
        ...SCENARIO_DIRECTOR_POLICY_V1.macroCategoryAffinity,
        recovery: {},
      },
      difficultyTierAffinity: {
        ...SCENARIO_DIRECTOR_POLICY_V1.difficultyTierAffinity,
        normal: {},
      },
    } as unknown as ScenarioDirectorPolicyV2;

    expect(
      validateScenarioDirectorPolicyV2(invalid).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "invalid_limit",
        "invalid_severity_step",
        "invalid_weight",
        "incomplete_risk_mapping",
        "incomplete_macro_affinity",
        "incomplete_difficulty_affinity",
      ]),
    );
  });
});

describe("deterministic Scenario Director v2", () => {
  it("returns an immutable exact permutation with stable identity tie-breaking", () => {
    const candidates = [candidate("event.z"), candidate("event.a"), candidate("event.m", { templateVersion: 2 })];
    const request = input(candidates);
    const before = JSON.stringify(request);

    const first = rankScenarioCandidatesV2(request);
    const second = rankScenarioCandidatesV2(request);

    expect(first).toEqual(second);
    expect(first.ranked.map(({ templateId, templateVersion }) => `${templateId}@${templateVersion}`)).toEqual([
      "event.a@1",
      "event.m@2",
      "event.z@1",
    ]);
    expect(first.ranked.map(({ rank }) => rank)).toEqual([1, 2, 3]);
    expect(new Set(first.ranked.map(({ templateId }) => templateId))).toEqual(
      new Set(candidates.map(({ templateId }) => templateId)),
    );
    expect(first.candidateSetChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rankingInputChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toMatchObject({
      difficulty: "normal",
      macroRegime: "recovery",
    });
    expect(first).not.toHaveProperty("storyArcId");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.ranked)).toBe(true);
    expect(Object.isFrozen(first.ranked[0]?.scoreComponents)).toBe(true);
    expect(JSON.stringify(request)).toBe(before);
  });

  it("returns an explicit empty ranking for an empty candidate set", () => {
    expect(rankScenarioCandidatesV2(input([])).ranked).toEqual([]);
  });

  it("uses verified Risk v1 severity for rank only and never exposes raw money", () => {
    const candidates = [
      candidate("event.unrelated"),
      candidate("event.cash-buffer", { targetedWeakness: "low_emergency_fund" }),
    ];
    const request = input(candidates, { riskSnapshot: analyzeRiskV1(state(100_000)) });
    const result = rankScenarioCandidatesV2({
      ...request,
      month: request.riskSnapshot.asOfMonth,
    });

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.cash-buffer",
      reasonCodes: expect.arrayContaining(["weakness_relevance"]),
      scoreComponents: { weaknessRelevance: expect.any(Number) },
    });
    expect(result.ranked.map(({ templateId }) => templateId).sort()).toEqual(
      candidates.map(({ templateId }) => templateId).sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("rawValue");
    expect(serialized).not.toContain("cashCents");
    expect(serialized).not.toContain("2500000");
  });

  it("ranks macro-coherent candidates ahead without changing membership", () => {
    const result = rankScenarioCandidatesV2(
      input(
        [
          candidate("event.career", { category: "career" }),
          candidate("event.opportunity", { category: "opportunity" }),
        ],
        { macro: { regime: "recession", tags: ["macro.contraction"] } },
      ),
    );

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.career",
      reasonCodes: expect.arrayContaining(["macro_coherence"]),
    });
  });

  it("applies novelty bonuses and repetition penalties from bounded structured history", () => {
    const repeated = candidate("event.repeated", { category: "health", targetedWeakness: "uninsured_property" });
    const novel = candidate("event.novel", {
      category: "social",
      targetedWeakness: "uninsured_property",
    });
    const result = rankScenarioCandidatesV2(
      input([repeated, novel], {
        recentEvents: [
          {
            templateId: repeated.templateId,
            templateVersion: repeated.templateVersion,
            category: repeated.category,
            tier: repeated.tier,
            targetedWeakness: repeated.targetedWeakness,
            lessonTags: [repeated.lessonTags.primary],
            month: simulationMonth("2026-06"),
          },
        ],
      }),
    );

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.novel",
      reasonCodes: expect.arrayContaining(["novel_template", "novel_category"]),
    });
    expect(result.ranked.find(({ templateId }) => templateId === "event.repeated")).toMatchObject({
      reasonCodes: expect.arrayContaining([
        "recent_template_repetition",
        "recent_category_repetition",
      ]),
      scoreComponents: { repetitionPenalty: expect.any(Number) },
    });
  });

  it("prefers underrepresented lessons", () => {
    const result = rankScenarioCandidatesV2(
      input(
        [
          candidate("event.overexposed", { lessonTags: { primary: "lesson.debt", secondary: [] } }),
          candidate("event.underexposed", { lessonTags: { primary: "lesson.liquidity", secondary: [] } }),
        ],
        {
          lessonExposureCounts: [
            { lessonTag: "lesson.debt", count: 10 },
            { lessonTag: "lesson.liquidity", count: 0 },
          ],
        },
      ),
    );

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.underexposed",
      intendedLesson: "lesson.liquidity",
      reasonCodes: expect.arrayContaining(["underrepresented_lesson"]),
    });
  });

  it("scores lesson coverage against the same primary lesson it intends", () => {
    const result = rankScenarioCandidatesV2(
      input(
        [
          candidate("event.primary-overexposed", {
            lessonTags: {
              primary: "lesson.debt",
              secondary: ["lesson.unseen-secondary"],
            },
          }),
          candidate("event.primary-underrepresented", {
            lessonTags: {
              primary: "lesson.liquidity",
              secondary: [],
            },
          }),
        ],
        {
          lessonExposureCounts: [
            { lessonTag: "lesson.debt", count: 10 },
            { lessonTag: "lesson.unseen-secondary", count: 0 },
            { lessonTag: "lesson.liquidity", count: 0 },
          ],
        },
      ),
    );

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.primary-underrepresented",
      intendedLesson: "lesson.liquidity",
      scoreComponents: { lessonCoverage: expect.any(Number) },
    });
    expect(
      result.ranked.find(
        ({ templateId }) => templateId === "event.primary-overexposed",
      )?.scoreComponents.lessonCoverage,
    ).toBe(0);
  });

  it("uses recent decision, difficulty, and story tags only as bounded ranking factors", () => {
    const aligned = candidate("event.aligned", {
      tier: "micro",
      directorTags: ["decision.protection", "story.recovery"],
    });
    const result = rankScenarioCandidatesV2(
      input([candidate("event.other", { tier: "catastrophe" }), aligned], {
        difficulty: "guided",
        recentDecisions: [
          {
            decisionId: "decision.insurance",
            month: simulationMonth("2026-06"),
            reasonCode: "insurance_selection_changed",
            semanticTags: ["decision.protection"],
          },
        ],
        storyArc: { arcId: "arc.recovery", tags: ["story.recovery"] },
      }),
    );

    expect(result.ranked[0]).toMatchObject({
      templateId: "event.aligned",
      reasonCodes: expect.arrayContaining([
        "recent_decision_relevance",
        "difficulty_fit",
        "narrative_continuity",
      ]),
    });
    expect(result).toMatchObject({
      difficulty: "guided",
      macroRegime: "recovery",
      storyArcId: "arc.recovery",
    });
  });

  it("checksums every structured ranking input and the effective policy", () => {
    const candidates = [candidate("event.a"), candidate("event.b")];
    const base = input(candidates);
    const changedRisk: ScenarioDirectorInputV2 = {
      ...base,
      riskSnapshot: {
        ...base.riskSnapshot,
        metrics: {
          ...base.riskSnapshot.metrics,
          emergency_fund_months: {
            ...base.riskSnapshot.metrics.emergency_fund_months,
            severityPpm: ratePpm(123_456),
          },
        },
      },
    };
    const variants: readonly ScenarioDirectorInputV2[] = [
      base,
      { ...base, difficulty: "hard" },
      { ...base, macro: { regime: "recession", tags: ["macro.contraction"] } },
      changedRisk,
      {
        ...base,
        recentDecisions: [
          {
            decisionId: "decision.changed",
            month: simulationMonth("2026-06"),
            reasonCode: "strategy_changed",
            semanticTags: ["lesson.liquidity"],
          },
        ],
      },
      {
        ...base,
        recentEvents: [
          {
            templateId: "event.previous",
            templateVersion: 1,
            category: "health",
            tier: "medium",
            targetedWeakness: "unrelated_hazard",
            lessonTags: ["lesson.health"],
            month: simulationMonth("2026-06"),
          },
        ],
      },
      {
        ...base,
        lessonExposureCounts: [{ lessonTag: "lesson.shared", count: 2 }],
      },
      {
        ...base,
        storyArc: { arcId: "arc.recovery", tags: ["lesson.liquidity"] },
      },
    ];
    const checksums = variants.map(
      (request) => rankScenarioCandidatesV2(request).rankingInputChecksum,
    );
    expect(new Set(checksums)).toHaveLength(variants.length);

    const changedPolicy: ScenarioDirectorPolicyV2 = {
      ...SCENARIO_DIRECTOR_POLICY_V1,
      weights: {
        ...SCENARIO_DIRECTOR_POLICY_V1.weights,
        novelTemplate: SCENARIO_DIRECTOR_POLICY_V1.weights.novelTemplate + 1,
      },
    };
    expect(
      rankScenarioCandidatesV2(base, changedPolicy).rankingInputChecksum,
    ).not.toBe(checksums[0]);
  });

  it("keeps output rank-only and permits only a bounded non-financial setup", () => {
    const result = rankScenarioCandidatesV2(
      input([
        candidate("event.safe", {
          narrativeSetupId: "setup.routine_warning",
        }),
      ]),
    );
    const serialized = JSON.stringify(result);

    expect(result.ranked[0]?.narrativeSetupId).toBe("setup.routine_warning");
    for (const forbidden of [
      "parameters",
      "amount",
      "dollar",
      "approved",
      "effect",
      "mutation",
      "random",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(`\"${forbidden}`);
    }
  });

  it.each(["setup.invented", "A routine warning", "setup/unsafe"])(
    "rejects a narrative setup outside the identifier allow-list: %s",
    (narrativeSetupId) => {
    expect(() =>
      rankScenarioCandidatesV2(
          input([
            candidate("event.unsafe", {
              narrativeSetupId,
            } as Partial<ScenarioDirectorCandidateV2>),
          ]),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "unsafe_narrative_setup",
      }),
    );
    },
  );

  it("rejects the legacy caller-provided narrative prose field", () => {
    const legacy = {
      ...candidate("event.legacy-prose"),
      narrativeSetup: "A caller-provided sentence must not cross this boundary.",
    } as unknown as ScenarioDirectorCandidateV2;

    expect(() => rankScenarioCandidatesV2(input([legacy]))).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "unsafe_narrative_setup",
      }),
    );
  });

  it("rejects duplicate candidates and a stale risk snapshot with structured codes", () => {
    const duplicate = candidate("event.same");
    expect(() => rankScenarioCandidatesV2(input([duplicate, duplicate]))).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "duplicate_candidate",
      }),
    );

    expect(() =>
      rankScenarioCandidatesV2(
        input([candidate("event.valid")], { month: simulationMonth("2026-08") }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "risk_snapshot_month_mismatch",
      }),
    );
  });

  it("turns malformed nested candidate metadata into a structured rejection", () => {
    const malformed = {
      ...candidate("event.malformed"),
      lessonTags: undefined,
    } as unknown as ScenarioDirectorCandidateV2;

    expect(() => rankScenarioCandidatesV2(input([malformed]))).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "invalid_candidate_metadata",
      }),
    );
  });

  it.each([
    ["null top level", () => null],
    ["missing candidate array", (valid: ScenarioDirectorInputV2) => ({ ...valid, candidates: null })],
    ["missing macro object", (valid: ScenarioDirectorInputV2) => ({ ...valid, macro: null })],
    ["missing risk metrics", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      riskSnapshot: { ...valid.riskSnapshot, metrics: null },
    })],
    ["null candidate", (valid: ScenarioDirectorInputV2) => ({ ...valid, candidates: [null] })],
    ["numeric candidate identifier", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      candidates: [{ ...valid.candidates[0], templateId: 123 }],
    })],
    ["null recent decision", (valid: ScenarioDirectorInputV2) => ({ ...valid, recentDecisions: [null] })],
    ["numeric decision identifier", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      recentDecisions: [{
        decisionId: 123,
        month: simulationMonth("2026-06"),
        reasonCode: "decision.changed",
        semanticTags: [],
      }],
    })],
    ["null recent event", (valid: ScenarioDirectorInputV2) => ({ ...valid, recentEvents: [null] })],
    ["numeric recent event identifier", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      recentEvents: [{
        templateId: 123,
        templateVersion: 1,
        category: "health",
        tier: "medium",
        targetedWeakness: "unrelated_hazard",
        lessonTags: [],
        month: simulationMonth("2026-06"),
      }],
    })],
    ["null lesson exposure", (valid: ScenarioDirectorInputV2) => ({ ...valid, lessonExposureCounts: [null] })],
    ["numeric lesson identifier", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      lessonExposureCounts: [{ lessonTag: 123, count: 1 }],
    })],
    ["null story arc", (valid: ScenarioDirectorInputV2) => ({ ...valid, storyArc: null })],
    ["numeric story arc identifier", (valid: ScenarioDirectorInputV2) => ({
      ...valid,
      storyArc: { arcId: 123, tags: [] },
    })],
  ])("turns malformed JSON into a structured input error: %s", (_label, mutate) => {
    const valid = input([candidate("event.valid")]);
    const malformed = mutate(valid) as unknown as ScenarioDirectorInputV2;

    expect(() => rankScenarioCandidatesV2(malformed)).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        name: "ScenarioDirectorInputErrorV2",
      }),
    );
  });

  it.each([
    [
      "non-canonical decision month",
      (valid: ScenarioDirectorInputV2) => ({
        ...valid,
        recentDecisions: [
          {
            decisionId: "decision.invalid-month",
            month: "2026-7",
            reasonCode: "decision.changed",
            semanticTags: [],
          },
        ],
      }),
    ],
    [
      "future decision month",
      (valid: ScenarioDirectorInputV2) => ({
        ...valid,
        recentDecisions: [
          {
            decisionId: "decision.future",
            month: simulationMonth("2026-08"),
            reasonCode: "decision.changed",
            semanticTags: [],
          },
        ],
      }),
    ],
    [
      "out-of-order decisions",
      (valid: ScenarioDirectorInputV2) => ({
        ...valid,
        recentDecisions: [
          {
            decisionId: "decision.later",
            month: simulationMonth("2026-06"),
            reasonCode: "decision.changed",
            semanticTags: [],
          },
          {
            decisionId: "decision.earlier",
            month: simulationMonth("2026-05"),
            reasonCode: "decision.changed",
            semanticTags: [],
          },
        ],
      }),
    ],
    [
      "future event month",
      (valid: ScenarioDirectorInputV2) => ({
        ...valid,
        recentEvents: [
          {
            templateId: "event.future",
            templateVersion: 1,
            category: "health",
            tier: "medium",
            targetedWeakness: "unrelated_hazard",
            lessonTags: ["lesson.health"],
            month: simulationMonth("2026-08"),
          },
        ],
      }),
    ],
    [
      "out-of-order events",
      (valid: ScenarioDirectorInputV2) => ({
        ...valid,
        recentEvents: [
          {
            templateId: "event.later",
            templateVersion: 1,
            category: "health",
            tier: "medium",
            targetedWeakness: "unrelated_hazard",
            lessonTags: ["lesson.health"],
            month: simulationMonth("2026-06"),
          },
          {
            templateId: "event.earlier",
            templateVersion: 1,
            category: "health",
            tier: "medium",
            targetedWeakness: "unrelated_hazard",
            lessonTags: ["lesson.health"],
            month: simulationMonth("2026-05"),
          },
        ],
      }),
    ],
  ])("rejects invalid bounded history ordering: %s", (_label, mutate) => {
    const malformed = mutate(
      input([candidate("event.valid")]),
    ) as unknown as ScenarioDirectorInputV2;

    expect(() => rankScenarioCandidatesV2(malformed)).toThrowError(
      expect.objectContaining<Partial<ScenarioDirectorInputErrorV2>>({
        code: "invalid_structured_context",
      }),
    );
  });

  it("reports unknown, duplicate, and missing identities in external permutations", () => {
    const candidates = [candidate("event.a"), candidate("event.b")];
    expect(
      validateScenarioDirectorPermutationV2(candidates, [
        { templateId: "event.a", templateVersion: 1 },
        { templateId: "event.a", templateVersion: 1 },
        { templateId: "event.unknown", templateVersion: 1 },
      ]).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "duplicate_ranked_candidate",
        "unknown_ranked_candidate",
        "missing_ranked_candidate",
      ]),
    );
  });
});
