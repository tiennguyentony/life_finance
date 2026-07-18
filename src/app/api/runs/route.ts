import { handleCreateRun, handleListAccountRuns } from "@/server/api/current-http";
import { getOnboardingService, getRunRepository } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      { error: { code: "AUTH_REQUIRED", message: "Sign in to view saved games." } },
      { status: 401 },
    );
  }
  return handleListAccountRuns(user, getRunRepository());
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to create a persistent save." } }, { status: 401 });
  return handleCreateRun(request, getOnboardingService(), {
    ownerUserId: user.userId,
  });
}
