import { describe, expect, it } from "vitest";

import { ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type { GameCommandV2 } from "../../db/run-repository-contracts";
import { buildDeterministicTeachingCounterfactualRequestV2 } from "../service-v2";

function strategyCommand(
  strategy: Readonly<{
    emergencyFundTargetMonthsPpm?: number;
    afterTaxBroadIndexRatePpm?: number;
    afterTaxSectorRatePpm?: number;
    afterTaxSpeculativeRatePpm?: number;
    afterTaxIraRatePpm?: number;
    afterTaxExtraDebtRatePpm?: number;
  }> = {},
): GameCommandV2 {
  return {
    schemaVersion: 2,
    id: "strategy.latest",
    type: "set_recurring_strategy",
    expectedRevision: 8,
    effectiveMonth: simulationMonth("2030-09"),
    payload: {
      strategy: {
        emergencyFundTargetMonthsPpm: ratePpm(
          strategy.emergencyFundTargetMonthsPpm ?? 0,
        ),
        insuranceCoverageIds: [],
        preTax401kSalaryRatePpm: ratePpm(100_000),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(
          strategy.afterTaxBroadIndexRatePpm ?? 0,
        ),
        afterTaxSectorRatePpm: ratePpm(
          strategy.afterTaxSectorRatePpm ?? 0,
        ),
        afterTaxSpeculativeRatePpm: ratePpm(
          strategy.afterTaxSpeculativeRatePpm ?? 0,
        ),
        afterTaxIraRatePpm: ratePpm(strategy.afterTaxIraRatePpm ?? 0),
        afterTaxExtraDebtRatePpm: ratePpm(
          strategy.afterTaxExtraDebtRatePpm ?? 0,
        ),
      },
    },
  };
}

describe("Teaching v2 deterministic counterfactual default", () => {
  it("changes only the first supported nonzero field in fixed owner order", () => {
    const request = buildDeterministicTeachingCounterfactualRequestV2(
      strategyCommand({
        emergencyFundTargetMonthsPpm: 3_000_000,
        afterTaxBroadIndexRatePpm: 120_000,
      }),
    );

    expect(request).toEqual({
      version: "counterfactual-v1",
      sourceCommandId: "strategy.latest",
      intervention: {
        kind: "recurring_strategy_field",
        commandId: "strategy.latest",
        field: "emergencyFundTargetMonthsPpm",
        value: 0,
      },
      horizonMonths: 12,
    });
  });

  it("returns unavailable for a command with no supported nonzero field", () => {
    expect(
      buildDeterministicTeachingCounterfactualRequestV2(strategyCommand()),
    ).toBeNull();
  });
});
