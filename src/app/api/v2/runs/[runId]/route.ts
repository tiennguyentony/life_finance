import { handleGetRunV2 } from "@/server/api/http";
import { getRunApiServiceV2 } from "@/server/api/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleGetRunV2(request, runId, getRunApiServiceV2());
}
