import {
  handleGetAccountTaxSummary,
  handleGetTaxSummary,
} from "@/server/api/current-http";
import {
  getDemoTaxSummaryReader,
  getTaxSummaryReader,
  isLocalDemoRun,
} from "@/server/api/runtime";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  if (isLocalDemoRun(runId)) {
    return handleGetTaxSummary(
      request,
      runId,
      getDemoTaxSummaryReader(),
    );
  }
  const user = await getAuthenticatedUser();
  if (user) {
    return handleGetAccountTaxSummary(
      user,
      runId,
      getTaxSummaryReader(),
    );
  }
  return handleGetTaxSummary(request, runId, getTaxSummaryReader());
}
