import {
  handleSubmitAccountCommand,
  handleSubmitCommand,
} from "@/server/api/current-http";
import { getRunGateway, getRunRepository, isLocalDemoRun } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  if (isLocalDemoRun(runId)) {
    return handleSubmitCommand(request, runId, getRunGateway());
  }
  const user = await getAuthenticatedUser();
  if (user) {
    return handleSubmitAccountCommand(
      request,
      user,
      runId,
      getRunRepository(),
      getRunGateway(),
    );
  }
  return handleSubmitCommand(request, runId, getRunGateway());
}
