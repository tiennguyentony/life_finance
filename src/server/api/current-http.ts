import { randomUUID } from "node:crypto";

import {
  getRun,
  submitCommand,
  type CommandRunner,
  type RunReader,
} from "@/application/game/use-cases";
import { commandIntentSchema } from "@/contracts/api/contracts";
import {
  assertSameOriginWrite,
  clearRunSessionCookie,
  parseRunSessionCookie,
  secureCookiesForEnvironment,
  serializeRunSessionCookie,
} from "@/server/auth/run-session";
import type { OnboardingDraftV1 } from "@/core/onboarding-v1-contracts";
import type { CreatedRunV2 } from "@/server/db/run-repository-contracts";
import { projectRunView } from "@/application/game/run-view";
import { ZodError } from "zod";

import {
  onboardingConfirmRequestV1Schema,
  onboardingParseRequestV1Schema,
  onboardingParseResponseV1Schema,
  onboardingReviewRequestV1Schema,
  onboardingReviewResponseV1Schema,
} from "@/contracts/api/onboarding";
import type { OnboardingService } from "./onboarding-service";
import type { OnboardingAiServiceV1 } from "@/server/ai/onboarding-service-v1";

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
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "REQUEST_FAILED";
  const status =
    code === "OPTIMISTIC_CONFLICT"
      ? 409
      : code === "NOT_FOUND_OR_UNAUTHORIZED"
        ? 401
        : 400;
  return jsonResponse(
    {
      error: {
        code,
        message: error instanceof Error ? error.message : "request failed",
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
  }> = {},
): Promise<Response> {
  const requestId = (options.requestIdFactory ?? randomUUID)();
  try {
    assertSameOriginWrite(request);
    const input = onboardingConfirmRequestV1Schema.parse(await readJson(request));
    const created = await service.confirm({
      draft: input.draft as OnboardingDraftV1,
      reviewChecksum: input.reviewChecksum,
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
