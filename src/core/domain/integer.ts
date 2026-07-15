const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);

export class NumericDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumericDomainError";
  }
}

export function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new NumericDomainError(`${label} must be a safe integer`);
  }
}

export function safeBigIntToNumber(value: bigint, label: string): number {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new NumericDomainError(`${label} exceeds the safe integer range`);
  }

  return Number(value);
}

export function divideRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator === BIGINT_ZERO) {
    throw new NumericDomainError("denominator must not be zero");
  }

  const normalizedNumerator =
    denominator < BIGINT_ZERO ? -numerator : numerator;
  const normalizedDenominator =
    denominator < BIGINT_ZERO ? -denominator : denominator;
  const quotient = normalizedNumerator / normalizedDenominator;
  const remainder = normalizedNumerator % normalizedDenominator;
  const absoluteRemainder =
    remainder < BIGINT_ZERO ? -remainder : remainder;

  if (absoluteRemainder * BIGINT_TWO < normalizedDenominator) {
    return quotient;
  }

  return (
    quotient + (normalizedNumerator < BIGINT_ZERO ? -BIGINT_ONE : BIGINT_ONE)
  );
}
