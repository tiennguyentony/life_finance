import {
  type OnboardingAiExtractionResultV1,
  type OnboardingIssueV1,
} from "../../core/onboarding-v1-contracts";
import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";
import type { OnboardingRequest, OnboardingResponse } from "./contracts";
import { AI_CONTRACT_VERSION, onboardingResponseSchema } from "./contracts";
import { AiRoleClient } from "./client";
import { redactSensitiveText } from "./privacy";
import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export type OnboardingAiClientV1 = AiRoleClient | Readonly<{
  generate(request: OnboardingRequest): Promise<OnboardingResponse>;
}>;

function issue(code: OnboardingIssueV1["code"]): OnboardingIssueV1 {
  return { path: "aiExtraction", code, severity: "invalid" };
}

function emptyResult(
  status: "unavailable" | "rejected",
  code: "AI_UNAVAILABLE" | "MALFORMED_AI_EXTRACTION",
): OnboardingAiExtractionResultV1 {
  return Object.freeze({
    status,
    patch: Object.freeze({}),
    financialCandidates: Object.freeze([]),
    filingStatusCandidate: null,
    clarificationQuestion: null,
    acceptedFieldIds: Object.freeze([]),
    issues: Object.freeze([issue(code)]),
  });
}

export class OnboardingAiServiceV1 {
  readonly #client: OnboardingAiClientV1 | null;

  constructor(client: OnboardingAiClientV1 | null) {
    this.#client = client;
  }

  async extract(rawFreeText: string): Promise<OnboardingAiExtractionResultV1> {
    if (this.#client === null) return emptyResult("unavailable", "AI_UNAVAILABLE");
    if (typeof rawFreeText !== "string") {
      return emptyResult("rejected", "MALFORMED_AI_EXTRACTION");
    }
    const sanitizedFreeText = redactSensitiveText(rawFreeText).text.trim();
    if (sanitizedFreeText.length === 0 || sanitizedFreeText.length > 4_000) {
      return emptyResult("rejected", "MALFORMED_AI_EXTRACTION");
    }
    const allowedLocationIds = US_2026_SCENARIO_CATALOG.locations.map(({ id }) => id);
    const allowedCareerTrackIds = US_2026_SCENARIO_CATALOG.careers.map(({ id }) => id);
    const request: OnboardingRequest = {
      contractVersion: AI_CONTRACT_VERSION,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      role: "onboarding",
      sanitizedFreeText,
      allowedLocationIds,
      allowedCareerTrackIds,
    };
    let generated: OnboardingResponse;
    try {
      generated = this.#client instanceof AiRoleClient
        ? await this.#client.generate<"onboarding">(request)
        : await this.#client.generate(request);
    } catch {
      return emptyResult("unavailable", "AI_UNAVAILABLE");
    }
    const parsed = onboardingResponseSchema.safeParse(generated);
    if (!parsed.success) {
      return emptyResult("rejected", "MALFORMED_AI_EXTRACTION");
    }
    const response = parsed.data;
    const amountFields = response.statedAmounts.map(({ field }) => field);
    if (
      (response.birthMonth !== null &&
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(response.birthMonth)) ||
      (response.locationId !== null &&
        !allowedLocationIds.includes(response.locationId)) ||
      (response.careerTrackId !== null &&
        !allowedCareerTrackIds.includes(response.careerTrackId)) ||
      new Set(amountFields).size !== amountFields.length ||
      response.statedAmounts.some(
        ({ sourceExcerpt }) => !sanitizedFreeText.includes(sourceExcerpt),
      ) ||
      new Set(response.missingFields).size !== response.missingFields.length
    ) {
      return emptyResult("rejected", "MALFORMED_AI_EXTRACTION");
    }
    const patch = Object.freeze({
      ...(response.birthMonth === null ? {} : { birthMonth: response.birthMonth }),
      ...(response.locationId === null ? {} : { locationId: response.locationId }),
      ...(response.careerTrackId === null
        ? {}
        : { careerId: response.careerTrackId }),
    });
    return Object.freeze({
      status: "ready",
      patch,
      financialCandidates: Object.freeze(
        response.statedAmounts
          .map((candidate) =>
            Object.freeze({
              ...candidate,
              requiresConfirmation: true as const,
            }),
          )
          .sort((left, right) => left.field.localeCompare(right.field)),
      ),
      filingStatusCandidate: response.filingStatus,
      clarificationQuestion: response.clarificationQuestion,
      acceptedFieldIds: Object.freeze(Object.keys(patch).sort()),
      issues: Object.freeze([]),
    });
  }
}
