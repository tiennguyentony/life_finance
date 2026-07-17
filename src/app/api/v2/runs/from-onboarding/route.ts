import { handleOnboardingConfirmV1 } from "@/server/api/onboarding-http-v1";
import { getOnboardingApiServiceV1 } from "@/server/api/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleOnboardingConfirmV1(request, getOnboardingApiServiceV1());
}
