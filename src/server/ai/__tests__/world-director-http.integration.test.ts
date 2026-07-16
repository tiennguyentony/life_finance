import { describe, expect, it, vi } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { recordExposureSnapshotV2 } from "../../../core/exposure-v2";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { handleAiWorldEventV2 } from "../../api/http";
import type { V2Repository } from "../../api/v2/repository-port";
import { AiWorldDirectorService } from "../world-director-service";

function exposedState() {
  const exposed = recordExposureSnapshotV2(
    migrateGameStateV1ToV2(createInitialGameState({
      runId: "00000000-0000-4000-8000-000000000010",
      startMonth: "2026-07",
      randomSeed: "world-http",
      player: {
        playerId: "player.http",
        birthMonth: "1995-01",
        locationId: "location.test",
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
    })),
  );
  return {
    ...exposed,
    gameplay: {
      ...exposed.gameplay,
      eventLifecycle: {
        ...exposed.gameplay.eventLifecycle,
        scheduledFollowUps: [{
          sourceEventId: "event.prior",
          templateId: "personal.medical_bill",
          templateVersion: 2,
          eligibleMonth: exposed.currentMonth,
        }],
      },
    },
  };
}

describe("AI World Director HTTP integration", () => {
  it("integrates request validation, ranking fallback, and a no-event response without a write", async () => {
    const state = exposedState();
    const applyCommandV2 = vi.fn();
    const repository = {
      loadAuthorizedRunV2: async () => state,
      applyCommandV2,
    } as unknown as V2Repository;
    const service = new AiWorldDirectorService(repository, () => ({
      generate: async () => {
        throw new Error("provider unavailable");
      },
    }) as never);
    const secret = `lf_run_${"a".repeat(43)}`;
    const request = new Request(
      "http://localhost/api/v2/runs/00000000-0000-4000-8000-000000000010/ai/world-event",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: state.revision,
          privacyNoticeVersion: 2,
          dataUseAccepted: true,
        }),
      },
    );

    const response = await handleAiWorldEventV2(
      request,
      state.runId,
      service,
    );
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      source: "deterministic_fallback",
      eventId: null,
      outcome: {
        status: "no_approved_event",
        reason: "rank_preview_only",
      },
      ranking: {
        rankingSource: "deterministic_fallback",
        ranked: [{ templateId: "personal.medical_bill" }],
      },
    });
    expect(applyCommandV2).not.toHaveBeenCalled();
    expect(state.gameplay.eventLifecycle.pending).toBeNull();
  });
});
