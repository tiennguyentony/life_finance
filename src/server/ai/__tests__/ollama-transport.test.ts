import { describe, expect, it, vi } from "vitest";

import type { AiTransportRequest } from "../client";
import {
  OllamaGptOssTransport,
  OllamaTransportError,
} from "../ollama-transport";

const request: AiTransportRequest = {
  model: "gpt-5.6-terra",
  input: [
    { role: "developer", content: "Return only the requested structure." },
    { role: "user", content: "Explain cash buffers." },
  ],
  textFormat: {
    type: "json_schema",
    name: "explanation",
    strict: true,
    schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
  },
  reasoningEffort: "low",
  store: false,
};

function completedResponse(): Response {
  return Response.json({
    model: "gpt-oss:20b",
    created_at: "2026-07-14T23:10:00Z",
    message: {
      role: "assistant",
      content: JSON.stringify({ title: "Cash buffers" }),
      thinking: "must not enter the returned audit payload",
    },
    done: true,
    done_reason: "stop",
  });
}

describe("Ollama gpt-oss transport", () => {
  it("uses the fixed local model, JSON Schema, bounded reasoning, and no streaming", async () => {
    const fetchFunction = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return completedResponse();
      },
    );
    const transport = new OllamaGptOssTransport({ fetchFunction });

    await expect(transport.create(request)).resolves.toMatchObject({
      status: "completed",
      outputText: JSON.stringify({ title: "Cash buffers" }),
      output: {
        provider: "ollama",
        model: "gpt-oss:20b",
        message: { role: "assistant" },
      },
    });
    expect(transport.auditModel()).toBe("ollama/gpt-oss:20b");
    expect(transport.responseSource()).toBe("local_oss");
    expect(fetchFunction).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFunction.mock.calls[0] ?? [];
    expect(url?.toString()).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "gpt-oss:20b",
      stream: false,
      think: "low",
      keep_alive: "15m",
      options: { temperature: 0, seed: 0 },
      messages: [
        {
          role: "system",
          content: expect.stringContaining(
            "Return only the requested structure.\n\nReturn exactly one valid JSON object",
          ),
        },
        { role: "user", content: "Explain cash buffers." },
      ],
      format: expect.objectContaining({
        type: "object",
        additionalProperties: false,
      }),
    });
    expect(body.messages[0].content).toContain('"required":["title"]');
    expect(JSON.stringify((await transport.create(request)).output)).not.toContain(
      "must not enter",
    );
  });

  it("rejects remote, authenticated, and path-based Ollama origins", () => {
    for (const baseUrl of [
      "https://example.com",
      "http://user:pass@localhost:11434",
      "http://localhost:11434/proxy",
    ]) {
      expect(() => new OllamaGptOssTransport({ baseUrl })).toThrow(
        "loopback HTTP origin",
      );
    }
  });

  it("forwards bounded creative sampling for character copy", async () => {
    let body: Record<string, unknown> | undefined;
    const transport = new OllamaGptOssTransport({
      fetchFunction: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return completedResponse();
      },
    });

    await transport.create({
      ...request,
      sampling: { temperature: 0.9, seed: 73 },
    });

    expect(body).toMatchObject({
      options: { temperature: 0.9, seed: 73 },
    });
  });

  it("rejects non-success and oversized responses without exposing provider bodies", async () => {
    const rejected = new OllamaGptOssTransport({
      fetchFunction: async () =>
        new Response("private provider detail", { status: 503 }),
    });
    const error = await rejected.create(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OllamaTransportError);
    expect(error).toMatchObject({ status: 503 });
    expect(String(error)).not.toContain("private provider detail");

    const oversized = new OllamaGptOssTransport({
      fetchFunction: async () =>
        new Response("{}", {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
        }),
    });
    await expect(oversized.create(request)).rejects.toMatchObject({ status: 502 });
  });

  it("requires the exact configured model in a completed response", async () => {
    const transport = new OllamaGptOssTransport({
      fetchFunction: async () =>
        Response.json({
          model: "some-other-model",
          created_at: "2026-07-14T23:10:00Z",
          message: { role: "assistant", content: "{}" },
          done: true,
        }),
    });
    await expect(transport.create(request)).rejects.toMatchObject({ status: 502 });
  });
});
