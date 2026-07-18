import { handleCreateDemoRun } from "@/server/api/current-http";
import {
  getLocalDemoRuntime,
  isLocalDemoEnabled,
} from "@/server/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleCreateDemoRun(
    request,
    () => getLocalDemoRuntime().createRun(),
    { enabled: isLocalDemoEnabled() },
  );
}
