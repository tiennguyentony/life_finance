import { handleCreateRun } from "@/server/api/current-http";
import { getOnboardingService } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to create a persistent save." } }, { status: 401 });
  return handleCreateRun(request, getOnboardingService(), {
    ownerUserId: user.userId,
  });
}
