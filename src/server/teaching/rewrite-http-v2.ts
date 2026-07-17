import { extractRunSecret, RunSecretError } from "../auth/run-secret";
import { RunRepositoryError } from "../db/run-repository";
import { teachingRewriteApiRequestV2Schema } from "./rewrite-contracts-v2";
import {
  TeachingRewriteServiceV2,
  TeachingRewriteServiceV2Error,
} from "./rewrite-service-v2";

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handlePostTeachingRewriteV2(
  request: Request,
  runId: string,
  service: TeachingRewriteServiceV2,
): Promise<Response> {
  try {
    const parsed = teachingRewriteApiRequestV2Schema.safeParse(await request.json());
    if (!parsed.success) {
      return response({ error: { code: "INVALID_REQUEST", message: "valid rewrite request is required" } }, 400);
    }
    const secret = extractRunSecret(request.headers.get("authorization"));
    return response(await service.rewrite(runId, secret, parsed.data), 200);
  } catch (error) {
    if (error instanceof RunSecretError) {
      return response({ error: { code: "NOT_FOUND_OR_UNAUTHORIZED", message: "run was not found or the credential is invalid" } }, 401);
    }
    if (error instanceof TeachingRewriteServiceV2Error) {
      return response(
        { error: { code: error.code, message: error.message } },
        error.code === "STALE_REVISION" ? 409 : 400,
      );
    }
    if (error instanceof RunRepositoryError) {
      return response(
        { error: { code: error.code, message: error.message } },
        error.code === "NOT_FOUND_OR_UNAUTHORIZED" ? 401 : 409,
      );
    }
    return response({ error: { code: "INTERNAL_ERROR", message: "request could not be completed" } }, 500);
  }
}
