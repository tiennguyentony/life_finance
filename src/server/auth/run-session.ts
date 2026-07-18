import { isRunSecret } from "./run-secret";

export const RUN_SESSION_COOKIE = "life_finance_run";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RunSession = Readonly<{
  runId: string;
  accessSecret: string;
}>;

type CookieOptions = Readonly<{
  secure: boolean;
  maxAgeSeconds?: number;
}>;

function encodeSession(session: RunSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function cookieAttributes(options: CookieOptions): string {
  return [
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    options.secure ? "Secure" : null,
  ]
    .filter((value): value is string => value !== null)
    .join("; ");
}

export function serializeRunSessionCookie(
  session: RunSession,
  options: CookieOptions,
): string {
  if (!UUID_PATTERN.test(session.runId) || !isRunSecret(session.accessSecret)) {
    throw new TypeError("run session is invalid");
  }
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (!Number.isInteger(maxAge) || maxAge <= 0) {
    throw new TypeError("run session max age must be a positive integer");
  }
  return `${RUN_SESSION_COOKIE}=${encodeSession(session)}; Max-Age=${maxAge}; ${cookieAttributes(options)}`;
}

export function clearRunSessionCookie(options: Pick<CookieOptions, "secure">): string {
  return `${RUN_SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(options)}`;
}

export function parseRunSessionCookie(cookieHeader: string | null): RunSession | null {
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${RUN_SESSION_COOKIE}=`));
  if (!pair) return null;
  const encoded = pair.slice(RUN_SESSION_COOKIE.length + 1);
  try {
    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<RunSession>;
    if (
      typeof value.runId !== "string" ||
      !UUID_PATTERN.test(value.runId) ||
      typeof value.accessSecret !== "string" ||
      !isRunSecret(value.accessSecret)
    ) {
      return null;
    }
    return Object.freeze({
      runId: value.runId,
      accessSecret: value.accessSecret,
    });
  } catch {
    return null;
  }
}

export function assertSameOriginWrite(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new TypeError("state-changing API requests must be same-origin");
  }
}

export function secureCookiesForEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.NODE_ENV === "production";
}
