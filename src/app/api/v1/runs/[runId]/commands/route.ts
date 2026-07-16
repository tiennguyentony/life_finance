import { handleDeprecatedLegacyWrite } from "@/server/api/http";

export const runtime = "nodejs";

export function POST(): Response {
  return handleDeprecatedLegacyWrite();
}
