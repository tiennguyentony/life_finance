import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHARACTERS,
  MASCOT,
  NAVIGATOR,
  personaCharacter,
} from "../persona-art";
import { PLAYER_PRESETS, type PlayerPresetId } from "../play-model";

function assertPortraitExists(src: string) {
  expect(src.startsWith("/assets/characters/")).toBe(true);
  const filePath = join(process.cwd(), "public", src);
  expect(existsSync(filePath), `portrait file missing: ${src}`).toBe(true);
}

describe("persona art", () => {
  it("maps every player preset to a named character portrait", () => {
    for (const presetId of Object.keys(PLAYER_PRESETS)) {
      const character = personaCharacter(presetId as PlayerPresetId);
      expect(character.name.length).toBeGreaterThan(0);
      expect(character.alt.length).toBeGreaterThan(10);
      expect(character.tagline.length).toBeGreaterThan(0);
      assertPortraitExists(character.src);
    }
  });

  it("keeps distinct characters per preset", () => {
    const names = Object.keys(PLAYER_PRESETS).map(
      (presetId) => personaCharacter(presetId as PlayerPresetId).name,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("ships mascot and navigator portraits for shared surfaces", () => {
    assertPortraitExists(MASCOT.src);
    assertPortraitExists(NAVIGATOR.src);
    expect(MASCOT.alt.length).toBeGreaterThan(10);
    expect(NAVIGATOR.alt.length).toBeGreaterThan(10);
  });

  it("exposes every library character with intrinsic dimensions", () => {
    for (const character of Object.values(CHARACTERS)) {
      expect(character.width).toBeGreaterThan(0);
      expect(character.height).toBeGreaterThan(0);
    }
  });
});
