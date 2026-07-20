import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AiResponsesTransport,
  AiTransportRequest,
  AiTransportResult,
} from "./client";
import type { AiModelSource } from "../../core/ai-source";

export const OLLAMA_GPT_OSS_MODEL = "gpt-oss:20b" as const;
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434" as const;

const DEFAULT_OLLAMA_TIMEOUT_MS = 180_000;
const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const ollamaResponseSchema = z
  .object({
    model: z.string().min(1),
    created_at: z.string().min(1),
    message: z
      .object({
        role: z.string().min(1),
        content: z.string(),
      })
      .passthrough(),
    done: z.boolean(),
    done_reason: z.string().optional(),
  })
  .passthrough();

export class OllamaTransportError extends Error {
  readonly status: number;

  constructor(message: string, status = 503, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OllamaTransportError";
    this.status = status;
  }
}

function localOllamaEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "http:" ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "OLLAMA_BASE_URL must be an unauthenticated loopback HTTP origin",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return new URL("api/chat", url);
}

function structuredOutputSchema(textFormat: unknown): Record<string, unknown> {
  if (
    typeof textFormat !== "object" ||
    textFormat === null ||
    !("type" in textFormat) ||
    textFormat.type !== "json_schema" ||
    !("strict" in textFormat) ||
    textFormat.strict !== true ||
    !("schema" in textFormat) ||
    typeof textFormat.schema !== "object" ||
    textFormat.schema === null ||
    Array.isArray(textFormat.schema)
  ) {
    throw new OllamaTransportError(
      "local AI request requires a strict JSON Schema output format",
      400,
    );
  }
  return textFormat.schema as Record<string, unknown>;
}

async function boundedResponseBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OLLAMA_RESPONSE_BYTES
  ) {
    throw new OllamaTransportError("local AI response is too large", 502);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OLLAMA_RESPONSE_BYTES) {
      await reader.cancel();
      throw new OllamaTransportError("local AI response is too large", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class OllamaGptOssTransport implements AiResponsesTransport {
  readonly #endpoint: URL;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #model: string;

  constructor(
    options: Readonly<{
      baseUrl?: string;
      timeoutMs?: number;
      model?: string;
      fetchFunction?: FetchLike;
    }> = {},
  ) {
    this.#endpoint = localOllamaEndpoint(
      options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    );
    this.#fetch = options.fetchFunction ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS;
    this.#model = options.model ?? OLLAMA_GPT_OSS_MODEL;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1_000) {
      throw new Error("Ollama timeout must be a safe integer of at least 1,000 ms");
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}:[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(this.#model)) {
      throw new Error("Ollama model must be a local model identifier with a tag");
    }
  }

  auditModel(): string {
    return `ollama/${this.#model}`;
  }

  responseSource(): AiModelSource {
    return "local_oss";
  }

  async create(request: AiTransportRequest): Promise<AiTransportResult> {
    const outputSchema = structuredOutputSchema(request.textFormat);
    const localOutputInstruction =
      "Return exactly one valid JSON object matching this exact JSON Schema. " +
      "Use every required property with the exact property name, include no " +
      "extra properties, and emit no Markdown or surrounding text. JSON Schema: " +
      JSON.stringify(outputSchema);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          messages: request.input.map(({ role, content }) => ({
            role: role === "developer" ? "system" : role,
            content:
              role === "developer"
                ? `${content}\n\n${localOutputInstruction}`
                : content,
          })),
          stream: false,
          format: outputSchema,
          think: this.#model === OLLAMA_GPT_OSS_MODEL
            ? request.reasoningEffort
            : false,
          keep_alive: "15m",
          options: {
            temperature: request.sampling?.temperature ?? 0,
            seed: request.sampling?.seed ?? 0,
            ...(request.maxOutputTokens === undefined
              ? {}
              : { num_predict: request.maxOutputTokens }),
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (cause) {
      throw new OllamaTransportError(
        controller.signal.aborted
          ? "local AI request timed out"
          : "local AI service is unavailable",
        503,
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await boundedResponseBody(response);
    if (!response.ok) {
      throw new OllamaTransportError(
        "local AI service rejected the request",
        response.status,
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch (cause) {
      throw new OllamaTransportError("local AI returned invalid JSON", 502, {
        cause,
      });
    }
    const parsed = ollamaResponseSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.model !== this.#model) {
      throw new OllamaTransportError(
        "local AI response violates the transport contract",
        502,
      );
    }

    return {
      responseId: `ollama_${randomUUID()}`,
      status: parsed.data.done ? "completed" : "incomplete",
      outputText: parsed.data.message.content,
      output: {
        provider: "ollama",
        model: parsed.data.model,
        createdAt: parsed.data.created_at,
        done: parsed.data.done,
        doneReason: parsed.data.done_reason ?? null,
        message: {
          role: parsed.data.message.role,
          content: parsed.data.message.content,
        },
      },
    };
  }
}
