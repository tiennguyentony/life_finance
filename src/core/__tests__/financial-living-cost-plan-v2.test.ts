import { describe, expect, it } from "vitest";

import { moneyCents } from "../domain/money";
import {
  FINANCIAL_LIVING_COST_PLAN_V2_VERSION,
  applyLivingCostPlanChangeV2,
} from "../financial-living-cost-plan-v2";

describe("Financial Engine living-cost plan v2", () => {
  it.each([
    [moneyCents(5), moneyCents(5), moneyCents(1)],
    [moneyCents(10), moneyCents(-5), moneyCents(-1)],
    [moneyCents(5), moneyCents(-5), moneyCents(0)],
  ])(
    "replaces the exact monthly allocation when annual cost changes from %i by %i cents",
    (
      previousAnnualLivingCostCents,
      annualDeltaCents,
      expectedMonthlyDeltaCents,
    ) => {
      const application = applyLivingCostPlanChangeV2(
        {
          annualLivingCostCents: previousAnnualLivingCostCents,
          requiredObligationsCents: moneyCents(100_000),
        },
        annualDeltaCents,
      );

      expect(application.evidence).toEqual({
        version: FINANCIAL_LIVING_COST_PLAN_V2_VERSION,
        previousAnnualLivingCostCents,
        annualLivingCostDeltaCents: annualDeltaCents,
        resultingAnnualLivingCostCents:
          previousAnnualLivingCostCents + annualDeltaCents,
        previousMonthlyLivingCostCents:
          previousAnnualLivingCostCents === 10 ? 1 : 0,
        resultingMonthlyLivingCostCents:
          previousAnnualLivingCostCents + annualDeltaCents === 10 ? 1 : 0,
        previousRequiredObligationsCents: 100_000,
        monthlyRequiredObligationDeltaCents: expectedMonthlyDeltaCents,
        resultingRequiredObligationsCents:
          100_000 + expectedMonthlyDeltaCents,
      });
      expect(application.finances).toEqual({
        annualLivingCostCents:
          previousAnnualLivingCostCents + annualDeltaCents,
        requiredObligationsCents: 100_000 + expectedMonthlyDeltaCents,
      });
    },
  );
});
