import {
  handleCreateRun,
  handleListAccountRuns,
  handleListCapabilityRuns,
} from "@/server/api/current-http";
import { getOnboardingService, getRunRepository } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return handleListCapabilityRuns(request, getRunRepository());
  return handleListAccountRuns(user, getRunRepository());
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  return handleCreateRun(request, getOnboardingService(), {
    ...(user ? { ownerUserId: user.userId } : {}),
  });
}
