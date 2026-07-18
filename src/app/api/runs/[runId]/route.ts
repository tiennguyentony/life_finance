import { handleGetAccountRun, handleGetRun } from "@/server/api/current-http";
import { getRunReaderGateway, isLocalDemoRun } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  if (isLocalDemoRun(runId)) {
    return handleGetRun(request, runId, getRunReaderGateway());
  }
  const user = await getAuthenticatedUser();
  if (user) return handleGetAccountRun(user, runId, getRunReaderGateway());
  return handleGetRun(request, runId, getRunReaderGateway());
}
