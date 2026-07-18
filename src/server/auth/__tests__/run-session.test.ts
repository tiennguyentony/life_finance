import { describe, expect, it } from "vitest";

import {
  assertSameOriginWrite,
  clearRunSessionCookie,
  parseRunSessionCookie,
  serializeRunSessionCookie,
} from "../run-session";

const SESSION = {
  runId: "550e8400-e29b-41d4-a716-446655440000",
  accessSecret: `lf_run_${"a".repeat(43)}`,
};

describe("run session cookie", () => {
  it("round trips an HttpOnly strict production cookie", () => {
    const serialized = serializeRunSessionCookie(SESSION, {
      secure: true,
      maxAgeSeconds: 60,
    });

    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("SameSite=Strict");
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("Path=/api");
    expect(parseRunSessionCookie(serialized.split(";")[0]!)).toEqual(SESSION);
  });

  it("rejects malformed or forged cookie values", () => {
    expect(parseRunSessionCookie("life_finance_run=not-a-session")).toBeNull();
    expect(
      parseRunSessionCookie("life_finance_run=eyJydW5JZCI6ImJhZCJ9"),
    ).toBeNull();
  });

  it("clears the API-scoped cookie", () => {
    expect(clearRunSessionCookie({ secure: false })).toContain("Max-Age=0");
    expect(clearRunSessionCookie({ secure: false })).toContain("Path=/api");
  });

  it("accepts same-origin writes and rejects cross-origin writes", () => {
    expect(() =>
      assertSameOriginWrite(
        new Request("https://game.test/api/runs", {
          method: "POST",
          headers: { Origin: "https://game.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOriginWrite(
        new Request("https://game.test/api/runs", {
          method: "POST",
          headers: { Origin: "https://attacker.test" },
        }),
      ),
    ).toThrow(/same-origin/);
  });
});
