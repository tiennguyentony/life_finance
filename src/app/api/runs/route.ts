import { handleCreateRun } from "@/server/api/current-http";
import { getOnboardingService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleCreateRun(request, getOnboardingService());
}
