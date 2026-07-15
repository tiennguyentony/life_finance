import {
  apiErrorSchema,
  commandResponseSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  gameCommandSchema,
  getRunResponseSchema,
  runIdPathSchema,
  type CommandRequest,
  type CommandResponse,
  type CreateRunRequest,
  type CreateRunResponse,
  type GetRunResponse,
} from "./contracts";
import { isRunSecret } from "../auth/run-secret";
import {
  commandV2ResponseSchema,
  createRunV2RequestSchema,
  createRunV2ResponseSchema,
  gameCommandV2PublicSchema,
  getRunV2ResponseSchema,
  runIdV2PathSchema,
  type CommandV2Response,
  type CreateRunV2Request,
  type CreateRunV2Response,
  type GameCommandV2Public,
  type GetRunV2Response,
} from "./contracts-v2";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class LifeFinanceApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: readonly string[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: readonly string[],
  ) {
    super(message);
    this.name = "LifeFinanceApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class LifeFinanceApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchImplementation: typeof fetch = fetch) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new TypeError("API base URL must use HTTP or HTTPS");
    }
    this.#baseUrl = parsed.toString().replace(/\/$/, "");
    this.#fetch = fetchImplementation;
  }

  async #request<T>(
    path: string,
    responseSchema: { parse(value: unknown): T },
    init: RequestInit,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, init);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new LifeFinanceApiError(502, "RESPONSE_TOO_LARGE", "API response exceeded 2 MiB");
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new LifeFinanceApiError(502, "INVALID_RESPONSE", "API returned invalid JSON");
    }
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      if (!parsed.success) {
        throw new LifeFinanceApiError(
          response.status,
          "INVALID_RESPONSE",
          "API returned an invalid error response",
        );
      }
      throw new LifeFinanceApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    try {
      return responseSchema.parse(body);
    } catch {
      throw new LifeFinanceApiError(502, "INVALID_RESPONSE", "API response failed validation");
    }
  }

  async createRun(request: CreateRunRequest): Promise<CreateRunResponse> {
    const body = createRunRequestSchema.parse(request);
    return this.#request("/api/v1/runs", createRunResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  #authorization(accessSecret: string): { Authorization: string } {
    if (!isRunSecret(accessSecret)) {
      throw new LifeFinanceApiError(
        0,
        "INVALID_CREDENTIAL",
        "Run credential has an invalid format",
      );
    }
    return { Authorization: `Bearer ${accessSecret}` };
  }

  async getRun(runId: string, accessSecret: string): Promise<GetRunResponse> {
    const path = runIdPathSchema.parse({ runId });
    return this.#request(
      `/api/v1/runs/${encodeURIComponent(path.runId)}`,
      getRunResponseSchema,
      {
        method: "GET",
        headers: this.#authorization(accessSecret),
      },
    );
  }

  async submitCommand(
    runId: string,
    accessSecret: string,
    command: CommandRequest,
  ): Promise<CommandResponse> {
    const path = runIdPathSchema.parse({ runId });
    const body = gameCommandSchema.parse(command);
    return this.#request(
      `/api/v1/runs/${encodeURIComponent(path.runId)}/commands`,
      commandResponseSchema,
      {
        method: "POST",
        headers: {
          ...this.#authorization(accessSecret),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  }

  async createRunV2(request: CreateRunV2Request): Promise<CreateRunV2Response> {
    const body = createRunV2RequestSchema.parse(request);
    return this.#request("/api/v2/runs", createRunV2ResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getRunV2(
    runId: string,
    accessSecret: string,
  ): Promise<GetRunV2Response> {
    const path = runIdV2PathSchema.parse({ runId });
    return this.#request(
      `/api/v2/runs/${encodeURIComponent(path.runId)}`,
      getRunV2ResponseSchema,
      {
        method: "GET",
        headers: this.#authorization(accessSecret),
      },
    );
  }

  async submitCommandV2(
    runId: string,
    accessSecret: string,
    command: GameCommandV2Public,
  ): Promise<CommandV2Response> {
    const path = runIdV2PathSchema.parse({ runId });
    const body = gameCommandV2PublicSchema.parse(command);
    return this.#request(
      `/api/v2/runs/${encodeURIComponent(path.runId)}/commands`,
      commandV2ResponseSchema,
      {
        method: "POST",
        headers: {
          ...this.#authorization(accessSecret),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  }
}
