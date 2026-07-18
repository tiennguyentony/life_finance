import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { recordExposureSnapshotV2 } from "../../../core/exposure-v2";
import { createInitialGameState } from "../../../core/game-state";
import {
  migrateGameStateV1ToV2,
  type GameStateV2,
} from "../../../core/game-state-v2";
import type { V2Repository } from "../../api/run-repository-port";
import {
  SCENARIO_DIRECTOR_AI_RESPONSE_V1,
} from "../../../core/scenario-director-ai-adapter-v2";
import type { ScenarioDirectorRequest } from "../contracts";
import { AiWorldDirectorService } from "../world-director-service";

function exposedState(): GameStateV2 {
  const exposed = recordExposureSnapshotV2(
    migrateGameStateV1ToV2(
      createInitialGameState({
        runId: "run.world-service",
        startMonth: "2026-07",
        randomSeed: "world-service",
        player: {
          playerId: "player.private-identifier",
          birthMonth: "1995-01",
          locationId: "location.private-identifier",
          careerTrackId: "career.test",
          filingStatus: "single",
        },
        finances: {
          cashCents: moneyCents(50_000),
          taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(0),
          homeValueCents: moneyCents(0),
          otherInvestableAssetsCents: moneyCents(0),
          otherAssetsCents: moneyCents(0),
          nonCreditLiabilitiesCents: moneyCents(0),
          creditLimitCents: moneyCents(100_000),
          creditUsedCents: moneyCents(0),
          annualLivingCostCents: moneyCents(600_000),
          requiredObligationsCents: moneyCents(50_000),
        },
        wellbeing: {
          burnoutPpm: ratePpm(0),
          happinessPpm: ratePpm(1_000_000),
        },
      }),
    ),
  );
  return {
    ...exposed,
    gameplay: {
      ...exposed.gameplay,
      eventLifecycle: {
        ...exposed.gameplay.eventLifecycle,
        history: [
          {
            commandId: "cmd.world-service.use-insurance",
            resultingRevision: 1,
            eventId: "event.world-service.lifestyle",
            templateId: "personal.lifestyle_upgrade",
            templateVersion: 2,
            tier: "medium",
            targetedWeakness: "unrelated_hazard",
            parameters: { annual_cost_increase_cents: 120_000 },
            choiceId: "keep_current_lifestyle",
            availableChoiceIds: ["accept_upgrade", "keep_current_lifestyle"],
            scheduledMonth: exposed.currentMonth,
            resolvedMonth: exposed.currentMonth,
            playerCostCents: moneyCents(0),
            insurerCostCents: moneyCents(0),
            eventSchemaVersion: 2,
            category: "behavioral_trap",
            classification: "neutral",
            lessonTags: {
              primary: "lesson.lifestyle_creep",
              secondary: ["lesson.goal_tradeoff"],
            },
            pressureCost: 2,
            recoveryDurationMonths: 1,
            fallbackNarrative: {
              headline: "A lifestyle upgrade is within reach",
              body: "The offer is appealing, but accepting it permanently raises annual spending.",
            },
          },
        ],
        activeStoryIds: ["story.2026-07.macro.tech_boom"],
        macroStories: [
          {
            storyId: "story.2026-07.macro.tech_boom",
            templateId: "macro.tech_boom",
            templateVersion: 1,
            parameters: { equity_boost_ppm: 10_000 },
            startedMonth: exposed.currentMonth,
            expiresMonth: simulationMonth("2026-09"),
            returnModifiersPpm: {
              equity: ratePpm(10_000),
              bonds: ratePpm(-2_000),
              cash: ratePpm(0),
              housing: ratePpm(0),
            },
          },
        ],
        scheduledFollowUps: [
          {
            sourceEventId: "event.prior",
            templateId: "personal.medical_bill",
            templateVersion: 2,
            eligibleMonth: exposed.currentMonth,
          },
        ],
      },
    },
  };
}

function repositoryFor(state: GameStateV2) {
  const applyCommandV2 = vi.fn(async () => {
    throw new Error("rank preview must never apply a command");
  });
  const repository = {
    loadAuthorizedRunV2: async () => state,
    applyCommandV2,
  } as unknown as V2Repository;
  return { repository, applyCommandV2 };
}

function validAiResponse(request: ScenarioDirectorRequest) {
  return {
    version: SCENARIO_DIRECTOR_AI_RESPONSE_V1,
    candidateSetChecksum: request.director.candidateSetChecksum,
    ranked: request.director.candidates.map(
      ({ templateId, templateVersion, intendedLesson, reasonCodes }) => ({
        templateId,
        templateVersion,
        intendedLesson,
        reasonCodes,
      }),
    ),
  };
}

describe("AI World Director service", () => {
  it("ranks from fresh Risk v1 without requiring a persisted Exposure snapshot", async () => {
    const prior = exposedState();
    const state = {
      ...prior,
      gameplay: {
        ...prior.gameplay,
        exposure: { current: null, history: [] },
      },
    } as GameStateV2;
    const { repository } = repositoryFor(state);
    const service = new AiWorldDirectorService(repository, () => ({
      generate: async () => {
        throw new Error("offline");
      },
    }) as never);

    const result = await service.createEvent("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    });

    expect(result.ranking.riskAsOfMonth).toBe(state.currentMonth);
    expect(result.ranking.riskVersion).toBe("risk-v1");
  });

  it("falls back deterministically and returns a read-only rank preview during an outage", async () => {
    const state = exposedState();
    const before = sha256Canonical(state);
    const { repository, applyCommandV2 } = repositoryFor(state);
    const service = new AiWorldDirectorService(repository, () => ({
      generate: async () => {
        throw new Error("offline");
      },
    }) as never);

    const result = await service.createEvent("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    });

    expect(result).toMatchObject({
      source: "deterministic_fallback",
      eventId: null,
      outcome: {
        status: "no_approved_event",
        reason: "rank_preview_only",
      },
      ranking: {
        rankingSource: "deterministic_fallback",
        ranked: [{ templateId: "personal.medical_bill", templateVersion: 2 }],
      },
      stateChecksum: before,
    });
    expect(result.state).toBe(state);
    expect(sha256Canonical(state)).toBe(before);
    expect(state.gameplay.eventLifecycle.pending).toBeNull();
    expect(applyCommandV2).not.toHaveBeenCalled();
  });

  it("sends only privacy-minimized ranking facts and accepts an exact permutation", async () => {
    const state = exposedState();
    const { repository, applyCommandV2 } = repositoryFor(state);
    let observed: ScenarioDirectorRequest | undefined;
    const service = new AiWorldDirectorService(repository, () => ({
      generate: async (request: ScenarioDirectorRequest) => {
        observed = request;
        return validAiResponse(request);
      },
      responseSource: () => "hosted_oss" as const,
    }) as never);

    const result = await service.createEvent("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    });

    expect(result).toMatchObject({
      source: "hosted_oss",
      eventId: null,
      outcome: { status: "no_approved_event" },
      ranking: { rankingSource: "validated_ai_ranking" },
    });
    expect(observed).toMatchObject({
      contractVersion: 2,
      role: "scenario_director",
      director: {
        riskFacts: expect.arrayContaining([
          expect.objectContaining({ severityBand: expect.any(String) }),
        ]),
        candidates: [
          expect.objectContaining({
            templateId: "personal.medical_bill",
            intendedLesson: expect.any(String),
            reasonCodes: expect.any(Array),
          }),
        ],
        recentDecisions: [
          expect.objectContaining({
            reasonCode: "choice.keep_current_lifestyle",
            semanticTags: expect.arrayContaining([
              "choice.keep_current_lifestyle",
              "lesson.lifestyle_creep",
            ]),
          }),
        ],
        storyArc: {
          arcId: "story.2026-07.macro.tech_boom",
          tags: expect.arrayContaining(["category.opportunity"]),
        },
      },
    });
    const serialized = JSON.stringify(observed);
    for (const forbiddenKey of [
      "runId",
      "playerId",
      "birthMonth",
      "locationId",
      "cashCents",
      "amount",
      "parameters",
      "effects",
      "approval",
      "eventId",
      "narrative",
    ]) {
      expect(serialized).not.toContain(forbiddenKey);
    }
    expect(serialized).not.toContain("player.private-identifier");
    expect(serialized).not.toContain("location.private-identifier");
    expect(serialized).not.toContain("1995-01");
    expect(applyCommandV2).not.toHaveBeenCalled();
    expect(state.gameplay.eventLifecycle.pending).toBeNull();
  });

  it.each([
    ["malformed", () => null],
    [
      "unknown candidate",
      (request: ScenarioDirectorRequest) => ({
        ...validAiResponse(request),
        ranked: [{
          ...validAiResponse(request).ranked[0],
          templateId: "personal.unknown",
        }],
      }),
    ],
    [
      "duplicate candidate",
      (request: ScenarioDirectorRequest) => {
        const valid = validAiResponse(request);
        return { ...valid, ranked: [valid.ranked[0], valid.ranked[0]] };
      },
    ],
    [
      "missing candidate",
      (request: ScenarioDirectorRequest) => ({
        ...validAiResponse(request),
        ranked: [],
      }),
    ],
    [
      "version mismatch",
      (request: ScenarioDirectorRequest) => ({
        ...validAiResponse(request),
        version: "scenario-director-ai-response-v999",
      }),
    ],
    [
      "checksum mismatch",
      (request: ScenarioDirectorRequest) => ({
        ...validAiResponse(request),
        candidateSetChecksum: "0".repeat(64),
      }),
    ],
    [
      "unsafe approval output",
      (request: ScenarioDirectorRequest) => ({
        ...validAiResponse(request),
        approvedEventId: "personal.medical_bill",
      }),
    ],
    [
      "unsafe parameter output",
      (request: ScenarioDirectorRequest) => {
        const valid = validAiResponse(request);
        return {
          ...valid,
          ranked: [{ ...valid.ranked[0], parameters: { amountCents: 1 } }],
        };
      },
    ],
  ])("uses the whole deterministic fallback for %s", async (_label, response) => {
    const state = exposedState();
    const before = sha256Canonical(state);
    const { repository, applyCommandV2 } = repositoryFor(state);
    const service = new AiWorldDirectorService(repository, () => ({
      generate: async (request: ScenarioDirectorRequest) => response(request),
      responseSource: () => "openai" as const,
    }) as never);

    const result = await service.createEvent("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    });

    expect(result.source).toBe("deterministic_fallback");
    expect(result.ranking.rankingSource).toBe("deterministic_fallback");
    expect(result.eventId).toBeNull();
    expect(result.stateChecksum).toBe(before);
    expect(applyCommandV2).not.toHaveBeenCalled();
  });
});
