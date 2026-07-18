import { describe, expect, it } from "vitest";

import { ratePpm } from "@/core/domain/money";
import { onboardingDraftForPersonaV1 } from "@/core/onboarding-personas-v1";
import {
  constructOnboardedGameStateV1,
  prepareOnboardingReviewV1,
} from "@/core/onboarding-v1";

import { InMemoryRunRepository } from "../in-memory-run-repository";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_SECRET = `lf_run_${"a".repeat(43)}`;

function initialState(runId: string) {
  const draft = onboardingDraftForPersonaV1("software", "demo-repository-seed");
  const review = prepareOnboardingReviewV1(draft);
  return constructOnboardedGameStateV1(
    { confirmed: true, review, reviewChecksum: review.reviewChecksum },
    { runId, playerId: "player_demo_repository" },
  ).state;
}

describe("InMemoryRunRepository", () => {
  it("creates, authorizes, and identifies a local run", async () => {
    const repository = new InMemoryRunRepository({
      runIdFactory: () => RUN_ID,
      accessSecretFactory: () => ACCESS_SECRET,
    });

    const created = await repository.createRunV2(initialState);

    expect(created).toMatchObject({
      runId: RUN_ID,
      accessSecret: ACCESS_SECRET,
      state: { runId: RUN_ID, revision: 0 },
    });
    expect(repository.hasRun(RUN_ID)).toBe(true);
    await expect(
      repository.loadAuthorizedRunV2(RUN_ID, "bad-secret"),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_UNAUTHORIZED" });
  });

  it("applies a real engine command and replays an exact duplicate once", async () => {
    const repository = new InMemoryRunRepository({
      runIdFactory: () => RUN_ID,
      accessSecretFactory: () => ACCESS_SECRET,
    });
    const created = await repository.createRunV2(initialState);
    const command = {
      schemaVersion: 2 as const,
      id: "demo.strategy.1",
      type: "set_recurring_strategy" as const,
      expectedRevision: created.state.revision,
      effectiveMonth: created.state.currentMonth,
      payload: {
        strategy: {
          ...created.state.gameplay.recurringStrategy,
          afterTaxBroadIndexRatePpm: ratePpm(100_000),
        },
      },
    };

    const applied = await repository.applyCommandV2(
      RUN_ID,
      ACCESS_SECRET,
      command,
    );
    const replayed = await repository.applyCommandV2(
      RUN_ID,
      ACCESS_SECRET,
      command,
    );

    expect(applied).toMatchObject({
      idempotentReplay: false,
      state: { revision: 1 },
      monthlyRecord: null,
    });
    expect(replayed).toMatchObject({
      idempotentReplay: true,
      state: { revision: 1 },
      monthlyRecord: null,
    });
    await expect(
      repository.loadAcceptedCommandV2(RUN_ID, ACCESS_SECRET, command.id),
    ).resolves.toEqual(command);
  });

  it("rejects a reused command id with a different payload", async () => {
    const repository = new InMemoryRunRepository({
      runIdFactory: () => RUN_ID,
      accessSecretFactory: () => ACCESS_SECRET,
    });
    const created = await repository.createRunV2(initialState);
    const command = {
      schemaVersion: 2 as const,
      id: "demo.strategy.conflict",
      type: "set_recurring_strategy" as const,
      expectedRevision: created.state.revision,
      effectiveMonth: created.state.currentMonth,
      payload: { strategy: created.state.gameplay.recurringStrategy },
    };
    await repository.applyCommandV2(RUN_ID, ACCESS_SECRET, command);

    await expect(
      repository.applyCommandV2(RUN_ID, ACCESS_SECRET, {
        ...command,
        payload: {
          strategy: {
            ...command.payload.strategy,
            afterTaxBroadIndexRatePpm: ratePpm(50_000),
          },
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });
});
