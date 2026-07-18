import { describe, expect, it } from "vitest";

import {
  apiErrorResponseSchema,
  commandIntentSchema,
  runViewSchema,
} from "../contracts";
import { CURRENT_OPENAPI_DOCUMENT } from "../openapi";

describe("frontend API contracts", () => {
  it("rejects engine metadata from a run view", () => {
    expect(() =>
      runViewSchema.parse({
        runId: "run.current",
        revision: 0,
        currentMonth: "2026-07",
        status: "active",
        schemaVersion: 2,
      }),
    ).toThrow();
  });

  it("accepts intent without a schema version or effective month", () => {
    expect(
      commandIntentSchema.parse({
        id: "ui.command.1",
        expectedRevision: 4,
        type: "resolve_event_choice",
        payload: { eventId: "event.1", choiceId: "choice.1" },
      }),
    ).toEqual({
      id: "ui.command.1",
      expectedRevision: 4,
      type: "resolve_event_choice",
      payload: { eventId: "event.1", choiceId: "choice.1" },
    });
  });

  it("requires a request id on every API error", () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: { code: "CONFLICT", message: "reload" },
      }).success,
    ).toBe(false);
  });

  it("publishes only the unversioned browser API", () => {
    const paths = Object.keys(CURRENT_OPENAPI_DOCUMENT.paths);
    expect(paths).toContain("/api/runs/{runId}/commands");
    expect(paths.some((path) => /\/api\/v[0-9]+\//.test(path))).toBe(false);
  });
});
