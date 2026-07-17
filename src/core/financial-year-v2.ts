import { moneyCents } from "./domain/money";
import type { GameStateV2 } from "./game-state-v2";

const ZERO = moneyCents(0);

export function resetAnnualFinancialAccumulatorsV2(
  state: GameStateV2,
): GameStateV2 {
  const processedYear = Number(state.currentMonth.slice(0, 4));
  const contributions = state.gameplay.contributions;
  const insurance = state.gameplay.insurance;
  const nextContributions =
    contributions.policyYear === null ||
    contributions.policyYear === processedYear
      ? contributions
      : Object.freeze({
          ...contributions,
          policyYear: processedYear,
          employee401kCents: ZERO,
          employer401kCents: ZERO,
          iraCents: ZERO,
          hsaCents: ZERO,
        });
  const nextInsurance =
    insurance.policyYear === null || insurance.policyYear === processedYear
      ? insurance
      : Object.freeze({
          ...insurance,
          policyYear: processedYear,
          healthDeductiblePaidCents: ZERO,
          healthOutOfPocketPaidCents: ZERO,
        });

  if (nextContributions === contributions && nextInsurance === insurance) {
    return state;
  }
  return Object.freeze({
    ...state,
    gameplay: Object.freeze({
      ...state.gameplay,
      contributions: nextContributions,
      insurance: nextInsurance,
    }),
  });
}
