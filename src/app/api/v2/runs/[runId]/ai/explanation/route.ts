import { handleAiExplanationV2 } from "@/server/api/http";
import { getAiEducationService } from "@/server/api/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleAiExplanationV2(request, runId, getAiEducationService());
}
