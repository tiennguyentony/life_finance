import { generateOpenApiDocument } from "@/server/api/openapi";

export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(generateOpenApiDocument(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
