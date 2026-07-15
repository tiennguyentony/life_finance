import {
  assertSafeInteger,
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./integer";

declare const moneyCentsBrand: unique symbol;
declare const ratePpmBrand: unique symbol;

export type MoneyCents = number & { readonly [moneyCentsBrand]: true };
export type RatePpm = number & { readonly [ratePpmBrand]: true };

export const PPM_ONE = 1_000_000 as RatePpm;
export const ZERO_CENTS = 0 as MoneyCents;

export function moneyCents(value: number): MoneyCents {
  assertSafeInteger(value, "money cents");
  return value as MoneyCents;
}

export function ratePpm(value: number): RatePpm {
  assertSafeInteger(value, "rate PPM");
  return value as RatePpm;
}

export function addMoney(left: MoneyCents, right: MoneyCents): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(BigInt(left) + BigInt(right), "money addition"),
  );
}

export function subtractMoney(
  left: MoneyCents,
  right: MoneyCents,
): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(BigInt(left) - BigInt(right), "money subtraction"),
  );
}

export function negateMoney(value: MoneyCents): MoneyCents {
  return moneyCents(safeBigIntToNumber(-BigInt(value), "money negation"));
}

export function multiplyMoneyByRate(
  value: MoneyCents,
  rate: RatePpm,
): MoneyCents {
  const result = divideRoundHalfAwayFromZero(
    BigInt(value) * BigInt(rate),
    BigInt(PPM_ONE),
  );

  return moneyCents(safeBigIntToNumber(result, "rate multiplication"));
}

export function allocateMoney(
  value: MoneyCents,
  numerator: number,
  denominator: number,
): MoneyCents {
  assertSafeInteger(numerator, "allocation numerator");
  assertSafeInteger(denominator, "allocation denominator");

  const result = divideRoundHalfAwayFromZero(
    BigInt(value) * BigInt(numerator),
    BigInt(denominator),
  );

  return moneyCents(safeBigIntToNumber(result, "money allocation"));
}
