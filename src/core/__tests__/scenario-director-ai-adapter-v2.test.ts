import { describe, expect, it, vi } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { analyzeRiskV1 } from "../risk-v1";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  rankScenarioCandidatesWithOptionalAiV2,
  type ScenarioDirectorAiRequestV2,
  type ScenarioDirectorAiProviderV2,
} from "../scenario-director-ai-adapter-v2";
import {
  rankScenarioCandidatesV2,
  type ScenarioDirectorCandidateV2,
  type ScenarioDirectorInputV2,
} from "../scenario-director-v2";

function input(): ScenarioDirectorInputV2 {
  const resolved = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: [],
    scenarioId: "scenario.fresh_start",
  });
  const state = createNativeGameStateV2({
    runId: "run.private",
    playerId: "player.private",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "scenario-director-ai-adapter-v2",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(100_000),
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
  const riskSnapshot = analyzeRiskV1(state);
  const candidates: readonly ScenarioDirectorCandidateV2[] = [
    {
      templateId: "event.buffer",
      templateVersion: 1,
      category: "maintenance",
      tier: "medium",
      targetedWeakness: "low_emergency_fund",
      lessonTags: { primary: "lesson.liquidity", secondary: [] },
      directorTags: ["decision.protection"],
      narrativeSetupId: "setup.routine_warning",
    },
    {
      templateId: "event.career",
      templateVersion: 2,
      category: "career",
      tier: "micro",
      targetedWeakness: "unrelated_hazard",
      lessonTags: { primary: "lesson.income", secondary: [] },
      directorTags: ["macro.recovery"],
    },
  ];
  return {
    version: "scenario-director-v2",
    month: riskSnapshot.asOfMonth,
    riskSnapshot,
    macro: { regime: "recovery", tags: ["macro.recovery"] },
    candidates,
    recentDecisions: [
      {
        decisionId: "decision.private",
        month: simulationMonth("2026-06"),
        reasonCode: "insurance_selection_changed",
        semanticTags: ["decision.protection"],
      },
    ],
    recentEvents: [],
    lessonExposureCounts: [{ lessonTag: "lesson.income", count: 2 }],
    difficulty: "normal",
    storyArc: { arcId: "arc.recovery", tags: ["macro.recovery"] },
  };
}

describe("optional Scenario Director AI adapter v2", () => {
  it("accepts only a validated permutation and preserves deterministic facts", async () => {
    const request = input();
    const fallback = rankScenarioCandidatesV2(request);
    const provider: ScenarioDirectorAiProviderV2 = vi.fn(async (packet) => ({
      version: "scenario-director-ai-response-v1",
      candidateSetChecksum: packet.candidateSetChecksum,
      ranked: [...packet.candidates].reverse().map((candidate) => ({
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        intendedLesson: candidate.intendedLesson,
        reasonCodes: candidate.reasonCodes,
      })),
    }));

    const result = await rankScenarioCandidatesWithOptionalAiV2(request, provider);

    expect(result.rankingSource).toBe("validated_ai_ranking");
    expect(result.ranked.map(({ templateId }) => templateId)).toEqual(
      [...fallback.ranked].reverse().map(({ templateId }) => templateId),
    );
    for (const ranked of result.ranked) {
      const expected = fallback.ranked.find(
        ({ templateId, templateVersion }) =>
          templateId === ranked.templateId && templateVersion === ranked.templateVersion,
      );
      expect(ranked).toEqual({ ...expected, rank: ranked.rank });
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ranked)).toBe(true);
  });

  it("sends only privacy-minimized structured facts", async () => {
    const request = input();
    const before = JSON.stringify(request);
    let sent: ScenarioDirectorAiRequestV2 | undefined;
    await rankScenarioCandidatesWithOptionalAiV2(request, async (packet) => {
      sent = packet;
      return undefined;
    });

    expect(sent).toBeDefined();
    expect(Object.isFrozen(sent)).toBe(true);
    expect(sent?.riskFacts[0]).toEqual({
      metricId: expect.any(String),
      severityBand: expect.stringMatching(/^(none|low|medium|high|critical)$/),
    });
    expect(sent?.candidates[0]).toMatchObject({
      narrativeSetupId: "setup.routine_warning",
    });
    expect(sent?.candidates[0]).not.toHaveProperty("narrativeSetup");
    const serialized = JSON.stringify(sent);
    for (const forbidden of [
      "run.private",
      "player.private",
      "decision.private",
      "12000000",
      "severityPpm",
      "rawValue",
      "A routine warning",
      "parameters",
      "effects",
      "amount",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(JSON.stringify(request)).toBe(before);
  });

  it("returns the full deterministic fallback when no provider is configured", async () => {
    const request = input();
    expect(await rankScenarioCandidatesWithOptionalAiV2(request)).toEqual(
      rankScenarioCandidatesV2(request),
    );
  });

  it("falls back on outage, malformed output, identity violations, or changed facts", async () => {
    const request = input();
    const fallback = rankScenarioCandidatesV2(request);
    const providers: readonly ScenarioDirectorAiProviderV2[] = [
      async () => {
        throw new Error("offline");
      },
      async () => undefined,
      async () => ({ version: "scenario-director-ai-response-v1" }),
      async (packet) => ({
        version: "scenario-director-ai-response-v0",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates,
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: "stale-checksum",
        ranked: packet.candidates,
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: [
          {
            ...packet.candidates[0],
            intendedLesson: packet.candidates[0]?.intendedLesson,
            reasonCodes: packet.candidates[0]?.reasonCodes,
          },
        ],
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: [packet.candidates[0], packet.candidates[0]].map((candidate) => ({
          templateId: candidate?.templateId,
          templateVersion: candidate?.templateVersion,
          intendedLesson: candidate?.intendedLesson,
          reasonCodes: candidate?.reasonCodes,
        })),
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates.map((candidate, index) => ({
          templateId: index === 0 ? "event.unknown" : candidate.templateId,
          templateVersion: candidate.templateVersion,
          intendedLesson: candidate.intendedLesson,
          reasonCodes: candidate.reasonCodes,
        })),
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates.map((candidate, index) => ({
          templateId: candidate.templateId,
          templateVersion: candidate.templateVersion,
          intendedLesson:
            index === 0 ? "lesson.invented" : candidate.intendedLesson,
          reasonCodes: candidate.reasonCodes,
        })),
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates.map((candidate, index) => ({
          templateId: candidate.templateId,
          templateVersion: candidate.templateVersion,
          intendedLesson: candidate.intendedLesson,
          reasonCodes:
            index === 0 ? ["invented_reason"] : candidate.reasonCodes,
        })),
      }),
      async (packet) => ({
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates.map((candidate) => ({
          templateId: candidate.templateId,
          templateVersion: candidate.templateVersion,
          intendedLesson: candidate.intendedLesson,
          reasonCodes: candidate.reasonCodes,
          parameters: { amount: 999_999 },
        })),
      }),
    ];

    for (const provider of providers) {
      expect(await rankScenarioCandidatesWithOptionalAiV2(request, provider)).toEqual(
        fallback,
      );
    }
  });

  it("falls back when the provider exceeds its bounded wait", async () => {
    const request = input();
    const fallback = rankScenarioCandidatesV2(request);
    const provider: ScenarioDirectorAiProviderV2 = async (packet) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        version: "scenario-director-ai-response-v1",
        candidateSetChecksum: packet.candidateSetChecksum,
        ranked: packet.candidates.map((candidate) => ({
          templateId: candidate.templateId,
          templateVersion: candidate.templateVersion,
          intendedLesson: candidate.intendedLesson,
          reasonCodes: candidate.reasonCodes,
        })),
      };
    };

    expect(
      await rankScenarioCandidatesWithOptionalAiV2(request, provider, {
        timeoutMs: 1,
      }),
    ).toEqual(fallback);
  });

  it("keeps normal core ranking provider-free and consumes no random value", async () => {
    const request = input();
    const provider = vi.fn<ScenarioDirectorAiProviderV2>();
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("unseeded randomness is forbidden");
    });

    expect(rankScenarioCandidatesV2(request).rankingSource).toBe(
      "deterministic_fallback",
    );
    expect(provider).not.toHaveBeenCalled();
    expect(await rankScenarioCandidatesWithOptionalAiV2(request)).toEqual(
      rankScenarioCandidatesV2(request),
    );
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
