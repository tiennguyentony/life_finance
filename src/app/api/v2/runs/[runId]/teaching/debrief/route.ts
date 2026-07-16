import { handlePostTeachingDebriefV2 } from "@/server/teaching/http-v2";
import { getTeachingServiceV2 } from "@/server/teaching/runtime-v2";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handlePostTeachingDebriefV2(
    request,
    runId,
    getTeachingServiceV2(),
  );
}
