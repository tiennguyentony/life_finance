import {
  handleSubmitAccountCommand,
  handleSubmitCommand,
} from "@/server/api/current-http";
import { getRunGateway } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const user = await getAuthenticatedUser();
  if (user) {
    return handleSubmitAccountCommand(request, user, runId, getRunGateway());
  }
  return handleSubmitCommand(request, runId, getRunGateway());
}
