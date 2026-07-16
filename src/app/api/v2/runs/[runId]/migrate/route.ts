import { handleMigrateRunV2 } from "@/server/api/http";
import { getRunApiServiceV2 } from "@/server/api/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  return handleMigrateRunV2(request, runId, getRunApiServiceV2());
}
