import type { RatePpm } from "./domain/money";
import {
  compareMonths,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import type { GameStateV2 } from "./game-state-v2";

export type RuntimeBalanceStateV1 = Readonly<{
  version: 1;
  pressurePpm: RatePpm;
  recoveryUntilMonth: SimulationMonth | null;
  catastropheCount: number;
  lastApprovedEventMonth: SimulationMonth | null;
}>;

export type RuntimeBalanceStateV1Violation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class InvalidRuntimeBalanceStateV1Error extends Error {
  readonly violations: readonly RuntimeBalanceStateV1Violation[];

  constructor(violations: readonly RuntimeBalanceStateV1Violation[]) {
    super(
      `Runtime Balance state v1 violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidRuntimeBalanceStateV1Error";
    this.violations = violations;
  }
}

const INITIAL_RUNTIME_BALANCE_STATE_V1: RuntimeBalanceStateV1 = Object.freeze({
  version: 1,
  pressurePpm: 0 as RatePpm,
  recoveryUntilMonth: null,
  catastropheCount: 0,
  lastApprovedEventMonth: null,
});

function violation(
  path: string,
  code: string,
  message: string,
): RuntimeBalanceStateV1Violation {
  return { path, code, message };
}

function isValidNullableMonth(
  value: unknown,
  path: "recoveryUntilMonth" | "lastApprovedEventMonth",
  violations: RuntimeBalanceStateV1Violation[],
): value is SimulationMonth | null {
  if (value === null) return true;
  try {
    if (typeof value !== "string") throw new TypeError("month must be a string");
    simulationMonth(value);
    return true;
  } catch {
    violations.push(
      violation(path, "invalid_month", "must be null or a canonical YYYY-MM month"),
    );
    return false;
  }
}

export function createInitialRuntimeBalanceStateV1(): RuntimeBalanceStateV1 {
  return INITIAL_RUNTIME_BALANCE_STATE_V1;
}

export function runtimeBalanceStateV1(
  state: GameStateV2,
): RuntimeBalanceStateV1 {
  const stored = state.gameplay.runtimeBalance;
  if (stored === undefined) return createInitialRuntimeBalanceStateV1();
  if (stored.version !== 1) {
    throw new InvalidRuntimeBalanceStateV1Error([
      violation("version", "unsupported_version", "must remain Runtime Balance version 1"),
    ]);
  }
  return stored;
}

export function validateRuntimeBalanceStateV1(
  state: RuntimeBalanceStateV1,
): readonly RuntimeBalanceStateV1Violation[] {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return [
      violation(
        "",
        "invalid_runtime_balance_state",
        "must be a structured Runtime Balance state object",
      ),
    ];
  }
  const violations: RuntimeBalanceStateV1Violation[] = [];
  if (state.version !== 1) {
    violations.push(
      violation("version", "unsupported_version", "must be Runtime Balance version 1"),
    );
  }
  if (
    !Number.isSafeInteger(state.pressurePpm) ||
    state.pressurePpm < 0 ||
    state.pressurePpm > 1_000_000
  ) {
    violations.push(
      violation(
        "pressurePpm",
        "rate_out_of_bounds",
        "must be between 0 and 1,000,000 PPM",
      ),
    );
  }
  if (
    !Number.isSafeInteger(state.catastropheCount) ||
    state.catastropheCount < 0
  ) {
    violations.push(
      violation(
        "catastropheCount",
        "invalid_catastrophe_count",
        "must be a non-negative safe integer",
      ),
    );
  }

  const validRecovery = isValidNullableMonth(
    state.recoveryUntilMonth,
    "recoveryUntilMonth",
    violations,
  );
  const validLastApproved = isValidNullableMonth(
    state.lastApprovedEventMonth,
    "lastApprovedEventMonth",
    violations,
  );
  if (
    validRecovery &&
    validLastApproved &&
    state.recoveryUntilMonth !== null &&
    state.lastApprovedEventMonth !== null &&
    compareMonths(state.lastApprovedEventMonth, state.recoveryUntilMonth) > 0
  ) {
    violations.push(
      violation(
        "recoveryUntilMonth",
        "invalid_month_order",
        "must not be earlier than the last approved event month",
      ),
    );
  }

  return violations;
}

export function assertValidRuntimeBalanceStateV1(
  state: RuntimeBalanceStateV1,
): void {
  const violations = validateRuntimeBalanceStateV1(state);
  if (violations.length > 0) {
    throw new InvalidRuntimeBalanceStateV1Error(violations);
  }
}
