import { handleGetRun } from "@/server/api/http";
import { getRunApiService } from "@/server/api/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleGetRun(request, runId, getRunApiService());
}
