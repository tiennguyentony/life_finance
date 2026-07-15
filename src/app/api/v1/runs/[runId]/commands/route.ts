import { handleSubmitCommand } from "@/server/api/http";
import { getRunApiService } from "@/server/api/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleSubmitCommand(request, runId, getRunApiService());
}
