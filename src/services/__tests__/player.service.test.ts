import { describe, expect, it } from "vitest";

import { generatePlayer, getPersonas } from "../player.service";

describe("player service", () => {
  it("returns the three playable personas through the async boundary", async () => {
    const personas = await getPersonas({ delayMs: 0 });

    expect(personas.map((persona) => persona.name)).toEqual([
      "Burnt-out Junior Developer",
      "Debt-free Educator",
      "Big City Survivor",
    ]);
  });

  it("returns a mocked player shaped by the submitted profile", async () => {
    const result = await generatePlayer(
      {
        personaId: "junior-developer",
        name: "Mina",
        age: "27",
        location: "Seattle, WA",
        goal: "Build a six-month safety net",
      },
      { delayMs: 0 },
    );

    expect(result.player).toMatchObject({
      name: "Mina",
      age: 27,
      location: "Seattle, WA",
      career: "Junior developer",
    });
    expect(result.scenario.player.name).toBe("Mina");
    expect(result.scenario.scenarioId).toBe("big-city-survivor");
  });

  it("falls back to safe display values for incomplete profile input", async () => {
    const result = await generatePlayer(
      {
        personaId: "educator",
        name: "   ",
        age: "not-a-number",
        location: "",
        goal: "",
      },
      { delayMs: 0 },
    );

    expect(result.player.name).toBe("Player One");
    expect(result.player.age).toBe(28);
    expect(result.player.location).toBe("Portland, OR");
  });
});
