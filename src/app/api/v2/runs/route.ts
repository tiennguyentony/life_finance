import { handleCreateRunV2 } from "@/server/api/http";
import { getRunApiServiceV2 } from "@/server/api/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleCreateRunV2(request, getRunApiServiceV2());
}
