import { describe, expect, it, vi } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { AI_PRIVACY_NOTICE_VERSION } from "../../ai/privacy-notice";
import { handlePostTeachingRewriteV2 } from "../rewrite-http-v2";
import {
  TeachingRewriteServiceV2,
  type TeachingRewriteProviderRequestV2,
  type TeachingRewriteRequesterV2,
} from "../rewrite-service-v2";

function state() {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.teaching-rewrite",
    startMonth: "2029-04",
    randomSeed: "teaching-rewrite",
    player: {
      playerId: "player.teaching-rewrite",
      birthMonth: "1994-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000), taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0), homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(100_000),
      creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(1_200_000),
      requiredObligationsCents: moneyCents(100_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

const request = {
  expectedRevision: 0,
  privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
  dataUseAccepted: true as const,
  target: { kind: "moment" as const, conceptId: "financial_independence" },
};

describe("Teaching v2 production rewrite service", () => {
  it("derives its own template/policy and accepts only a fact-preserving rewrite", async () => {
    const current = state();
    const repository = { loadAuthorizedRunV2: vi.fn().mockResolvedValue(current) };
    const meaningPreservingRequest = {
      ...request,
      target: { kind: "moment" as const, conceptId: "compounding" },
    };
    const requester: TeachingRewriteRequesterV2 = vi.fn(async (
      _runId: string,
      derived: TeachingRewriteProviderRequestV2,
    ) => ({
      sections: derived.fallback.sections.map((section) => ({
        ...section,
        fragments: section.fragments.map((fragment) =>
          fragment.kind === "text"
            ? { ...fragment, text: `${fragment.text.trim()}!` }
            : fragment,
        ),
      })),
    }));
    const result = await new TeachingRewriteServiceV2(repository, requester)
      .rewrite(current.runId, "secret", meaningPreservingRequest);

    expect(result.rewrite.source).toBe("ai_validated");
    expect(requester).toHaveBeenCalledWith(
      current.runId,
      expect.objectContaining({
        policy: expect.objectContaining({
          allowedFactIds: ["state.retirement_assets_cents"],
          requiredFactIds: ["state.retirement_assets_cents"],
        }),
      }),
      expect.any(AbortSignal),
    );
    expect(repository.loadAuthorizedRunV2).toHaveBeenCalledTimes(2);
  });

  it("returns the server-derived fallback on unsupported claims and timeout", async () => {
    const current = state();
    const repository = { loadAuthorizedRunV2: vi.fn().mockResolvedValue(current) };
    const rejected = await new TeachingRewriteServiceV2(
      repository,
      async (_runId, derived) => ({
        sections: derived.fallback.sections.map((section) => ({
          ...section,
          fragments: section.sectionId === "moment.title"
            ? [{ kind: "text", text: "Your plan cannot fail" }]
            : section.fragments,
        })),
      }),
    ).rewrite(current.runId, "secret", request);
    const timedOut = await new TeachingRewriteServiceV2(
      repository,
      async () => new Promise<never>(() => undefined),
      1,
    ).rewrite(current.runId, "secret", request);

    expect(rejected.rewrite).toMatchObject({
      source: "template_fallback",
      fallbackReason: "invalid_output",
    });
    expect(timedOut.rewrite).toMatchObject({
      source: "template_fallback",
      fallbackReason: "timeout",
    });
    expect(rejected.rewrite.content).toEqual(timedOut.rewrite.content);
  });

  it("rejects client-supplied fallback/policy tampering before run access", async () => {
    const repository = { loadAuthorizedRunV2: vi.fn() };
    const response = await handlePostTeachingRewriteV2(
      new Request("http://localhost/api/v2/runs/run.teaching-rewrite/teaching/rewrite", {
        method: "POST",
        headers: {
          authorization: `Bearer lf_run_${"A".repeat(43)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          fallback: { version: "teaching-copy-v2", sections: [] },
          policy: { allowedFactIds: ["invented"], requiredFactIds: [] },
        }),
      }),
      "run.teaching-rewrite",
      new TeachingRewriteServiceV2(repository, async () => ({})),
    );

    expect(response.status).toBe(400);
    expect(repository.loadAuthorizedRunV2).not.toHaveBeenCalled();
  });
});
