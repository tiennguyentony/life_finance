import { handleOnboardingParseV1 } from "@/server/api/onboarding-http-v1";
import { getOnboardingAiServiceV1 } from "@/server/api/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleOnboardingParseV1(request, getOnboardingAiServiceV1());
}
