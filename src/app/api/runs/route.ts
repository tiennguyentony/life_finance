import {
  handleCreateRun,
  handleListAccountRuns,
} from "@/server/api/current-http";
import { getOnboardingService, getRunRepository } from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authRequired(message: string): Response {
  return Response.json(
    { error: { code: "AUTH_REQUIRED", message } },
    { status: 401 },
  );
}

export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return authRequired("Sign in to view saved games.");
  return handleListAccountRuns(user, getRunRepository());
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return authRequired("Sign in to create a save.");
  return handleCreateRun(request, getOnboardingService(), {
    ownerUserId: user.userId,
  });
}
