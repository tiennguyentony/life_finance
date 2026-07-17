import { createRunV2ResponseSchema } from "./contracts-v2";
import {
  onboardingConfirmRequestV1Schema,
  onboardingParseRequestV1Schema,
  onboardingParseResponseV1Schema,
  onboardingReviewRequestV1Schema,
  onboardingReviewResponseV1Schema,
} from "./onboarding-contracts-v1";
import {
  OnboardingApiErrorV1,
  type OnboardingApiServiceV1,
} from "./onboarding-service-v1";
import type { OnboardingAiServiceV1 } from "../ai/onboarding-service-v1";
import type { OnboardingDraftV1 } from "../../core/onboarding-v1-contracts";

const MAX_REQUEST_BYTES = 64 * 1024;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  return JSON.parse(text) as unknown;
}

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function failure(error: unknown): Response {
  if (error instanceof OnboardingApiErrorV1) {
    return response({ error: { code: error.code, message: error.message } }, 409);
  }
  if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
    return response(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "request body exceeds 64 KiB" } },
      413,
    );
  }
  if (error instanceof SyntaxError) {
    return response(
      { error: { code: "INVALID_JSON", message: "request body must be valid JSON" } },
      400,
    );
  }
  return response(
    { error: { code: "INVALID_REQUEST", message: "onboarding request is invalid" } },
    400,
  );
}

export async function handleOnboardingReviewV1(
  request: Request,
  service: OnboardingApiServiceV1,
): Promise<Response> {
  try {
    const input = onboardingReviewRequestV1Schema.parse(await readJson(request));
    return response(
      onboardingReviewResponseV1Schema.parse(
        service.review(input.draft as OnboardingDraftV1),
      ),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleOnboardingConfirmV1(
  request: Request,
  service: OnboardingApiServiceV1,
): Promise<Response> {
  try {
    const input = onboardingConfirmRequestV1Schema.parse(await readJson(request));
    const created = await service.confirm({
      draft: input.draft as OnboardingDraftV1,
      reviewChecksum: input.reviewChecksum,
    });
    return response(createRunV2ResponseSchema.parse(created), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function handleOnboardingParseV1(
  request: Request,
  service: OnboardingAiServiceV1,
): Promise<Response> {
  try {
    const input = onboardingParseRequestV1Schema.parse(await readJson(request));
    return response(
      onboardingParseResponseV1Schema.parse(await service.extract(input.freeText)),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
