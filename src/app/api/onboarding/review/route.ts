import { handleReviewOnboarding } from "@/server/api/current-http";
import { getOnboardingService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleReviewOnboarding(request, getOnboardingService());
}
