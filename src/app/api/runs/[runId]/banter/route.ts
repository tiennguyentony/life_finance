import {
  handleGenerateAccountCharacterBanter,
  handleGenerateCharacterBanter,
} from "@/server/api/current-http";
import {
  getCharacterBanterService,
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
  const writer = getCharacterBanterService();
  if (isLocalDemoRun(runId)) {
    return handleGenerateCharacterBanter(request, runId, reader, writer);
  }
  const user = await getAuthenticatedUser();
  if (user) {
    return handleGenerateAccountCharacterBanter(
      request,
      user,
      runId,
      getRunRepository(),
      reader,
      writer,
    );
  }
  return handleGenerateCharacterBanter(request, runId, reader, writer);
}
