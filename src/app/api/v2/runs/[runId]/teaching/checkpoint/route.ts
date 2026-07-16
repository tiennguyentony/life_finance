import { handleGetTeachingCheckpointV2 } from "@/server/teaching/http-v2";
import { getTeachingServiceV2 } from "@/server/teaching/runtime-v2";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleGetTeachingCheckpointV2(
    request,
    runId,
    getTeachingServiceV2(),
  );
}
