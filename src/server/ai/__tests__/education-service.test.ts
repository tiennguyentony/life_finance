import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { recordLearningInteractionV2 } from "../../../core/learning-interaction-v2";
import type { V2Repository } from "../../api/v2/repository-port";
import { AiEducationService } from "../education-service";

function initialState() {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.ai-education",
    startMonth: "2026-07",
    randomSeed: "ai-education",
    player: {
      playerId: "player.ai-education",
      birthMonth: "1995-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000), taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0), homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(0),
      creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(600_000),
      requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

function repository() {
  let current = initialState();
  const value = {
    loadAuthorizedRunV2: async () => current,
    applyCommandV2: async (_runId: string, _secret: string, command: Parameters<typeof recordLearningInteractionV2>[1]) => {
      current = recordLearningInteractionV2(current, command);
      return { state: current, stateChecksum: "unused", idempotentReplay: false, monthlyRecord: null };
    },
  } as unknown as V2Repository;
  return { value, current: () => current };
}

const request = {
  conceptId: "liquidity",
  expectedRevision: 0,
  privacyNoticeVersion: 1 as const,
  dataUseAccepted: true as const,
};

describe("adaptive AI education service", () => {
  it("returns grounded structured teaching and persists bounded learning memory", async () => {
    const repo = repository();
    const service = new AiEducationService(
      repo.value,
      () => ({
        generate: async () => ({
          title: "Liquidity under pressure",
          explanation: "Cash can settle near-term obligations without forced selling.",
          whyItMattersNow: "The current cash fact is the immediate buffer.",
          actionTips: ["Compare cash with required monthly obligations."],
          citedEvidenceIds: ["context.cash", "context.required_cash"],
        }),
      }) as never,
      () => "lesson-success",
    );

    const result = await service.explain("run", "secret", request);

    expect(result.source).toBe("openai");
    expect(result.memoryRecorded).toBe(true);
    expect(result.explanation.citedEvidenceIds).toEqual([
      "context.cash", "context.required_cash",
    ]);
    expect(repo.current().gameplay.aiLearningMemory?.concepts[0]).toMatchObject({
      conceptId: "liquidity",
      exposureCount: 1,
    });
  });

  it("falls back to the deterministic curriculum when AI is unavailable", async () => {
    const repo = repository();
    const service = new AiEducationService(
      repo.value,
      () => ({ generate: async () => { throw new Error("offline"); } }) as never,
      () => "lesson-fallback",
    );

    const result = await service.explain("run", "secret", request);

    expect(result.source).toBe("deterministic_fallback");
    expect(result.explanation.title).toBe("Liquidity");
    expect(result.memoryRecorded).toBe(true);
  });

  it("rejects stale lessons before spending an AI call", async () => {
    const repo = repository();
    const service = new AiEducationService(repo.value, () => ({ generate: async () => { throw new Error("must not run"); } }) as never);
    await expect(service.explain("run", "secret", { ...request, expectedRevision: 1 })).rejects.toMatchObject({ code: "STALE_REVISION" });
  });
});
