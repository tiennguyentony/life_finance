const UINT32_RANGE = 0x1_0000_0000;

export type RandomState = Readonly<{
  algorithm: "mulberry32-v1";
  value: number;
}>;

export type RandomDraw<T> = Readonly<{
  value: T;
  nextState: RandomState;
}>;

export class RandomDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RandomDomainError";
  }
}

function hashStringSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function randomState(seed: number | string): RandomState {
  const value = typeof seed === "string" ? hashStringSeed(seed) : seed;
  if (!Number.isSafeInteger(value)) {
    throw new RandomDomainError("numeric seed must be a safe integer");
  }

  return Object.freeze({ algorithm: "mulberry32-v1", value: value >>> 0 });
}

export function nextUint32(state: RandomState): RandomDraw<number> {
  if (
    state.algorithm !== "mulberry32-v1" ||
    !Number.isInteger(state.value) ||
    state.value < 0 ||
    state.value >= UINT32_RANGE
  ) {
    throw new RandomDomainError("invalid mulberry32-v1 state");
  }

  const nextValue = (state.value + 0x6d2b79f5) >>> 0;
  let mixed = nextValue;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = (mixed ^ (mixed >>> 14)) >>> 0;

  return {
    value,
    nextState: Object.freeze({ algorithm: "mulberry32-v1", value: nextValue }),
  };
}

export function nextInt(
  state: RandomState,
  minimumInclusive: number,
  maximumInclusive: number,
): RandomDraw<number> {
  if (
    !Number.isSafeInteger(minimumInclusive) ||
    !Number.isSafeInteger(maximumInclusive) ||
    maximumInclusive < minimumInclusive
  ) {
    throw new RandomDomainError("random integer bounds are invalid");
  }

  const range = maximumInclusive - minimumInclusive + 1;
  if (!Number.isSafeInteger(range) || range < 1 || range > UINT32_RANGE) {
    throw new RandomDomainError("random integer range must be between 1 and 2^32");
  }

  let cursor = state;
  if (range === UINT32_RANGE) {
    const draw = nextUint32(cursor);
    return { value: minimumInclusive + draw.value, nextState: draw.nextState };
  }

  const acceptanceLimit = Math.floor(UINT32_RANGE / range) * range;
  for (;;) {
    const draw = nextUint32(cursor);
    cursor = draw.nextState;
    if (draw.value < acceptanceLimit) {
      return {
        value: minimumInclusive + (draw.value % range),
        nextState: cursor,
      };
    }
  }
}
