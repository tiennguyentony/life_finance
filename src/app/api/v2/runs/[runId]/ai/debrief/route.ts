import { handleAiDebriefV2 } from "@/server/api/http";
import { getAiDebriefService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleAiDebriefV2(request, runId, getAiDebriefService());
}
