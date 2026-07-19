import { handlePostTeachingMomentV2 } from "@/server/teaching/http-v2";
import { getTeachingServiceV2 } from "@/server/teaching/runtime-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bearer run-secret only for now. A teaching moment records a learning
 * interaction against the run, so it needs the write-capable credential rather
 * than the read bridge the checkpoint and debrief surfaces use.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handlePostTeachingMomentV2(request, runId, getTeachingServiceV2());
}
