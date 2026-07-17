import { describe, expect, it } from "vitest";

import { onboardingDraftForPersonaV1 } from "../../../core/onboarding-personas-v1";
import { prepareOnboardingReviewV1 } from "../../../core/onboarding-v1";
import type { OnboardingAiExtractionResultV1 } from "../../../core/onboarding-v1-contracts";
import { AI_PRIVACY_NOTICE_VERSION } from "../../../server/ai/privacy-notice";
import {
  applyOnboardingAiExtractionAsTypedV1,
  OnboardingRequestCoordinatorV1,
  requestOnboardingConfirmationV1,
  requestOnboardingParseV1,
  requestOnboardingReviewV1,
  type BrowserJsonRequestV1,
} from "../onboarding-browser-flow-v1";
import {
  acceptOnboardingReviewV1,
  createOnboardingReviewSessionV1,
} from "../onboarding-review-session-v1";

describe("Prompt 13 browser onboarding flow", () => {
  it("invalidates an older response after a newer request or session reset", () => {
    const coordinator = new OnboardingRequestCoordinatorV1();
    const first = coordinator.begin();
    expect(coordinator.isCurrent(first)).toBe(true);

    const second = coordinator.begin();
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);

    coordinator.reset();
    expect(coordinator.isCurrent(second)).toBe(false);
  });

  it("posts only the typed draft to the deterministic review endpoint", async () => {
    const draft = onboardingDraftForPersonaV1("nurse", "browser-review-wire");
    const review = prepareOnboardingReviewV1(draft);
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request: BrowserJsonRequestV1 = async <T,>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return review as T;
    };

    await expect(requestOnboardingReviewV1(request, draft)).resolves.toBe(review);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/api/v2/onboarding/review");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ draft });
  });

  it("confirms only a current ready session with its original draft and checksum", async () => {
    const draft = onboardingDraftForPersonaV1("teacher", "browser-confirm-wire");
    const review = prepareOnboardingReviewV1(draft);
    const session = acceptOnboardingReviewV1(
      createOnboardingReviewSessionV1(draft),
      review,
    );
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const created = { runId: "run.reviewed", accessSecret: "lf_run_secret" };
    const request: BrowserJsonRequestV1 = async <T,>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return created as T;
    };

    await expect(
      requestOnboardingConfirmationV1(request, session),
    ).resolves.toBe(created);
    expect(calls[0]?.path).toBe("/api/v2/runs/from-onboarding");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      draft,
      reviewChecksum: review.reviewChecksum,
    });

    await expect(
      requestOnboardingConfirmationV1(
        request,
        createOnboardingReviewSessionV1(draft),
      ),
    ).rejects.toThrow(/current ready onboarding review/i);
    expect(calls).toHaveLength(1);
  });

  it("keeps optional AI amounts as visible candidates and applies only explicitly confirmed typed fields", async () => {
    const draft = onboardingDraftForPersonaV1("software", "browser-ai-wire");
    const extraction: OnboardingAiExtractionResultV1 = {
      status: "ready",
      patch: {
        birthMonth: "1990-04",
        locationId: "location.austin",
        careerId: "career.software",
      },
      financialCandidates: [
        {
          field: "gross_income",
          valueAsStated: "$92k",
          sourceExcerpt: "make $92k gross per year",
          period: "annual",
          basis: "gross",
          requiresConfirmation: true,
        },
      ],
      filingStatusCandidate: "single",
      clarificationQuestion: null,
      acceptedFieldIds: ["birthMonth", "careerId", "locationId"],
      issues: [],
    };
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request: BrowserJsonRequestV1 = async <T,>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return extraction as T;
    };

    await expect(
      requestOnboardingParseV1(request, "I make $92k gross per year."),
    ).resolves.toBe(extraction);
    expect(calls[0]?.path).toBe("/api/v2/onboarding/parse");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      freeText: "I make $92k gross per year.",
    });

    const applied = applyOnboardingAiExtractionAsTypedV1(draft, extraction);
    expect(applied).toMatchObject({
      sourceMode: "ai_assisted",
      personaId: "software",
      birthMonth: "1990-04",
      locationId: "location.austin",
    });
    expect(JSON.stringify(applied)).not.toContain("$92k");

    const review = prepareOnboardingReviewV1(applied);
    expect(review.normalized?.persona).toEqual({
      id: "software",
      version: "onboarding-persona-v1",
    });
    expect(review.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "finances.cashCents",
          source: "persona_fixture",
        }),
        expect.objectContaining({
          path: "selection.locationId",
          source: "user_entered",
        }),
        expect.objectContaining({
          path: "selection.careerId",
          source: "persona_fixture",
        }),
      ]),
    );
  });
});
