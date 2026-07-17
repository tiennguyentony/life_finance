import type {
  OnboardingAiExtractionResultV1,
  OnboardingDraftV1,
  OnboardingReviewV1,
} from "../../core/onboarding-v1-contracts";
import { AI_PRIVACY_NOTICE_VERSION } from "../../server/ai/privacy-notice";
import type { RunCredential, RunResponse } from "./play-types";
import {
  canConfirmOnboardingReviewV1,
  type OnboardingReviewSessionV1,
} from "./onboarding-review-session-v1";

export type BrowserJsonRequestV1 = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

const JSON_HEADERS = Object.freeze({ "Content-Type": "application/json" });

export function requestOnboardingReviewV1(
  request: BrowserJsonRequestV1,
  draft: OnboardingDraftV1,
): Promise<OnboardingReviewV1> {
  return request<OnboardingReviewV1>("/api/v2/onboarding/review", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ draft }),
  });
}

export function requestOnboardingConfirmationV1(
  request: BrowserJsonRequestV1,
  session: OnboardingReviewSessionV1,
): Promise<RunResponse & RunCredential> {
  if (
    !canConfirmOnboardingReviewV1(session) ||
    session.reviewedDraft === null ||
    session.review === null
  ) {
    return Promise.reject(
      new Error("A current ready onboarding review is required before confirmation."),
    );
  }
  return request<RunResponse & RunCredential>("/api/v2/runs/from-onboarding", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      draft: session.reviewedDraft,
      reviewChecksum: session.review.reviewChecksum,
    }),
  });
}

export function requestOnboardingParseV1(
  request: BrowserJsonRequestV1,
  freeText: string,
): Promise<OnboardingAiExtractionResultV1> {
  return request<OnboardingAiExtractionResultV1>("/api/v2/onboarding/parse", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      freeText,
    }),
  });
}

export function applyOnboardingAiExtractionAsTypedV1(
  draft: OnboardingDraftV1,
  extraction: OnboardingAiExtractionResultV1,
): OnboardingDraftV1 {
  if (extraction.status !== "ready") return draft;
  return Object.freeze({
    ...draft,
    ...extraction.patch,
    sourceMode: "ai_assisted",
  });
}

export class OnboardingRequestCoordinatorV1 {
  #epoch = 0;

  begin(): number {
    this.#epoch += 1;
    return this.#epoch;
  }

  reset(): void {
    this.#epoch += 1;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.#epoch;
  }
}
