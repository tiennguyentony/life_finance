import { accountRunCredential } from "../auth/account-run-credential";
import { parseRunSessionCookie } from "../auth/run-session";
import type { AuthenticatedUser } from "../auth/supabase-user";
import { RunRepositoryError } from "../db/run-repository";
import { TeachingServiceV2, TeachingServiceV2Error } from "./service-v2";

/**
 * Account-authenticated entry points for the teaching services.
 *
 * `http-v2.ts` authenticates with a bearer run secret, which is the legacy
 * credential. Money HQ runs on Supabase session cookies, so these wrappers
 * translate the signed-in user into the account credential the repository
 * already understands and reuse the same service.
 */

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(error: unknown): Response {
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

function parseRevision(value: string | null): number | null {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Credential for a run the browser owns through a session rather than a bearer
 * secret: the account bridge when signed in, otherwise the demo capability
 * cookie. Returns null when neither identifies this run.
 */
export function sessionRunCredential(
  request: Request,
  user: AuthenticatedUser | null,
  runId: string,
): string | null {
  if (user) return accountRunCredential(user.userId);
  const session = parseRunSessionCookie(request.headers.get("cookie"));
  return session && session.runId === runId ? session.accessSecret : null;
}

function unauthorized(): Response {
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

export async function handleGetAccountTeachingCheckpointV2(
  request: Request,
  user: AuthenticatedUser | null,
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
    const credential = sessionRunCredential(request, user, runId);
    if (credential === null) return unauthorized();
    return response(
      await service.getCheckpoint(runId, credential, {
        expectedRevision,
        ...(fromRevision === null ? { trailingMonths: trailingMonths! } : { fromRevision }),
      }),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function handlePostAccountTeachingDebriefV2(
  request: Request,
  user: AuthenticatedUser | null,
  runId: string,
  service: TeachingServiceV2,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.expectedRevision !== "number") {
      return response(
        { error: { code: "INVALID_REQUEST", message: "valid debrief request is required" } },
        400,
      );
    }
    const credential = sessionRunCredential(request, user, runId);
    if (credential === null) return unauthorized();
    // The service derives a deterministic counterfactual when none is supplied,
    // so this surface deliberately does not accept client-chosen interventions.
    return response(
      await service.getDebrief(runId, credential, {
        expectedRevision: body.expectedRevision,
        counterfactuals: [],
      }),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
