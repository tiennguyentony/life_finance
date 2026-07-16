import { GameCommandError } from "../../core/commands";
import { DetailedFinanceError } from "../../core/detailed-actions-v2";
import { EventLifecycleV2Error } from "../../core/event-lifecycle-v2";
import { InvalidGameStateError } from "../../core/game-state";
import { MonthlyTurnV2Error } from "../../core/monthly-turn-v2";
import { NativeGameStateV2Error } from "../../core/native-game-state-v2";
import { RecurringStrategyError } from "../../core/recurring-strategy-v2";
import { ScenarioCatalogError } from "../../core/scenario-catalog";
import { RunSecretError, extractRunSecret } from "../auth/run-secret";
import { RunRepositoryError } from "../db/run-repository";
import { TaxServiceError } from "../tax/client";
import {
  apiErrorSchema,
  getRunResponseSchema,
  runIdPathSchema,
} from "./contracts";
import type { RunApiService } from "./service";
import {
  advanceTimeV2RequestSchema,
  advanceTimeV2ResponseSchema,
  commandV2ResponseSchema,
  checkpointV2QuerySchema,
  checkpointV2ResponseSchema,
  createRunV2RequestSchema,
  createRunV2ResponseSchema,
  gameCommandV2PublicSchema,
  getRunV2ResponseSchema,
  migrateRunV2ResponseSchema,
  runIdV2PathSchema,
} from "./contracts-v2";
import type { RunApiServiceV2 } from "./service-v2";
import { RunApiV2Error } from "./v2/errors";
import { AiEducationError, AiEducationService } from "../ai/education-service";
import { aiExplanationApiRequestSchema } from "../ai/education-contracts";
import { AiWorldDirectorError, AiWorldDirectorService } from "../ai/world-director-service";
import { aiWorldEventApiRequestSchema } from "../ai/world-director-contracts";
import { AiDebriefError, AiDebriefService } from "../ai/debrief-service";
import { aiDebriefApiRequestSchema } from "../ai/debrief-contracts";

const MAX_REQUEST_BYTES = 64 * 1024;

class HttpInputError extends Error {
  readonly code: "INVALID_JSON" | "PAYLOAD_TOO_LARGE";

  constructor(code: HttpInputError["code"], message: string) {
    super(message);
    this.name = "HttpInputError";
    this.code = code;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
    throw new HttpInputError("PAYLOAD_TOO_LARGE", "request body exceeds 64 KiB");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new HttpInputError("PAYLOAD_TOO_LARGE", "request body exceeds 64 KiB");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpInputError("INVALID_JSON", "request body must be valid JSON");
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function handleDeprecatedLegacyWrite(): Response {
  return jsonResponse(
    apiErrorSchema.parse({
      error: {
        code: "STATE_SCHEMA_DEPRECATED",
        message: "Legacy state is read-only; create or migrate a v2 run.",
      },
    }),
    410,
  );
}

function errorResponse(error: unknown): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "The request could not be completed";
  let details: string[] | undefined;

  if (error && typeof error === "object" && "issues" in error) {
    status = 400;
    code = "INVALID_REQUEST";
    message = "Request validation failed";
    details = (error as { issues: readonly { path: PropertyKey[]; message: string }[] }).issues.map(
      (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
    );
  } else if (error instanceof HttpInputError) {
    status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    code = error.code;
    message = error.message;
  } else if (error instanceof InvalidGameStateError) {
    status = 400;
    code = "INVALID_INITIAL_STATE";
    message = "Initial state violates financial invariants";
    details = error.violations.map(
      (violation) => `${violation.path}: ${violation.message}`,
    );
  } else if (error instanceof RunSecretError) {
    status = 401;
    code = "NOT_FOUND_OR_UNAUTHORIZED";
    message = "Run was not found or the credential is invalid";
  } else if (error instanceof RunRepositoryError) {
    code = error.code;
    if (error.code === "NOT_FOUND_OR_UNAUTHORIZED") {
      status = 401;
      message = "Run was not found or the credential is invalid";
    } else if (
      error.code === "IDEMPOTENCY_MISMATCH" ||
      error.code === "OPTIMISTIC_CONFLICT"
    ) {
      status = 409;
      message = error.message;
    } else if (error.code === "INVALID_RUN_ID") {
      status = 400;
      message = error.message;
    }
  } else if (error instanceof GameCommandError) {
    code = error.code;
    status =
      error.code === "DUPLICATE_COMMAND" || error.code === "STALE_REVISION"
        ? 409
        : 400;
    message = error.message;
  } else if (
    error instanceof DetailedFinanceError ||
    error instanceof EventLifecycleV2Error ||
    error instanceof RecurringStrategyError ||
    error instanceof MonthlyTurnV2Error
  ) {
    code = error.code;
    status = [
      "DUPLICATE_COMMAND",
      "STALE_REVISION",
      "RUN_TERMINAL",
      "PENDING_EVENT",
      "PENDING_EVENT_EXISTS",
      "PENDING_EVENT_UNRESOLVED",
      "EVENT_MISMATCH",
      "NO_PENDING_EVENT",
    ].includes(
      error.code,
    )
      ? 409
      : 400;
    message = error.message;
  } else if (
    error instanceof NativeGameStateV2Error ||
    error instanceof ScenarioCatalogError
  ) {
    status = 400;
    code = error instanceof NativeGameStateV2Error ? error.code : "INVALID_SCENARIO";
    message = error.message;
  } else if (error instanceof RunApiV2Error) {
    code = error.code;
    status = [
      "STALE_REVISION",
      "INVALID_EFFECTIVE_MONTH",
      "RUN_TERMINAL",
      "PENDING_EVENT",
    ].includes(
      error.code,
    )
      ? 409
      : 502;
    message = error.message;
  } else if (error instanceof AiEducationError) {
    code = error.code;
    status = error.code === "STALE_REVISION" ? 409 : 400;
    message = error.message;
  } else if (error instanceof AiWorldDirectorError) {
    code = error.code;
    status = 409;
    message = error.message;
  } else if (error instanceof AiDebriefError) {
    code = error.code;
    status = 409;
    message = error.message;
  } else if (error instanceof TaxServiceError) {
    code = `TAX_${error.code}`;
    status = error.retryable ? 503 : error.code === "INVALID_CONFIGURATION" ? 500 : 502;
    message = error.retryable
      ? "Tax calculation is temporarily unavailable"
      : "Tax calculation could not be completed";
  }

  const body = apiErrorSchema.parse({
    error: { code, message, ...(details ? { details } : {}) },
  });
  return jsonResponse(body, status);
}

export async function handleAiExplanationV2(
  request: Request,
  runId: string,
  service: AiEducationService,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const input = aiExplanationApiRequestSchema.parse(await readJson(request));
    return jsonResponse(await service.explain(path.runId, secret, input), 200);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAiWorldEventV2(
  request: Request,
  runId: string,
  service: AiWorldDirectorService,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const input = aiWorldEventApiRequestSchema.parse(await readJson(request));
    return jsonResponse(await service.createEvent(path.runId, secret, input), 200);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAiDebriefV2(
  request: Request,
  runId: string,
  service: AiDebriefService,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const input = aiDebriefApiRequestSchema.parse(await readJson(request));
    return jsonResponse(await service.createDebrief(path.runId, secret, input), 200);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreateRun(
  _request: Request,
  _service: RunApiService,
): Promise<Response> {
  void _request;
  void _service;
  return handleDeprecatedLegacyWrite();
}

export async function handleGetRun(
  request: Request,
  runId: string,
  service: RunApiService,
): Promise<Response> {
  try {
    const path = runIdPathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    return jsonResponse(
      getRunResponseSchema.parse(await service.getRun(path.runId, secret)),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSubmitCommand(
  _request: Request,
  _runId: string,
  _service: RunApiService,
): Promise<Response> {
  void _request;
  void _runId;
  void _service;
  return handleDeprecatedLegacyWrite();
}

export async function handleCreateRunV2(
  request: Request,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const input = createRunV2RequestSchema.parse(await readJson(request));
    return jsonResponse(
      createRunV2ResponseSchema.parse(await service.createRun(input)),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetRunV2(
  request: Request,
  runId: string,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    return jsonResponse(
      getRunV2ResponseSchema.parse(await service.getRun(path.runId, secret)),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSubmitCommandV2(
  request: Request,
  runId: string,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const command = gameCommandV2PublicSchema.parse(await readJson(request));
    return jsonResponse(
      commandV2ResponseSchema.parse(
        await service.submitCommand(path.runId, secret, command),
      ),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAdvanceTimeV2(
  request: Request,
  runId: string,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const input = advanceTimeV2RequestSchema.parse(await readJson(request));
    return jsonResponse(
      advanceTimeV2ResponseSchema.parse(
        await service.advanceTime(path.runId, secret, input),
      ),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleMigrateRunV2(
  request: Request,
  runId: string,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    return jsonResponse(
      migrateRunV2ResponseSchema.parse(
        await service.migrateRun(path.runId, secret),
      ),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetCheckpointV2(
  request: Request,
  runId: string,
  service: RunApiServiceV2,
): Promise<Response> {
  try {
    const path = runIdV2PathSchema.parse({ runId });
    const secret = extractRunSecret(request.headers.get("authorization"));
    const url = new URL(request.url);
    const query = checkpointV2QuerySchema.parse({
      fromRevision: url.searchParams.get("fromRevision"),
    });
    return jsonResponse(
      checkpointV2ResponseSchema.parse(
        await service.getCheckpoint(path.runId, secret, query.fromRevision),
      ),
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
