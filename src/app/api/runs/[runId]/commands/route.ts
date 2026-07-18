import { handleSubmitCommand } from "@/server/api/current-http";
import { getRunGateway } from "@/server/api/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleSubmitCommand(request, runId, getRunGateway());
}
