declare const simulationMonthBrand: unique symbol;

export type SimulationMonth = string & {
  readonly [simulationMonthBrand]: true;
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export class MonthDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthDomainError";
  }
}

export function simulationMonth(value: string): SimulationMonth {
  const match = MONTH_PATTERN.exec(value);
  if (!match || match[1] === "0000") {
    throw new MonthDomainError(
      `simulation month must use YYYY-MM with year 0001 through 9999: ${value}`,
    );
  }

  return value as SimulationMonth;
}

function toMonthIndex(value: SimulationMonth): number {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return year * 12 + month - 1;
}

export function addMonths(
  value: SimulationMonth,
  amount: number,
): SimulationMonth {
  if (!Number.isSafeInteger(amount)) {
    throw new MonthDomainError("month amount must be a safe integer");
  }

  const nextIndex = toMonthIndex(value) + amount;
  const nextYear = Math.floor(nextIndex / 12);
  const nextMonth = ((nextIndex % 12) + 12) % 12;

  if (nextYear < 1 || nextYear > 9_999) {
    throw new MonthDomainError("resulting month is outside year 0001 through 9999");
  }

  return simulationMonth(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}`,
  );
}

export function monthsBetween(
  startInclusive: SimulationMonth,
  endExclusive: SimulationMonth,
): number {
  return toMonthIndex(endExclusive) - toMonthIndex(startInclusive);
}

export function compareMonths(
  left: SimulationMonth,
  right: SimulationMonth,
): -1 | 0 | 1 {
  const difference = monthsBetween(right, left);
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}
