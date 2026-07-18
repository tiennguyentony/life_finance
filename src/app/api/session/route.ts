import {
  handleDeleteSession,
  handleGetSession,
} from "@/server/api/current-http";
import { getRunGateway } from "@/server/api/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleGetSession(request, getRunGateway());
}

export function DELETE(request: Request): Response {
  return handleDeleteSession(request);
}
