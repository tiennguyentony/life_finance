import {
  apiErrorResponseSchema,
  commandIntentSchema,
  commandResponseSchema,
  runViewResponseSchema,
  sessionResponseSchema,
  type CommandIntent,
  type CommandResponseWire,
  type RunViewResponseWire,
  type SessionResponse,
} from "@/contracts/api/contracts";
import {
  onboardingConfirmRequestV1Schema,
  onboardingReviewRequestV1Schema,
  onboardingReviewResponseV1Schema,
  type OnboardingReviewResponse,
} from "@/contracts/api/onboarding";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: readonly string[];

  constructor(
    status: number,
    code: string,
    message: string,
    options: Readonly<{
      requestId?: string;
      details?: readonly string[];
    }> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export class LifeFinanceClient {
  readonly #fetch: typeof fetch;

  constructor(fetchImplementation: typeof fetch = fetch) {
    this.#fetch = fetchImplementation;
  }

  async #request<T>(
    path: string,
    init: RequestInit,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    const response = await this.#fetch(path, {
      ...init,
      credentials: "same-origin",
    });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new ApiClientError(
        502,
        "RESPONSE_TOO_LARGE",
        "API response exceeded 2 MiB",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new ApiClientError(502, "INVALID_RESPONSE", "API returned invalid JSON");
    }
    if (!response.ok) {
      const parsed = apiErrorResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiClientError(
          response.status,
          "INVALID_RESPONSE",
          "API returned an invalid error response",
        );
      }
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        {
          requestId: parsed.data.error.requestId,
          details: parsed.data.error.details,
        },
      );
    }
    try {
      return schema.parse(body);
    } catch {
      throw new ApiClientError(
        502,
        "INVALID_RESPONSE",
        "API response failed validation",
      );
    }
  }

  getSession(): Promise<SessionResponse> {
    return this.#request(
      "/api/session",
      { method: "GET" },
      sessionResponseSchema,
    );
  }

  async deleteSession(): Promise<void> {
    const response = await this.#fetch("/api/session", {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 204) return;
    let body: unknown;
    try {
      body = JSON.parse(await response.text()) as unknown;
    } catch {
      throw new ApiClientError(
        response.status,
        "INVALID_RESPONSE",
        "API returned invalid JSON",
      );
    }
    const parsed = apiErrorResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiClientError(
        response.status,
        "INVALID_RESPONSE",
        "API returned an invalid error response",
      );
    }
    throw new ApiClientError(
      response.status,
      parsed.data.error.code,
      parsed.data.error.message,
      {
        requestId: parsed.data.error.requestId,
        details: parsed.data.error.details,
      },
    );
  }

  reviewOnboarding(
    request: Readonly<{ draft: unknown }>,
  ): Promise<OnboardingReviewResponse> {
    const body = onboardingReviewRequestV1Schema.parse(request);
    return this.#request(
      "/api/onboarding/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      onboardingReviewResponseV1Schema,
    );
  }

  createRun(
    request: Readonly<{ draft: unknown; reviewChecksum: string }>,
  ): Promise<RunViewResponseWire> {
    const body = onboardingConfirmRequestV1Schema.parse(request);
    return this.#request(
      "/api/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      runViewResponseSchema,
    );
  }

  createDemoRun(): Promise<RunViewResponseWire> {
    return this.#request(
      "/api/demo",
      { method: "POST" },
      runViewResponseSchema,
    );
  }

  submitCommand(
    runId: string,
    command: CommandIntent,
  ): Promise<CommandResponseWire> {
    const body = commandIntentSchema.parse(command);
    return this.#request(
      `/api/runs/${encodeURIComponent(runId)}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      commandResponseSchema,
    );
  }
}
