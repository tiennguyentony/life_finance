import { randomUUID } from "node:crypto";

import type { GameStateV2 } from "../../core/game-state-v2";
import {
  constructOnboardedGameStateV1,
  prepareOnboardingReviewV1,
} from "../../core/onboarding-v1";
import type {
  OnboardingDraftV1,
  OnboardingReviewV1,
} from "../../core/onboarding-v1-contracts";
import type { CreatedRunV2 } from "../db/run-repository-contracts";

export type OnboardingCreateRepositoryV1 = Readonly<{
  createRunV2(
    initialStateFactory: (runId: string) => GameStateV2,
  ): Promise<CreatedRunV2>;
}>;

export type ConfirmOnboardingRequestV1 = Readonly<{
  draft: OnboardingDraftV1;
  reviewChecksum: string;
}>;

export class OnboardingError extends Error {
  readonly code: "REVIEW_NOT_READY" | "STALE_REVIEW";

  constructor(code: OnboardingError["code"], message: string) {
    super(message);
    this.name = "OnboardingError";
    this.code = code;
  }
}

export class OnboardingService {
  readonly #repository: OnboardingCreateRepositoryV1;
  readonly #playerIdFactory: () => string;

  constructor(
    repository: OnboardingCreateRepositoryV1,
    playerIdFactory: () => string = () => `player_${randomUUID()}`,
  ) {
    this.#repository = repository;
    this.#playerIdFactory = playerIdFactory;
  }

  review(draft: OnboardingDraftV1): OnboardingReviewV1 {
    return prepareOnboardingReviewV1(draft);
  }

  async confirm(request: ConfirmOnboardingRequestV1): Promise<CreatedRunV2> {
    const review = prepareOnboardingReviewV1(request.draft);
    if (review.status !== "ready") {
      throw new OnboardingError(
        "REVIEW_NOT_READY",
        "onboarding input must have a ready review before starting",
      );
    }
    if (request.reviewChecksum !== review.reviewChecksum) {
      throw new OnboardingError(
        "STALE_REVIEW",
        "onboarding input changed after review; review it again",
      );
    }
    const playerId = this.#playerIdFactory();
    return this.#repository.createRunV2((runId) =>
      constructOnboardedGameStateV1(
        {
          confirmed: true,
          review,
          reviewChecksum: request.reviewChecksum,
        },
        { runId, playerId },
      ).state,
    );
  }
}

// Internal compatibility alias for tests that describe the persisted v1 draft format.
export { OnboardingService as OnboardingApiServiceV1 };
