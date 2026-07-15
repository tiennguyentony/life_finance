import { describe, expect, it, vi } from "vitest";

import type { AiTransportRequest } from "../client";
import {
  GROQ_GPT_OSS_MODEL,
  GroqGptOssTransport,
  GroqTransportError,
} from "../groq-transport";

const request: AiTransportRequest = {
  model: "gpt-5.6-sol",
  input: [
    { role: "developer", content: "Return the required structure." },
    { role: "user", content: "Explain the supplied evidence." },
  ],
  textFormat: {
    type: "json_schema",
    name: "lesson_v1",
    strict: true,
    schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
  },
  reasoningEffort: "medium",
  store: false,
};

function completion(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    id: "chatcmpl_test",
    model: GROQ_GPT_OSS_MODEL,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify({ title: "Liquidity" }),
          reasoning: "must not be copied into audit output",
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
    ...overrides,
  });
}

describe("Groq gpt-oss-120b transport", () => {
  it("pins the hosted model and sends strict JSON Schema without provider storage state", async () => {
    const fetchFunction = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return completion();
      },
    );
    const transport = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction,
    });

    await expect(transport.create(request)).resolves.toMatchObject({
      responseId: "chatcmpl_test",
      status: "completed",
      outputText: JSON.stringify({ title: "Liquidity" }),
      output: {
        provider: "groq",
        model: GROQ_GPT_OSS_MODEL,
        finishReason: "stop",
      },
    });
    expect(transport.auditModel()).toBe("groq/openai/gpt-oss-120b");
    expect(transport.responseSource()).toBe("hosted_oss");

    const [url, init] = fetchFunction.mock.calls[0] ?? [];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer gsk_test_key_that_is_long_enough",
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      model: GROQ_GPT_OSS_MODEL,
      messages: request.input,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lesson_v1",
          strict: true,
          schema: request.textFormat && (request.textFormat as { schema: unknown }).schema,
        },
      },
      reasoning_effort: "medium",
      stream: false,
    });
    expect(JSON.stringify((await transport.create(request)).output)).not.toContain(
      "must not be copied",
    );
  });

  it("requires a server key and a named strict schema", async () => {
    expect(() => new GroqGptOssTransport({ apiKey: "short" })).toThrow(
      "GROQ_API_KEY",
    );
    const transport = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction: async () => completion(),
    });
    await expect(
      transport.create({ ...request, textFormat: { type: "json_object" } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sanitizes provider failures and bounds rate-limit waits", async () => {
    const transport = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction: async () =>
        new Response("private provider detail", {
          status: 429,
          headers: { "retry-after": "60" },
        }),
    });
    const error = await transport.create(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GroqTransportError);
    expect(error).toMatchObject({ status: 429, retryAfterMs: 2_000 });
    expect(String(error)).not.toContain("private provider detail");
  });

  it("rejects oversized, mismatched, and incomplete responses", async () => {
    const oversized = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction: async () =>
        new Response("{}", {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
        }),
    });
    await expect(oversized.create(request)).rejects.toMatchObject({ status: 502 });

    const mismatched = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction: async () => completion({ model: "unexpected-model" }),
    });
    await expect(mismatched.create(request)).rejects.toMatchObject({ status: 502 });

    const incomplete = new GroqGptOssTransport({
      apiKey: "gsk_test_key_that_is_long_enough",
      fetchFunction: async () =>
        completion({
          choices: [
            {
              index: 0,
              finish_reason: "length",
              message: { role: "assistant", content: "{}" },
            },
          ],
        }),
    });
    await expect(incomplete.create(request)).resolves.toMatchObject({
      status: "incomplete",
    });
  });
});
