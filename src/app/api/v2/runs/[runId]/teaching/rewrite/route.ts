import { handlePostTeachingRewriteV2 } from "@/server/teaching/rewrite-http-v2";
import { getTeachingRewriteServiceV2 } from "@/server/teaching/runtime-v2";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handlePostTeachingRewriteV2(request, runId, getTeachingRewriteServiceV2());
}
