import {
  handleInterpretAccountEvent,
  handleInterpretEvent,
} from "@/server/api/current-http";
import {
  getInteractiveEventService,
  getRunReaderGateway,
  getRunRepository,
  isLocalDemoRun,
} from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const reader = getRunReaderGateway();
  const interpreter = getInteractiveEventService();
  if (isLocalDemoRun(runId)) {
    return handleInterpretEvent(request, runId, reader, interpreter);
  }
  const user = await getAuthenticatedUser();
  if (user) {
    return handleInterpretAccountEvent(
      request,
      user,
      runId,
      getRunRepository(),
      reader,
      interpreter,
    );
  }
  return handleInterpretEvent(request, runId, reader, interpreter);
}
