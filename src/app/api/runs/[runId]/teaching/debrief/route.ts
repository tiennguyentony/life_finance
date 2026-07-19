import { handlePostTeachingDebriefV2 } from "@/server/teaching/http-v2";
import { handlePostAccountTeachingDebriefV2 } from "@/server/teaching/account-http-v2";
import { getTeachingServiceForRunV2 } from "@/server/teaching/runtime-v2";
import { isLocalDemoRun } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const service = getTeachingServiceForRunV2(runId);

  // Demo runs are capability-cookie owned and never reach Supabase.
  if (isLocalDemoRun(runId)) {
    return handlePostAccountTeachingDebriefV2(request, null, runId, service);
  }

  const user = await getAuthenticatedUser();
  if (user) {
    return handlePostAccountTeachingDebriefV2(request, user, runId, service);
  }
  return handlePostTeachingDebriefV2(request, runId, service);
}
