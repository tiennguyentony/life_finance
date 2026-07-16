import { sha256Canonical } from "./canonical";
import type { RatePpm } from "./domain/money";
import { addMonths, compareMonths } from "./domain/month";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  simulateFinancialMonthV2,
  type FinancialMonthRecordV2,
  type FinancialShortfallV2,
  type MonthlyInsuranceClaimV2,
  type ResolvedCashFlowV2,
} from "./financial-kernel-v2";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import { ownForDeepFreeze } from "./immutable-ownership";
import {
  assertValidMarketReturnModifiers,
  marketSimulationState,
  simulateMarketMonth,
  type MarketReturnModifiers,
  type MarketSimulationResult,
} from "./market";
import type { MonthlyTaxEvidence } from "./payroll-v2";
import { acceptFinancialClosingStateV2 } from "./financial-transition-v2";

/** Public horizon bound: one hundred years of monthly evidence. */
export const MAX_FINANCIAL_PROJECTION_MONTHS_V2 = 1_200 as const;

export type FinancialProjectionV2ErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_ASSUMPTION_VERSION"
  | "INVALID_MONTH_COUNT"
  | "TAX_EVIDENCE_LENGTH_MISMATCH"
  | "INSURANCE_CLAIM_LENGTH_MISMATCH"
  | "RESOLVED_FLOW_LENGTH_MISMATCH"
  | "FIXED_MARKET_LENGTH_MISMATCH"
  | "INVALID_LIQUIDATION_RATE"
  | "INVALID_MARKET_POLICY"
  | "INVALID_ASSUMPTION_PACKET"
  | "INVALID_MONTH_EVIDENCE"
  | "UNSUPPORTED_NONFINANCIAL_LIFECYCLE";

export class FinancialProjectionV2Error extends Error {
  readonly code: FinancialProjectionV2ErrorCode;
  override readonly cause?: unknown;

  constructor(
    code: FinancialProjectionV2ErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "FinancialProjectionV2Error";
    this.code = code;
    this.cause = cause;
  }
}

export type FinancialProjectionAssumptionsV2 = Readonly<{
  version: 1;
  taxableLiquidationCostRatePpm: RatePpm;
  taxEvidenceByMonth: readonly MonthlyTaxEvidence[];
  insuranceClaimsByMonth: readonly (MonthlyInsuranceClaimV2 | null)[];
  resolvedCashFlowsByMonth: readonly (readonly ResolvedCashFlowV2[])[];
  market:
    | Readonly<{
        kind: "fixed";
        steps: readonly MarketSimulationResult[];
      }>
    | Readonly<{
        kind: "state_seeded";
        returnModifiersPpm: MarketReturnModifiers;
      }>;
}>;

export type FinancialProjectionInputV2 = Readonly<{
  state: GameStateV2;
  months: number;
  assumptions: FinancialProjectionAssumptionsV2;
}>;

export type ProjectedFinancialStateV2 = Readonly<{
  kind: "projected_financial_state_v2";
  state: GameStateV2;
  assumptionFingerprint: string;
  generatedCommandIds: readonly string[];
}>;

export type FinancialProjectionResultV2 = Readonly<{
  requestedMonths: number;
  completedMonths: number;
  records: readonly FinancialMonthRecordV2[];
  stopReason: "completed" | "shortfall";
  shortfall: FinancialShortfallV2 | null;
  projectedState: ProjectedFinancialStateV2;
  assumptionFingerprint: string;
  generatedCommandIds: readonly string[];
}>;

function projectionCommandId(
  assumptionFingerprint: string,
  monthIndex: number,
): string {
  return `cmd.projection.${sha256Canonical({
    version: 1,
    assumptionFingerprint,
    monthIndex,
  })}`;
}

function assertArrayLength(
  value: unknown,
  months: number,
  code:
    | "TAX_EVIDENCE_LENGTH_MISMATCH"
    | "INSURANCE_CLAIM_LENGTH_MISMATCH"
    | "RESOLVED_FLOW_LENGTH_MISMATCH"
    | "FIXED_MARKET_LENGTH_MISMATCH",
  label: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length !== months) {
    throw new FinancialProjectionV2Error(
      code,
      `${label} must contain exactly ${months} entries`,
    );
  }
}

function validateProjectionInput(input: FinancialProjectionInputV2): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.state === null ||
    typeof input.state !== "object" ||
    input.assumptions === null ||
    typeof input.assumptions !== "object"
  ) {
    throw new FinancialProjectionV2Error(
      "INVALID_INPUT",
      "financial projection input must contain state and assumptions",
    );
  }
  if (
    !Number.isSafeInteger(input.months) ||
    input.months < 0 ||
    input.months > MAX_FINANCIAL_PROJECTION_MONTHS_V2
  ) {
    throw new FinancialProjectionV2Error(
      "INVALID_MONTH_COUNT",
      `projection months must be an integer from 0 through ${MAX_FINANCIAL_PROJECTION_MONTHS_V2}`,
    );
  }
  if (input.assumptions.version !== 1) {
    throw new FinancialProjectionV2Error(
      "UNSUPPORTED_ASSUMPTION_VERSION",
      "financial projection assumptions must use version 1",
    );
  }
  if (
    !Number.isSafeInteger(
      input.assumptions.taxableLiquidationCostRatePpm,
    ) ||
    input.assumptions.taxableLiquidationCostRatePpm < 0 ||
    input.assumptions.taxableLiquidationCostRatePpm > 1_000_000
  ) {
    throw new FinancialProjectionV2Error(
      "INVALID_LIQUIDATION_RATE",
      "taxable liquidation cost rate must be between 0 and 1,000,000 PPM",
    );
  }
  assertArrayLength(
    input.assumptions.taxEvidenceByMonth,
    input.months,
    "TAX_EVIDENCE_LENGTH_MISMATCH",
    "tax evidence",
  );
  assertArrayLength(
    input.assumptions.insuranceClaimsByMonth,
    input.months,
    "INSURANCE_CLAIM_LENGTH_MISMATCH",
    "insurance claim evidence",
  );
  assertArrayLength(
    input.assumptions.resolvedCashFlowsByMonth,
    input.months,
    "RESOLVED_FLOW_LENGTH_MISMATCH",
    "resolved cash-flow evidence",
  );

  const market = input.assumptions.market;
  if (market === null || typeof market !== "object") {
    throw new FinancialProjectionV2Error(
      "INVALID_MARKET_POLICY",
      "projection market policy is invalid",
    );
  }
  if (market.kind === "fixed") {
    assertArrayLength(
      market.steps,
      input.months,
      "FIXED_MARKET_LENGTH_MISMATCH",
      "fixed market steps",
    );
  } else if (market.kind === "state_seeded") {
    try {
      assertValidMarketReturnModifiers(market.returnModifiersPpm);
    } catch (cause) {
      throw new FinancialProjectionV2Error(
        "INVALID_MARKET_POLICY",
        "state-seeded market policy has invalid return modifiers",
        cause,
      );
    }
  } else {
    throw new FinancialProjectionV2Error(
      "INVALID_MARKET_POLICY",
      "projection market policy kind is unsupported",
    );
  }
}

function marketStepForMonth(
  state: GameStateV2,
  assumptions: FinancialProjectionAssumptionsV2,
  monthIndex: number,
): MarketSimulationResult {
  if (assumptions.market.kind === "fixed") {
    return assumptions.market.steps[monthIndex]!;
  }
  return simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
    assumptions.market.returnModifiersPpm,
  );
}

function assertSupportedNonfinancialLifecycle(
  state: GameStateV2,
  months: number,
): void {
  if (months === 0) return;
  const lifecycle = state.gameplay.eventLifecycle;
  const horizonEndMonth = addMonths(state.currentMonth, months);
  const careerCompletesWithinHorizon =
    state.gameplay.careerDevelopment.pending.some(
      ({ completesMonth }) =>
        compareMonths(completesMonth, horizonEndMonth) <= 0,
    );
  const macroStoryExpiresBeforeHorizonEnd = lifecycle.macroStories.some(
    ({ expiresMonth }) => compareMonths(expiresMonth, horizonEndMonth) < 0,
  );
  const lifeMilestoneDueWithinHorizon =
    state.gameplay.lifeMilestones?.scheduled.some(
      ({ targetMonth }) => compareMonths(targetMonth, horizonEndMonth) <= 0,
    ) ?? false;
  const hasUnsupportedEvidence =
    state.outcome !== null ||
    lifecycle.pending !== null ||
    careerCompletesWithinHorizon ||
    macroStoryExpiresBeforeHorizonEnd ||
    lifeMilestoneDueWithinHorizon;
  if (hasUnsupportedEvidence) {
    throw new FinancialProjectionV2Error(
      "UNSUPPORTED_NONFINANCIAL_LIFECYCLE",
      "event-free projection cannot cross pending events, career completions, macro-story expiry, life-milestone decisions, or terminal outcomes",
    );
  }
}

export function projectWithoutEventsV2(
  input: FinancialProjectionInputV2,
): FinancialProjectionResultV2 {
  validateProjectionInput(input);
  let state: GameStateV2;
  try {
    state = finalizeGameStateV2(ownForDeepFreeze(input.state));
  } catch (cause) {
    throw new FinancialProjectionV2Error(
      "INVALID_INPUT",
      "financial projection opening state is invalid",
      cause,
    );
  }
  assertSupportedNonfinancialLifecycle(state, input.months);
  let assumptionFingerprint: string;
  try {
    assumptionFingerprint = sha256Canonical({
      version: 1,
      months: input.months,
      assumptions: input.assumptions,
    });
  } catch (cause) {
    throw new FinancialProjectionV2Error(
      "INVALID_ASSUMPTION_PACKET",
      "financial projection assumptions must be canonically serializable",
      cause,
    );
  }
  const records: FinancialMonthRecordV2[] = [];
  const generatedCommandIds: string[] = [];
  let shortfall: FinancialShortfallV2 | null = null;

  for (let monthIndex = 0; monthIndex < input.months; monthIndex += 1) {
    const commandId = projectionCommandId(assumptionFingerprint, monthIndex);
    try {
      const financial = simulateFinancialMonthV2({
        version: FINANCIAL_KERNEL_V2_VERSION,
        commandId,
        state,
        taxEvidence: input.assumptions.taxEvidenceByMonth[monthIndex]!,
        marketStep: marketStepForMonth(state, input.assumptions, monthIndex),
        taxableLiquidationCostRatePpm:
          input.assumptions.taxableLiquidationCostRatePpm,
        insuranceClaim:
          input.assumptions.insuranceClaimsByMonth[monthIndex] ?? undefined,
        resolvedCashFlows:
          input.assumptions.resolvedCashFlowsByMonth[monthIndex],
      });
      state = acceptFinancialClosingStateV2(
        state,
        financial.state,
        commandId,
      );
      records.push(financial.record);
      generatedCommandIds.push(commandId);
      if (financial.shortfall !== null) {
        shortfall = financial.shortfall;
        break;
      }
    } catch (cause) {
      throw new FinancialProjectionV2Error(
        "INVALID_MONTH_EVIDENCE",
        `financial evidence for projection month ${monthIndex} is invalid`,
        cause,
      );
    }
  }

  const frozenRecords = Object.freeze(records);
  const frozenCommandIds = Object.freeze(generatedCommandIds);
  const projectedState = Object.freeze({
    kind: "projected_financial_state_v2" as const,
    state,
    assumptionFingerprint,
    generatedCommandIds: frozenCommandIds,
  });
  return Object.freeze({
    requestedMonths: input.months,
    completedMonths: frozenRecords.length,
    records: frozenRecords,
    stopReason: shortfall === null ? "completed" : "shortfall",
    shortfall,
    projectedState,
    assumptionFingerprint,
    generatedCommandIds: frozenCommandIds,
  });
}
