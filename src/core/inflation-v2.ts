import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import {
  allocateMoney,
  multiplyMoneyByRate,
  PPM_ONE,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import type { GameStateV2 } from "./game-state-v2";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function calculateMonthlyLivingCostInflationV2(
  annualLivingCostCents: MoneyCents,
  monthlyInflationPpm: RatePpm,
): Readonly<{
  annualIncreaseCents: MoneyCents;
  monthlyObligationIncreaseCents: MoneyCents;
}> {
  const annualIncreaseCents = multiplyMoneyByRate(
    annualLivingCostCents,
    monthlyInflationPpm,
  );
  return Object.freeze({
    annualIncreaseCents,
    monthlyObligationIncreaseCents: allocateMoney(
      annualIncreaseCents,
      1,
      12,
    ),
  });
}

export function currentCumulativePriceIndexPpmV2(state: GameStateV2): number {
  return state.gameplay.market.cumulativePriceIndexPpm ?? PPM_ONE;
}

export function advanceCumulativePriceIndexV2(
  currentIndexPpm: number,
  monthlyInflationPpm: RatePpm,
): number {
  if (!Number.isSafeInteger(currentIndexPpm) || currentIndexPpm <= 0) {
    throw new RangeError("current price index must be a positive safe integer");
  }
  if (!Number.isSafeInteger(monthlyInflationPpm)) {
    throw new RangeError("monthly inflation must be a safe integer PPM rate");
  }
  const multiplierPpm = BigInt(PPM_ONE) + BigInt(monthlyInflationPpm);
  if (multiplierPpm <= BigInt(0) || multiplierPpm > MAX_SAFE_BIGINT) {
    throw new RangeError("price-index multiplier must be positive and safe");
  }
  const nextIndexPpm = divideRoundHalfAwayFromZero(
    BigInt(currentIndexPpm) * multiplierPpm,
    BigInt(PPM_ONE),
  );
  if (nextIndexPpm <= BigInt(0) || nextIndexPpm > MAX_SAFE_BIGINT) {
    throw new RangeError("compounded price index must be positive and safe");
  }
  return safeBigIntToNumber(nextIndexPpm, "cumulative price index");
}
