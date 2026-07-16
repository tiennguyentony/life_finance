import type {
  OnboardingDraftV1,
  OnboardingReviewV1,
} from "../../core/onboarding-v1-contracts";

export type OnboardingReviewSessionV1 = Readonly<{
  draft: OnboardingDraftV1;
  reviewedDraft: OnboardingDraftV1 | null;
  review: OnboardingReviewV1 | null;
}>;

export function createOnboardingReviewSessionV1(
  draft: OnboardingDraftV1,
): OnboardingReviewSessionV1 {
  return Object.freeze({ draft, reviewedDraft: null, review: null });
}

export function updateOnboardingReviewDraftV1(
  session: OnboardingReviewSessionV1,
  draft: OnboardingDraftV1,
): OnboardingReviewSessionV1 {
  return Object.freeze({ draft, reviewedDraft: null, review: null });
}

export function acceptOnboardingReviewV1(
  session: OnboardingReviewSessionV1,
  review: OnboardingReviewV1,
): OnboardingReviewSessionV1 {
  return Object.freeze({
    draft: session.draft,
    reviewedDraft: session.draft,
    review,
  });
}

export function canConfirmOnboardingReviewV1(
  session: OnboardingReviewSessionV1,
): boolean {
  return (
    session.review?.status === "ready" &&
    session.review.normalized !== null &&
    session.reviewedDraft === session.draft
  );
}
