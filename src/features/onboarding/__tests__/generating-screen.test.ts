import { describe, expect, it } from "vitest";

import { generationGate } from "../generating-screen";

describe("generationGate", () => {
  it("waits for persisted onboarding state before deciding where to go", () => {
    expect(generationGate(false, false)).toBe("wait");
    expect(generationGate(false, true)).toBe("wait");
  });

  it("redirects only after hydration proves that no profile exists", () => {
    expect(generationGate(true, false)).toBe("redirect");
  });

  it("starts generation when the restored profile is available", () => {
    expect(generationGate(true, true)).toBe("generate");
  });
});
