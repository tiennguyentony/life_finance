import { describe, expect, it } from "vitest";

import {
  adjustDraft,
  DIALS,
  draftDiffersFromStrategy,
  draftFromStrategy,
  investPlanFromDraft,
  type InvestDraft,
} from "../invest-model";

const SAVED = {
  preTax401kSalaryRatePpm: 0,
  preTaxHsaSalaryRatePpm: 0,
  afterTaxIraRatePpm: 0,
  afterTaxBroadIndexRatePpm: 0,
  afterTaxSectorRatePpm: 0,
  afterTaxSpeculativeRatePpm: 0,
  afterTaxExtraDebtRatePpm: 0,
};

describe("invest draft", () => {
  it("starts from the saved strategy", () => {
    const draft = draftFromStrategy({ ...SAVED, preTax401kSalaryRatePpm: 80_000 });

    expect(draft.preTax401kSalaryRatePpm).toBe(80_000);
    expect(draftDiffersFromStrategy(draft, { ...SAVED, preTax401kSalaryRatePpm: 80_000 })).toBe(
      false,
    );
  });

  it("reports a difference once a dial moves", () => {
    const draft = adjustDraft(
      draftFromStrategy(SAVED),
      "preTax401kSalaryRatePpm",
      10_000,
      300_000,
    );

    expect(draftDiffersFromStrategy(draft, SAVED)).toBe(true);
  });

  it("applies every step when several are chained", () => {
    // Guards the batching bug where repeated clicks in one render all resolved
    // against the same draft, so only the last step survived.
    let draft: InvestDraft = draftFromStrategy(SAVED);
    for (let click = 0; click < 5; click += 1) {
      draft = adjustDraft(draft, "preTax401kSalaryRatePpm", 10_000, 300_000);
    }

    expect(draft.preTax401kSalaryRatePpm).toBe(50_000);
  });

  it("clamps to the dial's range", () => {
    const maxed = adjustDraft(draftFromStrategy(SAVED), "preTax401kSalaryRatePpm", 999_999, 300_000);
    const floored = adjustDraft(draftFromStrategy(SAVED), "preTax401kSalaryRatePpm", -999_999, 300_000);

    expect(maxed.preTax401kSalaryRatePpm).toBe(300_000);
    expect(floored.preTax401kSalaryRatePpm).toBe(0);
  });

  it("leaves other rates untouched", () => {
    const draft = adjustDraft(
      draftFromStrategy(SAVED),
      "afterTaxSectorRatePpm",
      5_000,
      200_000,
    );

    expect(draft.preTax401kSalaryRatePpm).toBe(0);
    expect(draft.afterTaxSectorRatePpm).toBe(5_000);
  });

  it("builds a strategy-patch command carrying every edited rate", () => {
    const draft = adjustDraft(
      draftFromStrategy(SAVED),
      "preTax401kSalaryRatePpm",
      80_000,
      300_000,
    );
    const plan = investPlanFromDraft(draft);

    expect(plan.command).toEqual({
      type: "set_recurring_strategy_patch",
      patch: draft,
    });
    expect(plan.disabledReason).toBeNull();
  });

  it("keeps a dial for every editable rate on the wire", () => {
    const draft = draftFromStrategy(SAVED);

    expect(DIALS.map(({ key }) => key).sort()).toEqual(Object.keys(draft).sort());
  });
});
