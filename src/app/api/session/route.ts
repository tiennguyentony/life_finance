import {
  handleDeleteSession,
  handleGetAccountSession,
  handleGetSession,
} from "@/server/api/current-http";
import { getRunGateway, getRunRepository } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (user) {
    return handleGetAccountSession(user, getRunRepository(), getRunGateway());
  }
  return handleGetSession(request, getRunGateway());
}

export function DELETE(request: Request): Response {
  return handleDeleteSession(request);
}
