import {
  handleDeleteSession,
  handleGetAccountSession,
  handleGetSession,
} from "@/server/api/current-http";
import {
  getRunGateway,
  getRunRepository,
  isLocalDemoRun,
} from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";
import { parseRunSessionCookie } from "@/server/auth/run-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const capability = parseRunSessionCookie(request.headers.get("cookie"));
  if (capability && isLocalDemoRun(capability.runId)) {
    return handleGetSession(request, getRunGateway());
  }
  const user = await getAuthenticatedUser();
  if (user) {
    return handleGetAccountSession(user, getRunRepository(), getRunGateway());
  }
  return handleGetSession(request, getRunGateway());
}

export function DELETE(request: Request): Response {
  return handleDeleteSession(request);
}
