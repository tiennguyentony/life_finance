import { CURRENT_OPENAPI_DOCUMENT } from "@/contracts/api/openapi";

export function GET(): Response {
  return Response.json(CURRENT_OPENAPI_DOCUMENT, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
