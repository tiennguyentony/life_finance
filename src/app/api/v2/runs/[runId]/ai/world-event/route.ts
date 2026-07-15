import { handleAiWorldEventV2 } from "@/server/api/http";
import { getAiWorldDirectorService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleAiWorldEventV2(request, runId, getAiWorldDirectorService());
}
