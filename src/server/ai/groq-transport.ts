import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AiModelSource } from "../../core/ai-source";
import type {
  AiResponsesTransport,
  AiTransportRequest,
  AiTransportResult,
} from "./client";

export const GROQ_GPT_OSS_MODEL = "openai/gpt-oss-120b" as const;
const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions" as const;
const DEFAULT_GROQ_TIMEOUT_MS = 45_000;
const MAX_GROQ_RESPONSE_BYTES = 2 * 1024 * 1024;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const groqResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            finish_reason: z.string().nullable(),
            message: z
              .object({
                role: z.string().min(1),
                content: z.string().nullable(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z.unknown().optional(),
  })
  .passthrough();

export class GroqTransportError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    status = 503,
    options?: { cause?: unknown; retryAfterMs?: number | null },
  ) {
    super(message, options);
    this.name = "GroqTransportError";
    this.status = status;
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }
}

function strictJsonSchema(textFormat: unknown): Readonly<{
  name: string;
  strict: true;
  schema: Record<string, unknown>;
}> {
  if (
    typeof textFormat !== "object" ||
    textFormat === null ||
    !("type" in textFormat) ||
    textFormat.type !== "json_schema" ||
    !("name" in textFormat) ||
    typeof textFormat.name !== "string" ||
    textFormat.name.length < 1 ||
    !("strict" in textFormat) ||
    textFormat.strict !== true ||
    !("schema" in textFormat) ||
    typeof textFormat.schema !== "object" ||
    textFormat.schema === null ||
    Array.isArray(textFormat.schema)
  ) {
    throw new GroqTransportError(
      "hosted AI request requires a named strict JSON Schema output format",
      400,
    );
  }
  return {
    name: textFormat.name,
    strict: true,
    schema: textFormat.schema as Record<string, unknown>,
  };
}

function retryAfterMilliseconds(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(2_000, Math.round(seconds * 1_000))
    : null;
}

async function boundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_GROQ_RESPONSE_BYTES) {
    throw new GroqTransportError("hosted AI response is too large", 502);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_GROQ_RESPONSE_BYTES) {
      await reader.cancel();
      throw new GroqTransportError("hosted AI response is too large", 502);
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

export class GroqGptOssTransport implements AiResponsesTransport {
  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(
    options: Readonly<{
      apiKey?: string;
      timeoutMs?: number;
      fetchFunction?: FetchLike;
    }> = {},
  ) {
    const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim().length < 20) {
      throw new Error("GROQ_API_KEY must be configured server-side");
    }
    this.#apiKey = apiKey;
    this.#fetch = options.fetchFunction ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1_000) {
      throw new Error("Groq timeout must be a safe integer of at least 1,000 ms");
    }
  }

  auditModel(): string {
    return `groq/${GROQ_GPT_OSS_MODEL}`;
  }

  responseSource(): AiModelSource {
    return "hosted_oss";
  }

  async create(request: AiTransportRequest): Promise<AiTransportResult> {
    const jsonSchema = strictJsonSchema(request.textFormat);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_GPT_OSS_MODEL,
          messages: request.input.map(({ role, content }) => ({
            role,
            content,
          })),
          response_format: { type: "json_schema", json_schema: jsonSchema },
          reasoning_effort: request.reasoningEffort,
          ...(request.maxOutputTokens === undefined
            ? {}
            : { max_completion_tokens: request.maxOutputTokens }),
          ...(request.sampling === undefined
            ? {}
            : {
                temperature: request.sampling.temperature,
                seed: request.sampling.seed,
              }),
          stream: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (cause) {
      throw new GroqTransportError(
        controller.signal.aborted
          ? "hosted AI request timed out"
          : "hosted AI service is unavailable",
        503,
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await boundedBody(response);
    if (!response.ok) {
      throw new GroqTransportError(
        "hosted AI service rejected the request",
        response.status,
        { retryAfterMs: retryAfterMilliseconds(response) },
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch (cause) {
      throw new GroqTransportError("hosted AI returned invalid JSON", 502, {
        cause,
      });
    }
    const parsed = groqResponseSchema.safeParse(decoded);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (
      !parsed.success ||
      parsed.data.model !== GROQ_GPT_OSS_MODEL ||
      !choice ||
      choice.message.content === null
    ) {
      throw new GroqTransportError(
        "hosted AI response violates the transport contract",
        502,
      );
    }

    return {
      responseId: parsed.data.id || `groq_${randomUUID()}`,
      status: choice.finish_reason === "stop" ? "completed" : "incomplete",
      outputText: choice.message.content,
      output: {
        provider: "groq",
        model: parsed.data.model,
        finishReason: choice.finish_reason,
        usage: parsed.data.usage ?? null,
        message: {
          role: choice.message.role,
          content: choice.message.content,
        },
      },
    };
  }
}
