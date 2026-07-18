import { randomUUID } from "node:crypto";

import {
  getRun,
  submitCommand,
  type CommandRunner,
  type RunReader,
} from "@/application/game/use-cases";
import { commandIntentSchema } from "@/contracts/api/contracts";
import { GameCommandError } from "@/core/commands";
import { DetailedFinanceError } from "@/core/detailed-actions-v2-contracts";
import { EventLifecycleV2Error } from "@/core/event-lifecycle-v2";
import { LifeMilestoneV2Error } from "@/core/life-milestones-v2";
import { RecurringStrategyError } from "@/core/recurring-strategy-v2";
import {
  assertSameOriginWrite,
  clearRunSessionCookie,
  parseRunSessionCookie,
  secureCookiesForEnvironment,
  serializeRunSessionCookie,
} from "@/server/auth/run-session";
import type { OnboardingDraftV1 } from "@/core/onboarding-v1-contracts";
import {
  RunRepositoryError,
  type CreatedRunV2,
} from "@/server/db/run-repository-contracts";
import { projectRunView } from "@/application/game/run-view";
import { ZodError } from "zod";

import {
  onboardingConfirmRequestV1Schema,
  onboardingParseRequestV1Schema,
  onboardingParseResponseV1Schema,
  onboardingReviewRequestV1Schema,
  onboardingReviewResponseV1Schema,
} from "@/contracts/api/onboarding";
import { RunApiV2Error } from "./errors";
import { OnboardingError, type OnboardingService } from "./onboarding-service";
import type { OnboardingAiServiceV1 } from "@/server/ai/onboarding-service-v1";
import { accountRunCredential } from "@/server/auth/account-run-credential";
import type { AuthenticatedUser } from "@/server/auth/supabase-user";

const MAX_REQUEST_BYTES = 64 * 1024;

type RequestIdFactory = () => string;

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

function publicErrorStatus(error: unknown): number | null {
  if (error instanceof RunRepositoryError) {
    if (error.code === "NOT_FOUND_OR_UNAUTHORIZED") return 401;
    if (
      error.code === "OPTIMISTIC_CONFLICT" ||
      error.code === "IDEMPOTENCY_MISMATCH"
    ) {
      return 409;
    }
    if (error.code === "INVALID_RUN_ID" || error.code === "INVALID_RANGE") {
      return 400;
    }
    return null;
  }
  if (error instanceof OnboardingError) {
    return error.code === "STALE_REVIEW" ? 409 : 400;
  }
  if (error instanceof RunApiV2Error) {
    if (error.code === "TAX_RESULT_UNUSABLE") return 502;
    if (
      error.code === "STALE_REVISION" ||
      error.code === "RUN_TERMINAL" ||
      error.code === "RUN_NOT_ACTIVE" ||
      error.code === "PENDING_EVENT" ||
      error.code === "TAX_CONTEXT_MISMATCH"
    ) {
      return 409;
    }
    return 400;
  }
  if (
    error instanceof GameCommandError ||
    error instanceof DetailedFinanceError ||
    error instanceof EventLifecycleV2Error ||
    error instanceof LifeMilestoneV2Error ||
    error instanceof RecurringStrategyError
  ) {
    return error.code === "STALE_REVISION" ||
      error.code === "DUPLICATE_COMMAND" ||
      error.code === "RUN_TERMINAL" ||
      error.code === "PENDING_EVENT_UNRESOLVED"
      ? 409
      : 400;
  }
  return null;
}

function failure(error: unknown, requestId: string): Response {
  if (
    error instanceof TypeError &&
    error.message === "state-changing API requests must be same-origin"
  ) {
    return jsonResponse(
      {
        error: {
          code: "ORIGIN_FORBIDDEN",
          message: error.message,
          requestId,
        },
      },
      403,
      requestId,
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "request body is invalid",
          details:
            error instanceof ZodError
              ? error.issues.map((issue) => issue.message)
              : undefined,
          requestId,
        },
      },
      400,
      requestId,
    );
  }
  if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
    return jsonResponse(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "request body exceeds 64 KiB",
          requestId,
        },
      },
      413,
      requestId,
    );
  }
  const status = publicErrorStatus(error);
  if (status === null) {
    // Keep internal details out of the response, but retain enough server-side
    // evidence to diagnose a failed request by its public request ID.
    console.error("Life Finance API request failed", { requestId, error });
    return jsonResponse(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The server could not complete the request.",
          requestId,
        },
      },
      500,
      requestId,
    );
  }
  const publicError = error as Error & { readonly code: string };
  return jsonResponse(
    {
      error: {
        code: publicError.code,
        message: publicError.message.trim().slice(0, 500) || "request failed",
        requestId,
      },
    },
    status,
    requestId,
  );
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  return JSON.parse(text) as unknown;
}

export function handleDeleteSession(
  request: Request,
  options: Readonly<{
    secureCookies?: boolean;
    requestIdFactory?: RequestIdFactory;
  }> = {},
): Response {
  const requestId = (options.requestIdFactory ?? randomUUID)();
  try {
    assertSameOriginWrite(request);
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearRunSessionCookie({
          secure:
            options.secureCookies ?? secureCookiesForEnvironment(),
        }),
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleReviewOnboarding(
  request: Request,
  service: Pick<OnboardingService, "review">,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    const input = onboardingReviewRequestV1Schema.parse(await readJson(request));
    const review = service.review(input.draft as OnboardingDraftV1);
    return jsonResponse(
      onboardingReviewResponseV1Schema.parse(review),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleParseOnboarding(
  request: Request,
  service: Pick<OnboardingAiServiceV1, "extract">,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    const input = onboardingParseRequestV1Schema.parse(await readJson(request));
    return jsonResponse(
      onboardingParseResponseV1Schema.parse(await service.extract(input.freeText)),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleCreateRun(
  request: Request,
  service: Pick<OnboardingService, "confirm">,
  options: Readonly<{
    secureCookies?: boolean;
    requestIdFactory?: RequestIdFactory;
    ownerUserId?: string;
  }> = {},
): Promise<Response> {
  const requestId = (options.requestIdFactory ?? randomUUID)();
  try {
    assertSameOriginWrite(request);
    const input = onboardingConfirmRequestV1Schema.parse(await readJson(request));
    const created = await service.confirm({
      draft: input.draft as OnboardingDraftV1,
      reviewChecksum: input.reviewChecksum,
      ...(options.ownerUserId ? { ownerUserId: options.ownerUserId } : {}),
    });
    const cookie = serializeRunSessionCookie(
      { runId: created.runId, accessSecret: created.accessSecret },
      {
        secure:
          options.secureCookies ?? secureCookiesForEnvironment(),
      },
    );
    return jsonResponse(
      {
        run: projectRunView(created.state),
        stateChecksum: created.stateChecksum,
      },
      201,
      requestId,
      { "Set-Cookie": cookie },
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

type OwnedRunSessionRepository = Readonly<{
  loadActiveOwnedRunId(ownerUserId: string): Promise<string | null>;
  claimRunV2(
    ownerUserId: string,
    runId: string,
    accessSecret: string,
  ): Promise<void>;
}>;

type OwnedRunSaveRepository = Readonly<{
  listOwnedRunsV2(ownerUserId: string): Promise<readonly Readonly<{
    runId: string;
    saveStatus: "active" | "archived";
    runStatus: "active" | "terminal";
    currentMonth: string;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
  }>[]>;
  activateOwnedRunV2(ownerUserId: string, runId: string): Promise<void>;
}>;

export async function handleListAccountRuns(
  user: AuthenticatedUser,
  repository: Pick<OwnedRunSaveRepository, "listOwnedRunsV2">,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    const saves = await repository.listOwnedRunsV2(user.userId);
    return jsonResponse(
      {
        saves: saves.map((save) => ({
          ...save,
          createdAt: save.createdAt.toISOString(),
          updatedAt: save.updatedAt.toISOString(),
        })),
      },
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleActivateAccountRun(
  request: Request,
  user: AuthenticatedUser,
  runId: string,
  repository: Pick<OwnedRunSaveRepository, "activateOwnedRunV2">,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    await repository.activateOwnedRunV2(user.userId, runId);
    return jsonResponse({ activeRunId: runId }, 200, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleGetAccountSession(
  user: AuthenticatedUser,
  repository: Pick<OwnedRunSessionRepository, "loadActiveOwnedRunId">,
  service: RunReader,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    const runId = await repository.loadActiveOwnedRunId(user.userId);
    if (!runId) {
      return jsonResponse(
        { account: { userId: user.userId }, session: null },
        200,
        requestId,
      );
    }
    const session = await getRun(
      service,
      runId,
      accountRunCredential(user.userId),
    );
    return jsonResponse(
      { account: { userId: user.userId }, session },
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleClaimAccountSession(
  request: Request,
  user: AuthenticatedUser,
  repository: OwnedRunSessionRepository,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    const session = parseRunSessionCookie(request.headers.get("cookie"));
    if (session) {
      await repository.claimRunV2(
        user.userId,
        session.runId,
        session.accessSecret,
      );
    }
    const runId = await repository.loadActiveOwnedRunId(user.userId);
    return jsonResponse({ claimed: session !== null, runId }, 200, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleGetAccountRun(
  user: AuthenticatedUser,
  runId: string,
  service: RunReader,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    return jsonResponse(
      await getRun(service, runId, accountRunCredential(user.userId)),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleSubmitAccountCommand(
  request: Request,
  user: AuthenticatedUser,
  runId: string,
  repository: Pick<OwnedRunSessionRepository, "loadActiveOwnedRunId">,
  service: CommandRunner,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    if (await repository.loadActiveOwnedRunId(user.userId) !== runId) {
      throw new RunApiV2Error(
        "RUN_NOT_ACTIVE",
        "activate this saved game before making changes",
      );
    }
    const intent = commandIntentSchema.parse(await readJson(request));
    return jsonResponse(
      await submitCommand(
        service,
        runId,
        accountRunCredential(user.userId),
        intent,
      ),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleCreateDemoRun(
  request: Request,
  createRun: () => Promise<CreatedRunV2>,
  options: Readonly<{
    enabled: boolean;
    secureCookies?: boolean;
    requestIdFactory?: RequestIdFactory;
  }>,
): Promise<Response> {
  const requestId = (options.requestIdFactory ?? randomUUID)();
  if (!options.enabled) {
    return jsonResponse(
      {
        error: {
          code: "NOT_FOUND",
          message: "local demo is available only in development",
          requestId,
        },
      },
      404,
      requestId,
    );
  }
  try {
    assertSameOriginWrite(request);
    const created = await createRun();
    const cookie = serializeRunSessionCookie(
      { runId: created.runId, accessSecret: created.accessSecret },
      {
        secure:
          options.secureCookies ?? secureCookiesForEnvironment(),
      },
    );
    return jsonResponse(
      {
        run: projectRunView(created.state),
        stateChecksum: created.stateChecksum,
      },
      201,
      requestId,
      { "Set-Cookie": cookie },
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleGetSession(
  request: Request,
  service: RunReader,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  const session = parseRunSessionCookie(request.headers.get("cookie"));
  if (!session) return jsonResponse({ session: null }, 200, requestId);
  try {
    const response = await getRun(
      service,
      session.runId,
      session.accessSecret,
    );
    return jsonResponse({ session: response }, 200, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleGetRun(
  request: Request,
  runId: string,
  service: RunReader,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  const session = parseRunSessionCookie(request.headers.get("cookie"));
  if (!session || session.runId !== runId) {
    return jsonResponse(
      {
        error: {
          code: "SESSION_REQUIRED",
          message: "an active run session is required",
          requestId,
        },
      },
      401,
      requestId,
    );
  }
  try {
    return jsonResponse(
      await getRun(service, runId, session.accessSecret),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function handleSubmitCommand(
  request: Request,
  runId: string,
  service: CommandRunner,
  requestIdFactory: RequestIdFactory = randomUUID,
): Promise<Response> {
  const requestId = requestIdFactory();
  try {
    assertSameOriginWrite(request);
    const session = parseRunSessionCookie(request.headers.get("cookie"));
    if (!session || session.runId !== runId) {
      return jsonResponse(
        {
          error: {
            code: "SESSION_REQUIRED",
            message: "an active run session is required",
            requestId,
          },
        },
        401,
        requestId,
      );
    }
    const intent = commandIntentSchema.parse(await readJson(request));
    return jsonResponse(
      await submitCommand(
        service,
        runId,
        session.accessSecret,
        intent,
      ),
      200,
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}
