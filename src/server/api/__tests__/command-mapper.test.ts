import { describe, expect, it } from "vitest";

import { mapPlayerCommand } from "../command-mapper";

describe("v2 player command mapping", () => {
  it("injects the frozen action policy and ignores client authority over sale cost", () => {
    const mapped = mapPlayerCommand({
      schemaVersion: 2,
      id: "action.map-liquidation",
      expectedRevision: 3,
      effectiveMonth: "2026-10",
      type: "take_detailed_action",
      payload: {
        action: {
          type: "liquidate_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: 100_000,
        },
      },
    });

    expect(mapped).toMatchObject({
      payload: {
        actionPolicyVersion: "1.0.0",
        action: { liquidationCostRatePpm: 10_000 },
      },
    });
  });

  it("leaves recurring strategy ownership separate from the action policy", () => {
    const mapped = mapPlayerCommand({
      schemaVersion: 2,
      id: "strategy.map",
      expectedRevision: 3,
      effectiveMonth: "2026-10",
      type: "set_recurring_strategy",
      payload: {
        strategy: {
          emergencyFundTargetMonthsPpm: 6_000_000,
          insuranceCoverageIds: ["insurance.renters"],
          preTax401kSalaryRatePpm: 0,
          preTaxHsaSalaryRatePpm: 0,
          afterTaxBroadIndexRatePpm: 0,
          afterTaxSectorRatePpm: 0,
          afterTaxSpeculativeRatePpm: 0,
          afterTaxIraRatePpm: 0,
          afterTaxExtraDebtRatePpm: 0,
        },
      },
    });

    expect(mapped.type).toBe("set_recurring_strategy");
    if (mapped.type !== "set_recurring_strategy") {
      throw new Error("expected recurring strategy command");
    }
    expect(mapped.payload).not.toHaveProperty("actionPolicyVersion");
    expect(mapped.payload.strategy).toMatchObject({
      emergencyFundTargetMonthsPpm: 6_000_000,
      insuranceCoverageIds: ["insurance.renters"],
    });
  });
});
