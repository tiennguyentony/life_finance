import { handleParseOnboarding } from "@/server/api/current-http";
import { getOnboardingAiService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleParseOnboarding(request, getOnboardingAiService());
}
