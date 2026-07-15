import { handleCreateRun } from "@/server/api/http";
import { getRunApiService } from "@/server/api/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleCreateRun(request, getRunApiService());
}
