import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import type { RunViewWire } from "@/contracts/api/contracts";
import { boardMonthResult } from "@/features/board/board-model";

import {
  characterBanterFromResponse,
  characterBanterRequestForMonth,
  isCharacterBanterMonth,
  loadCharacterBanterHistory,
  saveCharacterBanterHistory,
} from "../character-banter";

function addMonths(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const ordinal = year! * 12 + monthNumber! - 1 + amount;
  return `${Math.floor(ordinal / 12)}-${String(ordinal % 12 + 1).padStart(2, "0")}`;
}

function endingAfter(opening: RunViewWire, elapsed: number): RunViewWire {
  return {
    ...opening,
    revision: opening.revision + elapsed,
    currentMonth: addMonths(opening.startMonth, elapsed),
  };
}

describe("AI character banter preparation", () => {
  it("requests copy twice per three months with no gap longer than two", () => {
    const opening = projectRunView(currentRunState()) as unknown as RunViewWire;
    const appearances: number[] = [];

    for (let elapsed = 1; elapsed <= 30; elapsed += 1) {
      if (isCharacterBanterMonth(endingAfter(opening, elapsed))) {
        appearances.push(elapsed);
      }
    }

    expect(appearances).toHaveLength(20);
    for (let index = 1; index < appearances.length; index += 1) {
      expect(appearances[index]! - appearances[index - 1]!).toBeLessThanOrEqual(3);
    }
  });

  it("keeps the last valid reactions so reloads do not reset anti-repetition", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const history = Array.from({ length: 10 }, (_, index) => ({
      characterId: index % 2 === 0 ? "sprout" as const : "bengo" as const,
      citedEvidenceId: `fact_${index}`,
      message: `Generated line ${index}.`,
    }));

    saveCharacterBanterHistory("run_1", history, storage);

    expect(loadCharacterBanterHistory("run_1", storage)).toEqual(history.slice(-8));
  });

  it("sends bounded authoritative deltas and recent lines to the writer", () => {
    const opening = projectRunView(currentRunState()) as unknown as RunViewWire;
    let ending: RunViewWire | null = null;
    for (let elapsed = 1; elapsed <= 3 && ending === null; elapsed += 1) {
      const candidate = endingAfter(opening, elapsed);
      if (isCharacterBanterMonth(candidate)) ending = candidate;
    }
    expect(ending).not.toBeNull();
    const changed = {
      ...ending!,
      finances: {
        ...ending!.finances,
        cashCents: ending!.finances.cashCents - 25_000,
        creditUsedCents: ending!.finances.creditUsedCents + 10_000,
      },
    };
    const request = characterBanterRequestForMonth(
      changed,
      boardMonthResult(opening, changed, "Protect cash"),
      [{
        characterId: "sprout",
        citedEvidenceId: "cash_change",
        message: "An earlier generated line.",
      }],
      123,
    );

    expect(request).toMatchObject({
      expectedRevision: changed.revision,
      simulationMonth: changed.currentMonth,
      planLabel: "Protect cash",
      variationSeed: 123,
      recentLines: ["An earlier generated line."],
      recentEvidenceIds: ["cash_change"],
      recentCharacterIds: ["sprout"],
    });
    expect(request?.evidence.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "cash_change",
      "debt_change",
    ]));
    expect(request?.evidence.map(({ id }) => id)).not.toContain("risk_change");
    expect(request?.evidence.length).toBeLessThanOrEqual(12);
  });

  it("does not request copy while a financial event needs a decision", () => {
    const opening = projectRunView(currentRunState()) as unknown as RunViewWire;
    const ending = {
      ...endingAfter(opening, 1),
      pendingInteraction: {
        kind: "event" as const,
        eventId: "event.waiting",
        templateId: "personal.test",
        choiceIds: [],
        choices: [],
        parameters: {},
        headline: "Decision waiting",
        body: "Choose first.",
      },
    };

    expect(characterBanterRequestForMonth(
      ending,
      boardMonthResult(opening, ending, "Stay steady"),
      [],
      1,
    )).toBeNull();
  });

  it("maps a generated cast ID to the existing visual asset", () => {
    expect(characterBanterFromResponse({
      version: "character-banter-v1",
      status: "generated",
      source: "local_oss",
      characterId: "lucky_cat",
      tone: "roast",
      message: "Taxes took a field trip through your paycheck again.",
      citedEvidenceId: "monthly_tax",
      latencyMs: 40,
    }, "2026-10")).toMatchObject({
      characterName: "Lucky Cat",
      characterSrc: "/assets/characters/luckycat/luckycat-tax.png",
      tone: "roast",
    });
  });
});
