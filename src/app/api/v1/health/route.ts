import { checkRuntimeReadiness } from "@/server/health/readiness";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const readiness = await checkRuntimeReadiness();
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
