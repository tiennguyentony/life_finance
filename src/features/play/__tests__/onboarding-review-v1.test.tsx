import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { onboardingDraftForPersonaV1 } from "../../../core/onboarding-personas-v1";
import { prepareOnboardingReviewV1 } from "../../../core/onboarding-v1";
import { OnboardingReviewPanelV1 } from "../onboarding-review-v1";
import { OnboardingManualFieldsV1 } from "../onboarding-manual-fields-v1";
import { OnboardingFlowPanelV1 } from "../onboarding-flow-panel-v1";
import {
  acceptOnboardingReviewV1,
  canConfirmOnboardingReviewV1,
  createOnboardingReviewSessionV1,
  updateOnboardingReviewDraftV1,
} from "../onboarding-review-session-v1";

describe("Prompt 13 onboarding review UI", () => {
  it("renders the full typed manual input surface from the authoritative draft", () => {
    const draft = onboardingDraftForPersonaV1("established", "manual-fields-seed");
    const html = renderToStaticMarkup(
      createElement(OnboardingManualFieldsV1, {
        draft,
        onChange: () => undefined,
      }),
    );

    for (const label of [
      "Birth month",
      "Location",
      "Employment / industry",
      "Household / dependents",
      "Gross income",
      "Take-home income evidence",
      "Essential expenses",
      "Discretionary expenses / lifestyle",
      "Broad-index investments",
      "401(k)",
      "Debts and rates",
      "Benefits and insurance",
      "Retirement plan / employer match",
      "Financial-independence goal",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("renders normalized values, assumptions, provenance, versions, preview, and seed", () => {
    const review = prepareOnboardingReviewV1(
      onboardingDraftForPersonaV1("software", "browser-review-seed"),
    );
    const html = renderToStaticMarkup(
      createElement(OnboardingReviewPanelV1, {
        review,
        current: true,
        busy: false,
        onConfirm: () => undefined,
      }),
    );

    expect(html).toContain("Confirm your starting position");
    expect(html).toContain("Catalog living-cost baseline");
    expect(html).toContain("Household");
    expect(html).toContain("Benefits package");
    expect(html).toContain("Insurance coverage");
    expect(html).toContain("Employer match tiers");
    expect(html).toContain("Taxable broad index");
    expect(html).toContain("Revolving credit used");
    expect(html).toContain("Owner versions");
    expect(html).toContain("createNativeGameStateV2 · 4.1.0");
    expect(html).toContain("FI progress");
    expect(html).toContain("Initial Risk v1 severity");
    expect(html).toContain("Initial risk weaknesses");
    expect(html).toContain("Assumptions");
    expect(html).toContain("Field sources and versions");
    expect(html).toContain("browser-review-seed");
    expect(html).toContain(review.reviewChecksum);
    expect(html).not.toContain("disabled");
  });

  it("invalidates confirmation whenever the source draft changes", () => {
    const draft = onboardingDraftForPersonaV1("teacher", "review-session-seed");
    const review = prepareOnboardingReviewV1(draft);
    const accepted = acceptOnboardingReviewV1(
      createOnboardingReviewSessionV1(draft),
      review,
    );

    expect(canConfirmOnboardingReviewV1(accepted)).toBe(true);
    const changed = updateOnboardingReviewDraftV1(accepted, {
      ...draft,
      grossIncome: {
        amountCents: 7_100_000,
        period: "annual",
        basis: "gross",
      },
    });
    expect(canConfirmOnboardingReviewV1(changed)).toBe(false);
    expect(changed.review).toBeNull();
  });

  it("renders field-addressed issues and disables an unready review", () => {
    const review = prepareOnboardingReviewV1({
      version: "onboarding-v1",
      sourceMode: "typed",
    });
    const html = renderToStaticMarkup(
      createElement(OnboardingReviewPanelV1, {
        review,
        current: true,
        busy: false,
        onConfirm: () => undefined,
      }),
    );

    expect(html).toContain("birthMonth");
    expect(html).toContain("randomSeed");
    expect(html).toContain("grossIncome");
    expect(html).toContain("disabled");
  });

  it("composes persona/manual input, optional AI, deterministic review, and explicit confirmation", () => {
    const draft = onboardingDraftForPersonaV1("software", "browser-composed-flow");
    const review = prepareOnboardingReviewV1(draft);
    const session = acceptOnboardingReviewV1(
      createOnboardingReviewSessionV1(draft),
      review,
    );
    const html = renderToStaticMarkup(
      createElement(OnboardingFlowPanelV1, {
        session,
        busy: false,
        busyLabel: "",
        error: null,
        aiConsent: true,
        aiFreeText: "",
        aiResult: {
          status: "ready",
          patch: {
            locationId: "location.austin",
            grossIncome: {
              amountCents: 9_200_000,
              period: "annual",
              basis: "gross",
            },
          },
          financialCandidates: [{
            field: "gross_income",
            valueAsStated: "$92k",
            sourceExcerpt: "make $92k gross per year",
            period: "annual",
            basis: "gross",
            requiresConfirmation: true,
          }],
          filingStatusCandidate: "single",
          clarificationQuestion: null,
          acceptedFieldIds: ["grossIncome", "locationId"],
          issues: [],
        },
        onDraftChange: () => undefined,
        onPersonaChange: () => undefined,
        onManualMode: () => undefined,
        onReview: () => undefined,
        onConfirm: () => undefined,
        onAiConsentChange: () => undefined,
        onAiFreeTextChange: () => undefined,
        onParseAi: () => undefined,
        onApplyAi: () => undefined,
      }),
    );

    expect(html).toContain("Starting template");
    expect(html).toContain("Manual typed input");
    expect(html).toContain("Describe your starting position");
    expect(html).toContain("Optional AI parser");
    expect(html).toContain("$92k");
    expect(html).toContain("grossIncome: $92,000 · annual · gross");
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Apply extracted typed fields");
    expect(html).toContain("Review starting position");
    expect(html).toContain("Confirm and start");
  });
});
