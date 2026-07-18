import { handleActivateAccountRun } from "@/server/api/current-http";
import { getRunRepository } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      { error: { code: "AUTH_REQUIRED", message: "Sign in to restore a saved game." } },
      { status: 401 },
    );
  }
  const { runId } = await context.params;
  return handleActivateAccountRun(request, user, runId, getRunRepository());
}
