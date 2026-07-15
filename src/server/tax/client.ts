import {
  taxCalculationRequestSchema,
  taxCalculationResultSchema,
  type TaxCalculationRequest,
  type TaxCalculationResult,
} from "./contracts";
import {
  deflateRequestToFrozenPolicy,
  inflateResultToEconomicYear,
} from "./projection";

const MAX_RESPONSE_BYTES = 1_000_000;

export interface TaxCalculator {
  calculate(request: TaxCalculationRequest): Promise<TaxCalculationResult>;
}

export type TaxServiceErrorCode =
  | "INVALID_CONFIGURATION"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "HOUSEHOLD_REJECTED"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_RESPONSE";

export class TaxServiceError extends Error {
  readonly code: TaxServiceErrorCode;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(
    code: TaxServiceErrorCode,
    message: string,
    options: { readonly retryable: boolean; readonly cause?: unknown },
  ) {
    super(message);
    this.name = "TaxServiceError";
    this.code = code;
    this.retryable = options.retryable;
    this.cause = options.cause;
  }
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TaxServiceClientOptions = Readonly<{
  baseUrl: string;
  serviceToken: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fetch?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

function validateOptions(options: TaxServiceClientOptions): {
  baseUrl: URL;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
} {
  let baseUrl: URL;
  try {
    baseUrl = new URL(options.baseUrl);
  } catch (cause) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "TAX_SERVICE_URL must be an absolute URL",
      { retryable: false, cause },
    );
  }
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "TAX_SERVICE_URL must be a clean HTTP(S) origin or path",
      { retryable: false },
    );
  }
  if (options.serviceToken.length < 32) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "TAX_SERVICE_TOKEN must contain at least 32 characters",
      { retryable: false },
    );
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 100;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "tax timeout must be an integer from 1 through 300,000 milliseconds",
      { retryable: false },
    );
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "tax attempts must be an integer from 1 through 5",
      { retryable: false },
    );
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "tax retry delay must be a non-negative safe integer",
      { retryable: false },
    );
  }

  return { baseUrl, timeoutMs, maxAttempts, retryDelayMs };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class PolicyEngineTaxClient implements TaxCalculator {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: number;
  readonly #fetch: FetchLike;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: TaxServiceClientOptions) {
    const validated = validateOptions(options);
    this.#endpoint = new URL("v1/calculate", ensureTrailingSlash(validated.baseUrl));
    this.#serviceToken = options.serviceToken;
    this.#timeoutMs = validated.timeoutMs;
    this.#maxAttempts = validated.maxAttempts;
    this.#retryDelayMs = validated.retryDelayMs;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  async calculate(request: TaxCalculationRequest): Promise<TaxCalculationResult> {
    const originalRequest = taxCalculationRequestSchema.parse(request);
    const policyRequest = deflateRequestToFrozenPolicy(originalRequest);
    let lastFailure: TaxServiceError | undefined;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        const frozenResult = await this.#calculateOnce(policyRequest);
        return inflateResultToEconomicYear(frozenResult, originalRequest);
      } catch (error) {
        const failure = normalizeFailure(error);
        lastFailure = failure;
        if (!failure.retryable || attempt === this.#maxAttempts) throw failure;
        await this.#sleep(this.#retryDelayMs * 2 ** (attempt - 1));
      }
    }

    throw (
      lastFailure ??
      new TaxServiceError("SERVICE_UNAVAILABLE", "tax service failed", {
        retryable: true,
      })
    );
  }

  async #calculateOnce(
    request: TaxCalculationRequest,
  ): Promise<TaxCalculationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new TaxServiceError("TIMEOUT", "tax service request timed out", {
          retryable: true,
          cause,
        });
      }
      throw new TaxServiceError(
        "SERVICE_UNAVAILABLE",
        "tax service could not be reached",
        { retryable: true, cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new TaxServiceError(
        "UNAUTHORIZED",
        "tax service rejected server authorization",
        { retryable: false },
      );
    }
    if (response.status === 422) {
      throw new TaxServiceError(
        "HOUSEHOLD_REJECTED",
        "tax service rejected the household calculation",
        { retryable: false },
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new TaxServiceError(
        "SERVICE_UNAVAILABLE",
        `tax service returned transient status ${response.status}`,
        { retryable: true },
      );
    }
    if (!response.ok) {
      throw new TaxServiceError(
        "SERVICE_UNAVAILABLE",
        `tax service returned unexpected status ${response.status}`,
        { retryable: false },
      );
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new TaxServiceError(
        "INVALID_RESPONSE",
        "tax service response exceeded the size limit",
        { retryable: false },
      );
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
      throw new TaxServiceError(
        "INVALID_RESPONSE",
        "tax service response exceeded the size limit",
        { retryable: false },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (cause) {
      throw new TaxServiceError(
        "INVALID_RESPONSE",
        "tax service returned invalid JSON",
        { retryable: false, cause },
      );
    }
    const parsed = taxCalculationResultSchema.safeParse(json);
    if (!parsed.success) {
      throw new TaxServiceError(
        "INVALID_RESPONSE",
        "tax service returned a response outside the versioned contract",
        { retryable: false, cause: parsed.error },
      );
    }
    return parsed.data;
  }
}

function ensureTrailingSlash(url: URL): URL {
  const normalized = new URL(url);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized;
}

function normalizeFailure(error: unknown): TaxServiceError {
  if (error instanceof TaxServiceError) return error;
  return new TaxServiceError(
    "INVALID_RESPONSE",
    "tax calculation failed contract validation",
    { retryable: false, cause: error },
  );
}

export function createTaxClientFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PolicyEngineTaxClient {
  const baseUrl = environment.TAX_SERVICE_URL;
  const serviceToken = environment.TAX_SERVICE_TOKEN;
  if (!baseUrl || !serviceToken) {
    throw new TaxServiceError(
      "INVALID_CONFIGURATION",
      "TAX_SERVICE_URL and TAX_SERVICE_TOKEN are required",
      { retryable: false },
    );
  }
  return new PolicyEngineTaxClient({ baseUrl, serviceToken });
}
