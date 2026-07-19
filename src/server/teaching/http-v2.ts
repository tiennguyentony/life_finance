import { extractRunSecret, RunSecretError } from "../auth/run-secret";
import { counterfactualV1RequestSchema } from "../api/contracts-v2";
import { RunRepositoryError } from "../db/run-repository";
import { TeachingServiceV2, TeachingServiceV2Error } from "./service-v2";

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseRevision(value: string | null): number | null {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function handleGetTeachingCheckpointV2(
  request: Request,
  runId: string,
  service: TeachingServiceV2,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const expectedRevision = parseRevision(url.searchParams.get("expectedRevision"));
    const fromRevision = parseRevision(url.searchParams.get("fromRevision"));
    const trailingMonths = parseRevision(url.searchParams.get("trailingMonths"));
    if (
      expectedRevision === null ||
      (fromRevision === null) === (trailingMonths === null)
    ) {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid revisions are required" } },
        400,
      );
    }
    const accessSecret = extractRunSecret(request.headers.get("authorization"));
    return response(
      await service.getCheckpoint(runId, accessSecret, {
        expectedRevision,
        ...(fromRevision === null ? { trailingMonths: trailingMonths! } : { fromRevision }),
      }),
      200,
    );
  } catch (error) {
    if (error instanceof RunSecretError) {
      return response(
        {
          error: {
            code: "NOT_FOUND_OR_UNAUTHORIZED",
            message: "run was not found or the credential is invalid",
          },
        },
        401,
      );
    }
    if (error instanceof TeachingServiceV2Error) {
      return response(
        { error: { code: error.code, message: error.message } },
        error.code === "STALE_REVISION" ? 409 : 400,
      );
    }
    if (error instanceof RunRepositoryError) {
      const unauthorized = error.code === "NOT_FOUND_OR_UNAUTHORIZED";
      return response(
        { error: { code: error.code, message: error.message } },
        unauthorized ? 401 : error.code === "CORRUPT_STATE" ? 500 : 409,
      );
    }
    return response(
      { error: { code: "INTERNAL_ERROR", message: "request could not be completed" } },
      500,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function handlePostTeachingMomentV2(
  request: Request,
  runId: string,
  service: TeachingServiceV2,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid teaching request is required" } },
        400,
      );
    }
    const expectedKeys = body.trigger === "requested_help"
      ? ["conceptId", "expectedRevision", "trigger"]
      : ["expectedRevision", "trigger"];
    if (
      Object.keys(body).sort().join(",") !== expectedKeys.sort().join(",") ||
      typeof body.expectedRevision !== "number" ||
      (body.trigger !== "automatic" && body.trigger !== "requested_help") ||
      (body.trigger === "requested_help" && typeof body.conceptId !== "string")
    ) {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid teaching request is required" } },
        400,
      );
    }
    const accessSecret = extractRunSecret(request.headers.get("authorization"));
    return response(
      await service.getMoment(runId, accessSecret, {
        expectedRevision: body.expectedRevision,
        trigger: body.trigger,
        ...(body.trigger === "requested_help" ? { conceptId: body.conceptId as string } : {}),
      }),
      200,
    );
  } catch (error) {
    if (error instanceof RunSecretError) {
      return response(
        { error: { code: "NOT_FOUND_OR_UNAUTHORIZED", message: "run was not found or the credential is invalid" } },
        401,
      );
    }
    if (error instanceof TeachingServiceV2Error) {
      return response(
        { error: { code: error.code, message: error.message } },
        error.code === "STALE_REVISION" ? 409 : 400,
      );
    }
    if (error instanceof RunRepositoryError) {
      const unauthorized = error.code === "NOT_FOUND_OR_UNAUTHORIZED";
      return response(
        { error: { code: error.code, message: error.message } },
        unauthorized ? 401 : error.code === "CORRUPT_STATE" ? 500 : 409,
      );
    }
    return response(
      { error: { code: "INTERNAL_ERROR", message: "request could not be completed" } },
      500,
    );
  }
}

export async function handlePostTeachingDebriefV2(
  request: Request,
  runId: string,
  service: TeachingServiceV2,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      Object.keys(body).sort().join(",") !== "counterfactuals,expectedRevision" ||
      typeof body.expectedRevision !== "number" ||
      !Array.isArray(body.counterfactuals) ||
      body.counterfactuals.length > 2
    ) {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid debrief request is required" } },
        400,
      );
    }
    const counterfactuals = body.counterfactuals.map((value) =>
      counterfactualV1RequestSchema.safeParse(value),
    );
    if (counterfactuals.some((result) => !result.success)) {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid counterfactual requests are required" } },
        400,
      );
    }
    const accessSecret = extractRunSecret(request.headers.get("authorization"));
    const parsedCounterfactuals = counterfactuals.map((result) => {
      if (!result.success) throw new TeachingServiceV2Error("INVALID_REQUEST");
      return result.data;
    });
    return response(
      await service.getDebrief(runId, accessSecret, {
        expectedRevision: body.expectedRevision,
        counterfactuals: parsedCounterfactuals,
      }),
      200,
    );
  } catch (error) {
    if (error instanceof RunSecretError) {
      return response(
        { error: { code: "NOT_FOUND_OR_UNAUTHORIZED", message: "run was not found or the credential is invalid" } },
        401,
      );
    }
    if (error instanceof TeachingServiceV2Error) {
      return response(
        { error: { code: error.code, message: error.message } },
        error.code === "STALE_REVISION" ? 409 : 400,
      );
    }
    if (error instanceof RunRepositoryError) {
      const unauthorized = error.code === "NOT_FOUND_OR_UNAUTHORIZED";
      return response(
        { error: { code: error.code, message: error.message } },
        unauthorized ? 401 : error.code === "CORRUPT_STATE" ? 500 : 409,
      );
    }
    return response(
      { error: { code: "INTERNAL_ERROR", message: "request could not be completed" } },
      500,
    );
  }
}
