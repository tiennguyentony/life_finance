import { describe, expect, it, vi } from "vitest";

import type { RunView } from "@/application/game/run-view";
import type { CharacterBanterRequest } from "@/contracts/api/contracts";

import {
  CharacterBanterService,
  repeatsRecentBanter,
} from "../character-banter-service";

const RUN = {
  runId: "run.banter-test",
  revision: 8,
  currentMonth: "2026-10",
  status: "active",
  pendingInteraction: { kind: "none" },
} as unknown as RunView;

const REQUEST: CharacterBanterRequest = {
  expectedRevision: 8,
  simulationMonth: "2026-10",
  planLabel: "Pay down debt",
  variationSeed: 73,
  evidence: [
    { id: "debt_change", label: "Debt change", value: "-$500.00" },
  ],
  recentLines: ["Debt took a tiny step toward the exit."],
};

describe("CharacterBanterService", () => {
  it("returns fresh model copy grounded in supplied evidence", async () => {
    const generate = vi.fn(async () => ({
      characterId: "debtzilla" as const,
      tone: "roast" as const,
      message: "Someone is evicting debt, and my tiny landlord heart objects.",
      citedEvidenceId: "debt_change",
    }));
    const service = new CharacterBanterService(() => ({
      generate,
      responseSource: () => "local_oss",
    }));

    await expect(service.generate(RUN, REQUEST)).resolves.toMatchObject({
      version: "character-banter-v1",
      status: "generated",
      source: "local_oss",
      characterId: "debtzilla",
      citedEvidenceId: "debt_change",
    });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      role: "banter_writer",
      variationSeed: 73,
      evidence: REQUEST.evidence,
      recentLines: REQUEST.recentLines,
    }));
  });

  it("drops repeated model copy instead of showing the same notification", async () => {
    const service = new CharacterBanterService(() => ({
      generate: async () => ({
        characterId: "debtzilla",
        tone: "roast",
        message: "Debt took a tiny step toward the exit!",
        citedEvidenceId: "debt_change",
      }),
      responseSource: () => "hosted_oss",
    }));

    await expect(service.generate(RUN, REQUEST)).resolves.toEqual({
      version: "character-banter-v1",
      status: "unavailable",
    });
    expect(repeatsRecentBanter(
      "Debt took another tiny step toward the exit.",
      REQUEST.recentLines,
    )).toBe(true);
    expect(repeatsRecentBanter(
      "Debt took a tiny step toward the exit.",
      ["Debtzilla: Debt took a tiny step toward the exit."],
    )).toBe(true);
    expect(repeatsRecentBanter(
      "Steady as a sprout, and growing stronger this month.",
      ["Steady as a sprout on a sunny day."],
    )).toBe(true);
  });

  it("fails open when AI is unavailable so gameplay never waits on banter", async () => {
    const service = new CharacterBanterService(() => ({
      generate: async () => {
        throw new Error("provider timeout");
      },
      responseSource: () => "openai",
    }));

    await expect(service.generate(RUN, REQUEST)).resolves.toEqual({
      version: "character-banter-v1",
      status: "unavailable",
    });
  });

  it("removes the latest evidence topics when another real fact is available", async () => {
    const generate = vi.fn(async () => ({
      characterId: "impulso" as const,
      tone: "roast" as const,
      message: "Cash found the exit and apparently paid for express shipping.",
      citedEvidenceId: "cash_change",
    }));
    const service = new CharacterBanterService(() => ({
      generate,
      responseSource: () => "local_oss",
    }));

    await service.generate(RUN, {
      ...REQUEST,
      evidence: [
        ...REQUEST.evidence,
        { id: "cash_change", label: "Cash change", value: "-$250.00" },
      ],
      recentEvidenceIds: ["debt_change"],
      recentCharacterIds: ["debtzilla"],
    });

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      evidence: [{ id: "cash_change", label: "Cash change", value: "-$250.00" }],
    }));
  });

  it("rejects stale month evidence before calling AI", async () => {
    const generate = vi.fn();
    const service = new CharacterBanterService(() => ({
      generate,
      responseSource: () => "local_oss",
    }));

    await expect(service.generate(RUN, {
      ...REQUEST,
      expectedRevision: 7,
    })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(generate).not.toHaveBeenCalled();
  });
});
