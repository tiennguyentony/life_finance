import { canonicalJson, sha256Canonical } from "./canonical";
import { isCausalSourceEvidenceIdV1 } from "./causal-history-v1";
import { simulationMonth, type SimulationMonth } from "./domain/month";
import type { ResolveEventChoiceV2Command } from "./event-lifecycle-v2";
import type { SetRecurringStrategyCommand } from "./recurring-strategy-v2";

export const COUNTERFACTUAL_V1_VERSION = "counterfactual-v1" as const;

export const COUNTERFACTUAL_EXECUTION_POLICY_V1 = Object.freeze({
  maximumHorizonMonths: 24,
  maximumAcceptedCommands: 256,
});

export const COUNTERFACTUAL_ASSUMPTIONS_V1 = Object.freeze([
  "deterministic_simulation_comparison_not_real_life_prediction",
  "future_player_commands_held_unchanged_until_stop_reason",
  "tax_evidence_reused_only_while_context_fingerprint_matches",
  "future_seed_control_reported_from_verified_seed_evidence",
] as const);

export type CounterfactualSupportedStrategyFieldV1 =
  | "emergencyFundTargetMonthsPpm"
  | "insuranceCoverageIds"
  | "afterTaxBroadIndexRatePpm"
  | "afterTaxSectorRatePpm"
  | "afterTaxSpeculativeRatePpm"
  | "afterTaxIraRatePpm"
  | "afterTaxExtraDebtRatePpm";

type NumericStrategyFieldV1 = Exclude<
  CounterfactualSupportedStrategyFieldV1,
  "insuranceCoverageIds"
>;

export type CounterfactualInterventionV1 =
  | Readonly<{
      kind: "recurring_strategy_field";
      commandId: string;
      field: NumericStrategyFieldV1;
      value: number;
    }>
  | Readonly<{
      kind: "recurring_strategy_field";
      commandId: string;
      field: "insuranceCoverageIds";
      value: readonly string[];
    }>
  | Readonly<{
      kind: "event_response";
      commandId: string;
      eventId: string;
      choiceId: string;
    }>;

export type CounterfactualRequestV1 = Readonly<{
  version: typeof COUNTERFACTUAL_V1_VERSION;
  sourceCommandId: string;
  intervention: CounterfactualInterventionV1;
  horizonMonths: number;
}>;

/** Trusted replay evidence supplied by the repository, never by the public client. */
export type CounterfactualSeedEvidenceV1 = Readonly<
  | {
      mode: "shared_cursor";
      stateEvidenceId: string;
      randomStateChecksum: string;
    }
  | {
      mode: "named_world";
      version: "named-world-rng-v1";
      stateEvidenceId: string;
      macroEpoch: number;
      eventOpportunityEpoch: number;
      streamStateChecksum: string;
    }
>;

export type CounterfactualSourceCommandV1 =
  | SetRecurringStrategyCommand
  | ResolveEventChoiceV2Command;

export type CounterfactualPlanInputV1 = Readonly<{
  request: CounterfactualRequestV1;
  sourceCommand: CounterfactualSourceCommandV1;
  seedEvidence: CounterfactualSeedEvidenceV1;
  availableEventChoiceIds: readonly string[];
  availableInsuranceCoverageIds: readonly string[];
}>;

export type CounterfactualPlanV1 = Readonly<{
  version: typeof COUNTERFACTUAL_V1_VERSION;
  sourceCommandId: string;
  sourceRevision: number;
  interventionPath: string;
  originalValue: string | number | readonly string[];
  alternateValue: string | number | readonly string[];
  changedPaths: readonly string[];
  requestedHorizonMonths: number;
  maximumAcceptedCommands: number;
  sourceCommandChecksum: string;
  alternateCommandChecksum: string;
  seedEvidence: CounterfactualSeedEvidenceV1;
  assumptions: typeof COUNTERFACTUAL_ASSUMPTIONS_V1;
  alternateCommand: CounterfactualSourceCommandV1;
}>;

export type CounterfactualV1ErrorCode =
  | "INVALID_REQUEST"
  | "SOURCE_COMMAND_NOT_FOUND"
  | "SOURCE_EVIDENCE_CORRUPT"
  | "UNSUPPORTED_INTERVENTION"
  | "MULTIPLE_CHANGES"
  | "INVALID_ALTERNATE_VALUE"
  | "ALTERNATE_COMMAND_REJECTED";

export class CounterfactualV1Error extends Error {
  constructor(
    readonly code: CounterfactualV1ErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "CounterfactualV1Error";
  }
}

export type CounterfactualTaxCompatibilityV1 = Readonly<
  | {
      compatible: true;
      actualContextFingerprint: string;
      alternativeContextFingerprint: string;
      taxEvidenceId: string;
    }
  | {
      compatible: false;
      reason: "missing_fingerprint" | "context_mismatch" | "alternate_evidence_absent";
    }
>;

/**
 * Integration seam for the authenticated runner. Prompt 11 injects
 * `reduceGameCommandV2` here; this module intentionally contains no financial,
 * tax, event, or RNG transition formula.
 */
export type CounterfactualCommandMetadataV1 = Readonly<{
  id: string;
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  isMonthlyCommand: boolean;
}>;

export type CounterfactualStateOutcomeV1 = Readonly<{
  revision: number;
  month: SimulationMonth;
  cashCents: number;
  totalDebtCents: number;
  netWorthCents: number;
  recoveryRemainingMonths: number | null;
  fiProgressPpm: number;
  outcomeKind: string | null;
  outcomeReasonCode: string | null;
}>;

export type CounterfactualMonthlyOutcomeV1 = Readonly<{
  forcedSaleGrossCents: number;
  forcedSaleCount: number;
  newRevolvingCreditCents: number;
  residualShortfallCents: number;
}>;

export type CounterfactualExecutionPortV1<
  TState,
  TCommand,
  TMonthlyRecord,
> = Readonly<{
  reduceProductionCommand: (
    state: TState,
    command: TCommand,
  ) => Readonly<{ state: TState; monthlyRecord: TMonthlyRecord | null }>;
  canonicalStateChecksum: (state: TState) => string;
  commandMetadata: (command: TCommand) => CounterfactualCommandMetadataV1;
  summarizeState: (state: TState) => CounterfactualStateOutcomeV1;
  summarizeMonthlyRecord: (
    monthlyRecord: TMonthlyRecord,
  ) => CounterfactualMonthlyOutcomeV1;
  taxCompatibilityBeforeMonthlyCommand: (
    actualState: TState,
    alternativeState: TState,
    command: TCommand,
  ) => CounterfactualTaxCompatibilityV1;
  seedEvidenceAtMonthlyOpening: (
    actualState: TState,
    alternativeState: TState,
  ) => Readonly<{
    actual: CounterfactualSeedEvidenceV1;
    alternative: CounterfactualSeedEvidenceV1;
  }>;
}>;

export type CounterfactualStopReasonV1 =
  | "requested_horizon_reached"
  | "actual_history_exhausted"
  | "actual_terminal"
  | "alternate_terminal"
  | "future_command_no_longer_valid"
  | "tax_evidence_not_valid_for_alternative"
  | "seed_control_unavailable_after_rng_divergence"
  | "command_limit_reached";

export type CounterfactualSeedControlModeV1 =
  | "matched_named_world"
  | "named_world_control_unavailable"
  | "matched_shared_cursor_through_horizon"
  | "partial_shared_cursor_then_diverged"
  | "not_applicable_no_future_month";

export type CounterfactualBranchOutcomeV1 = Readonly<
  CounterfactualStateOutcomeV1 &
    CounterfactualMonthlyOutcomeV1 & {
      finalStateChecksum: string;
    }
>;

export type CounterfactualDifferenceV1 = Readonly<{
  direction: "alternative_minus_actual";
  cashCents: number;
  totalDebtCents: number;
  netWorthCents: number;
  forcedSaleGrossCents: number;
  forcedSaleCount: number;
  newRevolvingCreditCents: number;
  residualShortfallCents: number;
  recoveryRemainingMonths: number | null;
  fiProgressPpm: number;
  outcomeChanged: boolean;
}>;

export type CounterfactualResultV1 = Readonly<{
  version: typeof COUNTERFACTUAL_V1_VERSION;
  sourceCommandId: string;
  sourceRevision: number;
  interventionPath: string;
  originalValue: CounterfactualPlanV1["originalValue"];
  alternateValue: CounterfactualPlanV1["alternateValue"];
  changedPaths: readonly string[];
  requestedHorizonMonths: number;
  comparedMonths: number;
  acceptedCommandCount: number;
  lastComparableRevision: number;
  lastComparableMonth: SimulationMonth;
  stopReason: CounterfactualStopReasonV1;
  seedControl: Readonly<{
    mode: CounterfactualSeedControlModeV1;
    lastComparableRevision: number;
    lastComparableMonth: SimulationMonth;
  }>;
  assumptions: typeof COUNTERFACTUAL_ASSUMPTIONS_V1;
  actual: CounterfactualBranchOutcomeV1;
  alternative: CounterfactualBranchOutcomeV1;
  difference: CounterfactualDifferenceV1;
  evidenceIds: readonly string[];
  resultChecksum: string;
}>;

export type CounterfactualExecutionInputV1<TState, TCommand> = Readonly<{
  plan: CounterfactualPlanV1;
  openingState: TState;
  sourceCommand: TCommand;
  futureCommands: readonly TCommand[];
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;
const CHECKSUM = /^[a-f0-9]{64}$/;
const NUMERIC_STRATEGY_FIELDS = new Set<string>([
  "emergencyFundTargetMonthsPpm",
  "afterTaxBroadIndexRatePpm",
  "afterTaxSectorRatePpm",
  "afterTaxSpeculativeRatePpm",
  "afterTaxIraRatePpm",
  "afterTaxExtraDebtRatePpm",
]);
const AFTER_TAX_FIELDS = [
  "afterTaxBroadIndexRatePpm",
  "afterTaxSectorRatePpm",
  "afterTaxSpeculativeRatePpm",
  "afterTaxIraRatePpm",
  "afterTaxExtraDebtRatePpm",
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

/**
 * Canonical structural diff used to prove that a planned command changes one
 * leaf. Array-valued policy leaves can be declared atomic; envelope fields can
 * never be hidden by that allow list.
 */
export function canonicalStructuralDiffPathsV1(
  original: unknown,
  alternate: unknown,
  atomicPaths: readonly string[] = [],
): readonly string[] {
  const atomic = new Set(atomicPaths);
  const changed: string[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (valuesEqual(left, right)) return;
    if (path.length > 0 && atomic.has(path)) {
      changed.push(path);
      return;
    }
    if (isPlainObject(left) && isPlainObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(
        compareText,
      );
      for (const key of keys) {
        visit(
          left[key],
          right[key],
          path.length === 0 ? key : `${path}.${key}`,
        );
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        visit(left[index], right[index], `${path}.${index}`);
      }
      return;
    }
    changed.push(path);
  };
  visit(original, alternate, "");
  return Object.freeze(changed.sort(compareText));
}

function validateRequest(request: CounterfactualRequestV1): void {
  if (
    request.version !== COUNTERFACTUAL_V1_VERSION ||
    !IDENTIFIER.test(request.sourceCommandId) ||
    !Number.isSafeInteger(request.horizonMonths) ||
    request.horizonMonths < 1 ||
    request.horizonMonths > COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumHorizonMonths ||
    request.intervention === null ||
    typeof request.intervention !== "object" ||
    !IDENTIFIER.test(request.intervention.commandId) ||
    request.intervention.commandId !== request.sourceCommandId
  ) {
    throw new CounterfactualV1Error(
      "INVALID_REQUEST",
      "request",
      "must identify one source command and a horizon of 1 through 24 months",
    );
  }
}

function validateSeedEvidence(
  seedEvidence: CounterfactualSeedEvidenceV1,
  expectedRevision: number,
): CounterfactualSeedEvidenceV1 {
  if (
    !isCausalSourceEvidenceIdV1(seedEvidence.stateEvidenceId) ||
    !seedEvidence.stateEvidenceId.startsWith("state:")
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "seedEvidence.stateEvidenceId",
      "must reference the verified pre-command state",
    );
  }
  const stateRevision = Number(seedEvidence.stateEvidenceId.split(":", 3)[1]);
  if (stateRevision !== expectedRevision) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "seedEvidence.stateEvidenceId",
      "must identify the source command's exact pre-command revision",
    );
  }
  if (seedEvidence.mode === "shared_cursor") {
    if (!CHECKSUM.test(seedEvidence.randomStateChecksum)) {
      throw new CounterfactualV1Error(
        "SOURCE_EVIDENCE_CORRUPT",
        "seedEvidence.randomStateChecksum",
        "must be a canonical checksum",
      );
    }
    return Object.freeze({ ...seedEvidence });
  }
  if (
    seedEvidence.mode !== "named_world" ||
    seedEvidence.version !== "named-world-rng-v1" ||
    !Number.isSafeInteger(seedEvidence.macroEpoch) ||
    seedEvidence.macroEpoch < 0 ||
    !Number.isSafeInteger(seedEvidence.eventOpportunityEpoch) ||
    seedEvidence.eventOpportunityEpoch < 0 ||
    !CHECKSUM.test(seedEvidence.streamStateChecksum)
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "seedEvidence",
      "named-world evidence requires stable non-negative epochs and checksum",
    );
  }
  return Object.freeze({ ...seedEvidence });
}

function validateSourceCommand(
  request: CounterfactualRequestV1,
  command: CounterfactualSourceCommandV1,
): void {
  if (
    command.schemaVersion !== 2 ||
    !IDENTIFIER.test(command.id) ||
    command.id !== request.sourceCommandId ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    (command.type !== "set_recurring_strategy" &&
      command.type !== "resolve_event_choice")
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "sourceCommand",
      "does not match the verified accepted command identity",
    );
  }
}

function uniqueAvailableIds(values: readonly string[], path: string): Set<string> {
  if (
    values.some((value) => !IDENTIFIER.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      path,
      "must contain unique stable identifiers",
    );
  }
  return new Set(values);
}

function freezeStrategyCommand(
  source: SetRecurringStrategyCommand,
  strategy: Record<string, unknown>,
): SetRecurringStrategyCommand {
  const insurance = strategy.insuranceCoverageIds;
  const frozenStrategy = Object.freeze({
    ...strategy,
    ...(Array.isArray(insurance)
      ? { insuranceCoverageIds: Object.freeze([...insurance]) }
      : {}),
  });
  return Object.freeze({
    ...source,
    payload: Object.freeze({ strategy: frozenStrategy }),
  }) as unknown as SetRecurringStrategyCommand;
}

function planStrategyIntervention(
  input: CounterfactualPlanInputV1,
  source: SetRecurringStrategyCommand,
): Readonly<{
  interventionPath: string;
  originalValue: number | readonly string[];
  alternateValue: number | readonly string[];
  alternateCommand: SetRecurringStrategyCommand;
}> {
  const intervention = input.request.intervention as Readonly<{
    kind: string;
    field?: string;
    value?: unknown;
  }>;
  if (intervention.kind !== "recurring_strategy_field") {
    throw new CounterfactualV1Error(
      "UNSUPPORTED_INTERVENTION",
      "request.intervention.kind",
      "does not match the source command type",
    );
  }
  const field = intervention.field;
  if (
    field === "preTax401kSalaryRatePpm" ||
    field === "preTaxHsaSalaryRatePpm"
  ) {
    throw new CounterfactualV1Error(
      "UNSUPPORTED_INTERVENTION",
      "request.intervention.field",
      "pre-tax changes require trusted alternate tax evidence",
    );
  }
  if (field !== "insuranceCoverageIds" && !NUMERIC_STRATEGY_FIELDS.has(field ?? "")) {
    throw new CounterfactualV1Error(
      "UNSUPPORTED_INTERVENTION",
      "request.intervention.field",
      "is not in the v1 strategy allow list",
    );
  }
  const supportedField = field as CounterfactualSupportedStrategyFieldV1;

  const strategy = source.payload.strategy as unknown as Readonly<
    Record<string, unknown>
  >;
  let alternateValue: number | readonly string[];
  if (field === "insuranceCoverageIds") {
    if (
      !Array.isArray(intervention.value) ||
      intervention.value.some((value) => typeof value !== "string")
    ) {
      throw new CounterfactualV1Error(
        "INVALID_ALTERNATE_VALUE",
        "request.intervention.value",
        "insurance selection must be an identifier list",
      );
    }
    const requested = intervention.value as string[];
    if (
      new Set(requested).size !== requested.length ||
      requested.some((value) => !IDENTIFIER.test(value))
    ) {
      throw new CounterfactualV1Error(
        "INVALID_ALTERNATE_VALUE",
        "request.intervention.value",
        "insurance selection must contain unique stable identifiers",
      );
    }
    const available = uniqueAvailableIds(
      input.availableInsuranceCoverageIds,
      "availableInsuranceCoverageIds",
    );
    if (requested.some((value) => !available.has(value))) {
      throw new CounterfactualV1Error(
        "INVALID_ALTERNATE_VALUE",
        "request.intervention.value",
        "insurance selection contains coverage unavailable to the source state",
      );
    }
    alternateValue = Object.freeze([...requested].sort(compareText));
  } else {
    if (
      typeof intervention.value !== "number" ||
      !Number.isSafeInteger(intervention.value) ||
      intervention.value < 0 ||
      (field === "emergencyFundTargetMonthsPpm"
        ? intervention.value > 24_000_000
        : intervention.value > 1_000_000)
    ) {
      throw new CounterfactualV1Error(
        "INVALID_ALTERNATE_VALUE",
        "request.intervention.value",
        "policy value is outside its fixed-point bounds",
      );
    }
    alternateValue = intervention.value;
  }

  const originalValue = strategy[supportedField] as
    | number
    | readonly string[]
    | undefined;
  if (originalValue === undefined) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      `sourceCommand.payload.strategy.${supportedField}`,
      "is absent from the accepted source command",
    );
  }
  if (valuesEqual(originalValue, alternateValue)) {
    throw new CounterfactualV1Error(
      "INVALID_ALTERNATE_VALUE",
      "request.intervention.value",
      "must differ from the accepted source value",
    );
  }
  const nextStrategy: Record<string, unknown> = {
    ...strategy,
    ...(Array.isArray(strategy.insuranceCoverageIds)
      ? { insuranceCoverageIds: [...strategy.insuranceCoverageIds] }
      : {}),
    [supportedField]: alternateValue,
  };
  if (supportedField !== "insuranceCoverageIds") {
    const afterTaxSum = AFTER_TAX_FIELDS.reduce(
      (total, key) => total + Number(nextStrategy[key]),
      0,
    );
    if (!Number.isSafeInteger(afterTaxSum) || afterTaxSum > 1_000_000) {
      throw new CounterfactualV1Error(
        "INVALID_ALTERNATE_VALUE",
        "request.intervention.value",
        "after-tax allocation rates cannot exceed 100%",
      );
    }
  }
  return Object.freeze({
    interventionPath: `payload.strategy.${supportedField}`,
    originalValue: Array.isArray(originalValue)
      ? Object.freeze([...originalValue])
      : originalValue,
    alternateValue,
    alternateCommand: freezeStrategyCommand(source, nextStrategy),
  });
}

function planEventIntervention(
  input: CounterfactualPlanInputV1,
  source: ResolveEventChoiceV2Command,
): Readonly<{
  interventionPath: string;
  originalValue: string;
  alternateValue: string;
  alternateCommand: ResolveEventChoiceV2Command;
}> {
  const intervention = input.request.intervention;
  if (
    intervention.kind !== "event_response" ||
    intervention.eventId !== source.payload.eventId ||
    !IDENTIFIER.test(intervention.choiceId)
  ) {
    throw new CounterfactualV1Error(
      "UNSUPPORTED_INTERVENTION",
      "request.intervention",
      "must change one response on the accepted source event",
    );
  }
  const available = uniqueAvailableIds(
    input.availableEventChoiceIds,
    "availableEventChoiceIds",
  );
  if (!available.has(intervention.choiceId)) {
    throw new CounterfactualV1Error(
      "INVALID_ALTERNATE_VALUE",
      "request.intervention.choiceId",
      "is not an available response on the verified event",
    );
  }
  if (intervention.choiceId === source.payload.choiceId) {
    throw new CounterfactualV1Error(
      "INVALID_ALTERNATE_VALUE",
      "request.intervention.choiceId",
      "must differ from the accepted response",
    );
  }
  const alternateCommand = Object.freeze({
    ...source,
    payload: Object.freeze({
      ...source.payload,
      choiceId: intervention.choiceId,
    }),
  });
  return Object.freeze({
    interventionPath: "payload.choiceId",
    originalValue: source.payload.choiceId,
    alternateValue: intervention.choiceId,
    alternateCommand,
  });
}

export function planCounterfactualV1(
  input: CounterfactualPlanInputV1,
): CounterfactualPlanV1 {
  validateRequest(input.request);
  validateSourceCommand(input.request, input.sourceCommand);
  const seedEvidence = validateSeedEvidence(
    input.seedEvidence,
    input.sourceCommand.expectedRevision,
  );
  const intervention = input.sourceCommand.type === "set_recurring_strategy"
    ? planStrategyIntervention(input, input.sourceCommand)
    : planEventIntervention(input, input.sourceCommand);
  const changedPaths = canonicalStructuralDiffPathsV1(
    input.sourceCommand,
    intervention.alternateCommand,
    ["payload.strategy.insuranceCoverageIds"],
  );
  if (
    changedPaths.length !== 1 ||
    changedPaths[0] !== intervention.interventionPath
  ) {
    throw new CounterfactualV1Error(
      "MULTIPLE_CHANGES",
      "alternateCommand",
      `expected only ${intervention.interventionPath}; got ${changedPaths.join(", ")}`,
    );
  }
  return Object.freeze({
    version: COUNTERFACTUAL_V1_VERSION,
    sourceCommandId: input.sourceCommand.id,
    sourceRevision: input.sourceCommand.expectedRevision,
    interventionPath: intervention.interventionPath,
    originalValue: intervention.originalValue,
    alternateValue: intervention.alternateValue,
    changedPaths,
    requestedHorizonMonths: input.request.horizonMonths,
    maximumAcceptedCommands:
      COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumAcceptedCommands,
    sourceCommandChecksum: sha256Canonical(input.sourceCommand),
    alternateCommandChecksum: sha256Canonical(intervention.alternateCommand),
    seedEvidence,
    assumptions: COUNTERFACTUAL_ASSUMPTIONS_V1,
    alternateCommand: intervention.alternateCommand,
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function checkedAdd(left: number, right: number, path: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      path,
      "verified outcome arithmetic exceeded the safe integer range",
    );
  }
  return result;
}

function checkedDifference(
  alternative: number,
  actual: number,
  path: string,
): number {
  const result = alternative - actual;
  if (!Number.isSafeInteger(result)) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      path,
      "verified branch difference exceeded the safe integer range",
    );
  }
  return result;
}

function validateStateOutcome(
  outcome: CounterfactualStateOutcomeV1,
  path: string,
): CounterfactualStateOutcomeV1 {
  try {
    simulationMonth(outcome.month);
  } catch {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      `${path}.month`,
      "must be a canonical simulation month",
    );
  }
  const integers = [
    outcome.revision,
    outcome.cashCents,
    outcome.totalDebtCents,
    outcome.netWorthCents,
    outcome.fiProgressPpm,
  ];
  if (
    integers.some((value) => !Number.isSafeInteger(value)) ||
    outcome.revision < 0 ||
    outcome.cashCents < 0 ||
    outcome.totalDebtCents < 0 ||
    outcome.fiProgressPpm < 0 ||
    outcome.fiProgressPpm > 1_000_000 ||
    (outcome.recoveryRemainingMonths !== null &&
      (!Number.isSafeInteger(outcome.recoveryRemainingMonths) ||
        outcome.recoveryRemainingMonths < 0)) ||
    (outcome.outcomeKind !== null && !IDENTIFIER.test(outcome.outcomeKind)) ||
    (outcome.outcomeReasonCode !== null &&
      !IDENTIFIER.test(outcome.outcomeReasonCode))
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      path,
      "state outcome must contain bounded structured engine values",
    );
  }
  return deepFreeze({ ...outcome }) as CounterfactualStateOutcomeV1;
}

function validateMonthlyOutcome(
  outcome: CounterfactualMonthlyOutcomeV1,
  path: string,
): CounterfactualMonthlyOutcomeV1 {
  if (
    Object.values(outcome).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      path,
      "monthly outcome must contain non-negative safe integers",
    );
  }
  return deepFreeze({ ...outcome }) as CounterfactualMonthlyOutcomeV1;
}

function addMonthlyOutcome(
  total: CounterfactualMonthlyOutcomeV1,
  next: CounterfactualMonthlyOutcomeV1,
  path: string,
): CounterfactualMonthlyOutcomeV1 {
  return {
    forcedSaleGrossCents: checkedAdd(
      total.forcedSaleGrossCents,
      next.forcedSaleGrossCents,
      `${path}.forcedSaleGrossCents`,
    ),
    forcedSaleCount: checkedAdd(
      total.forcedSaleCount,
      next.forcedSaleCount,
      `${path}.forcedSaleCount`,
    ),
    newRevolvingCreditCents: checkedAdd(
      total.newRevolvingCreditCents,
      next.newRevolvingCreditCents,
      `${path}.newRevolvingCreditCents`,
    ),
    residualShortfallCents: checkedAdd(
      total.residualShortfallCents,
      next.residualShortfallCents,
      `${path}.residualShortfallCents`,
    ),
  };
}

function stateEvidenceChecksum(
  stateEvidenceId: string,
  expectedRevision: number,
): string {
  const match = /^state:(\d+):([a-f0-9]{64})$/.exec(stateEvidenceId);
  if (!match || Number(match[1]) !== expectedRevision) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "plan.seedEvidence.stateEvidenceId",
      "must identify the exact verified opening state",
    );
  }
  return match[2]!;
}

function seedEvidenceMatches(
  actual: CounterfactualSeedEvidenceV1,
  alternative: CounterfactualSeedEvidenceV1,
): "shared_cursor" | "named_world" | null {
  if (actual.mode !== alternative.mode) return null;
  if (actual.mode === "shared_cursor" && alternative.mode === "shared_cursor") {
    return actual.randomStateChecksum === alternative.randomStateChecksum
      ? "shared_cursor"
      : null;
  }
  if (actual.mode === "named_world" && alternative.mode === "named_world") {
    return actual.version === alternative.version &&
      actual.macroEpoch === alternative.macroEpoch &&
      actual.eventOpportunityEpoch === alternative.eventOpportunityEpoch
      ? "named_world"
      : null;
  }
  return null;
}

function branchOutcome(
  state: CounterfactualStateOutcomeV1,
  monthly: CounterfactualMonthlyOutcomeV1,
  checksum: string,
): CounterfactualBranchOutcomeV1 {
  if (!CHECKSUM.test(checksum)) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "finalStateChecksum",
      "production state checksum must be canonical SHA-256",
    );
  }
  return deepFreeze({
    ...state,
    ...monthly,
    finalStateChecksum: checksum,
  }) as CounterfactualBranchOutcomeV1;
}

export function executeCounterfactualV1<
  TState,
  TCommand,
  TMonthlyRecord,
>(
  input: CounterfactualExecutionInputV1<TState, TCommand>,
  port: CounterfactualExecutionPortV1<TState, TCommand, TMonthlyRecord>,
): CounterfactualResultV1 {
  const openingChecksum = port.canonicalStateChecksum(input.openingState);
  const expectedOpeningChecksum = stateEvidenceChecksum(
    input.plan.seedEvidence.stateEvidenceId,
    input.plan.sourceRevision,
  );
  const sourceCommandChecksum = sha256Canonical(input.sourceCommand);
  const futureCommandChecksums = input.futureCommands.map(sha256Canonical);
  if (
    input.plan.version !== COUNTERFACTUAL_V1_VERSION ||
    openingChecksum !== expectedOpeningChecksum ||
    sourceCommandChecksum !== input.plan.sourceCommandChecksum
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "executionInput",
      "plan, opening state, and accepted source command must match",
    );
  }
  const sourceMetadata = port.commandMetadata(input.sourceCommand);
  const alternateCommand = input.plan.alternateCommand as unknown as TCommand;
  const alternateMetadata = port.commandMetadata(alternateCommand);
  if (
    sourceMetadata.id !== input.plan.sourceCommandId ||
    sourceMetadata.expectedRevision !== input.plan.sourceRevision ||
    alternateMetadata.id !== sourceMetadata.id ||
    alternateMetadata.expectedRevision !== sourceMetadata.expectedRevision ||
    sha256Canonical(alternateCommand) !== input.plan.alternateCommandChecksum
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "sourceCommand",
      "source and alternate command envelopes do not match the verified plan",
    );
  }
  const openingOutcome = validateStateOutcome(
    port.summarizeState(input.openingState),
    "openingState",
  );
  if (openingOutcome.revision !== input.plan.sourceRevision) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "openingState.revision",
      "must match the source command expected revision",
    );
  }

  let actualApplied: Readonly<{
    state: TState;
    monthlyRecord: TMonthlyRecord | null;
  }>;
  try {
    actualApplied = port.reduceProductionCommand(
      input.openingState,
      input.sourceCommand,
    );
  } catch (error) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "sourceCommand",
      error instanceof Error
        ? `production replay rejected the accepted source: ${error.message}`
        : "production replay rejected the accepted source",
    );
  }
  if (
    port.canonicalStateChecksum(input.openingState) !== openingChecksum ||
    sha256Canonical(input.sourceCommand) !== sourceCommandChecksum
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "sourceCommand",
      "production replay mutated authoritative opening evidence",
    );
  }
  let alternativeApplied: Readonly<{
    state: TState;
    monthlyRecord: TMonthlyRecord | null;
  }>;
  try {
    alternativeApplied = port.reduceProductionCommand(
      input.openingState,
      alternateCommand,
    );
  } catch (error) {
    throw new CounterfactualV1Error(
      "ALTERNATE_COMMAND_REJECTED",
      "alternateCommand",
      error instanceof Error
        ? `production reducer rejected the one-change alternative: ${error.message}`
        : "production reducer rejected the one-change alternative",
    );
  }
  if (port.canonicalStateChecksum(input.openingState) !== openingChecksum) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "openingState",
      "alternative replay mutated authoritative opening evidence",
    );
  }

  let actualState = actualApplied.state;
  let alternativeState = alternativeApplied.state;
  let actualSummary = validateStateOutcome(
    port.summarizeState(actualState),
    "actual.source",
  );
  let alternativeSummary = validateStateOutcome(
    port.summarizeState(alternativeState),
    "alternative.source",
  );
  let actualMonthly: CounterfactualMonthlyOutcomeV1 = {
    forcedSaleGrossCents: 0,
    forcedSaleCount: 0,
    newRevolvingCreditCents: 0,
    residualShortfallCents: 0,
  };
  let alternativeMonthly = { ...actualMonthly };
  let comparedMonths = 0;
  let acceptedCommandCount = 1;
  let lastComparableRevision = Math.min(
    actualSummary.revision,
    alternativeSummary.revision,
  );
  let lastComparableMonth = sourceMetadata.effectiveMonth;
  let stopReason: CounterfactualStopReasonV1 | null = null;
  let matchedSeedMode: "shared_cursor" | "named_world" | null = null;
  let divergentSeedMode: "shared_cursor" | "named_world" | null = null;
  const taxEvidenceIds = new Set<string>();

  if (actualSummary.outcomeKind !== null) stopReason = "actual_terminal";
  else if (alternativeSummary.outcomeKind !== null) stopReason = "alternate_terminal";

  for (const [index, command] of input.futureCommands.entries()) {
    if (stopReason !== null) break;
    if (
      acceptedCommandCount >=
      COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumAcceptedCommands
    ) {
      stopReason = "command_limit_reached";
      break;
    }
    const metadata = port.commandMetadata(command);
    if (
      !IDENTIFIER.test(metadata.id) ||
      !Number.isSafeInteger(metadata.expectedRevision) ||
      metadata.expectedRevision !== actualSummary.revision
    ) {
      throw new CounterfactualV1Error(
        "SOURCE_EVIDENCE_CORRUPT",
        `futureCommands.${index}`,
        "accepted actual command stream is not contiguous",
      );
    }
    if (metadata.expectedRevision !== alternativeSummary.revision) {
      stopReason = "future_command_no_longer_valid";
      break;
    }
    if (metadata.isMonthlyCommand) {
      if (comparedMonths >= input.plan.requestedHorizonMonths) {
        stopReason = "requested_horizon_reached";
        break;
      }
      const seeds = port.seedEvidenceAtMonthlyOpening(
        actualState,
        alternativeState,
      );
      validateSeedEvidence(seeds.actual, actualSummary.revision);
      validateSeedEvidence(seeds.alternative, alternativeSummary.revision);
      const seedMode = seedEvidenceMatches(seeds.actual, seeds.alternative);
      if (
        seedMode === null ||
        (matchedSeedMode !== null && matchedSeedMode !== seedMode)
      ) {
        divergentSeedMode =
          seeds.actual.mode === "named_world" ||
          seeds.alternative.mode === "named_world"
            ? "named_world"
            : "shared_cursor";
        stopReason = "seed_control_unavailable_after_rng_divergence";
        break;
      }
      matchedSeedMode = seedMode;
      const tax = port.taxCompatibilityBeforeMonthlyCommand(
        actualState,
        alternativeState,
        command,
      );
      if (!tax.compatible) {
        stopReason = "tax_evidence_not_valid_for_alternative";
        break;
      }
      if (!isCausalSourceEvidenceIdV1(tax.taxEvidenceId)) {
        throw new CounterfactualV1Error(
          "SOURCE_EVIDENCE_CORRUPT",
          `futureCommands.${index}.taxEvidenceId`,
          "tax compatibility must cite verified tax evidence",
        );
      }
      taxEvidenceIds.add(tax.taxEvidenceId);
    }

    let nextActual: Readonly<{
      state: TState;
      monthlyRecord: TMonthlyRecord | null;
    }>;
    try {
      nextActual = port.reduceProductionCommand(actualState, command);
    } catch (error) {
      throw new CounterfactualV1Error(
        "SOURCE_EVIDENCE_CORRUPT",
        `futureCommands.${index}`,
        error instanceof Error
          ? `production replay rejected accepted actual history: ${error.message}`
          : "production replay rejected accepted actual history",
      );
    }
    let nextAlternative: Readonly<{
      state: TState;
      monthlyRecord: TMonthlyRecord | null;
    }>;
    try {
      nextAlternative = port.reduceProductionCommand(alternativeState, command);
    } catch {
      stopReason = "future_command_no_longer_valid";
      break;
    }
    actualState = nextActual.state;
    alternativeState = nextAlternative.state;
    actualSummary = validateStateOutcome(
      port.summarizeState(actualState),
      `actual.future.${index}`,
    );
    alternativeSummary = validateStateOutcome(
      port.summarizeState(alternativeState),
      `alternative.future.${index}`,
    );
    acceptedCommandCount += 1;
    lastComparableRevision = Math.min(
      actualSummary.revision,
      alternativeSummary.revision,
    );
    lastComparableMonth = metadata.effectiveMonth;

    if (metadata.isMonthlyCommand) {
      if (
        nextActual.monthlyRecord === null ||
        nextAlternative.monthlyRecord === null
      ) {
        throw new CounterfactualV1Error(
          "SOURCE_EVIDENCE_CORRUPT",
          `futureCommands.${index}.monthlyRecord`,
          "a production monthly command must return monthly evidence",
        );
      }
      actualMonthly = addMonthlyOutcome(
        actualMonthly,
        validateMonthlyOutcome(
          port.summarizeMonthlyRecord(nextActual.monthlyRecord),
          `actual.future.${index}.monthlyRecord`,
        ),
        "actual.cumulative",
      );
      alternativeMonthly = addMonthlyOutcome(
        alternativeMonthly,
        validateMonthlyOutcome(
          port.summarizeMonthlyRecord(nextAlternative.monthlyRecord),
          `alternative.future.${index}.monthlyRecord`,
        ),
        "alternative.cumulative",
      );
      comparedMonths += 1;
    }
    if (actualSummary.outcomeKind !== null) stopReason = "actual_terminal";
    else if (alternativeSummary.outcomeKind !== null) {
      stopReason = "alternate_terminal";
    } else if (comparedMonths >= input.plan.requestedHorizonMonths) {
      stopReason = "requested_horizon_reached";
    }
  }
  if (stopReason === null) stopReason = "actual_history_exhausted";

  if (
    port.canonicalStateChecksum(input.openingState) !== openingChecksum ||
    sha256Canonical(input.sourceCommand) !== sourceCommandChecksum ||
    input.futureCommands.some(
      (command, index) =>
        sha256Canonical(command) !== futureCommandChecksums[index],
    )
  ) {
    throw new CounterfactualV1Error(
      "SOURCE_EVIDENCE_CORRUPT",
      "execution",
      "counterfactual execution mutated authoritative evidence",
    );
  }

  const actual = branchOutcome(
    actualSummary,
    actualMonthly,
    port.canonicalStateChecksum(actualState),
  );
  const alternative = branchOutcome(
    alternativeSummary,
    alternativeMonthly,
    port.canonicalStateChecksum(alternativeState),
  );
  const difference: CounterfactualDifferenceV1 = deepFreeze({
    direction: "alternative_minus_actual",
    cashCents: checkedDifference(
      alternative.cashCents,
      actual.cashCents,
      "difference.cashCents",
    ),
    totalDebtCents: checkedDifference(
      alternative.totalDebtCents,
      actual.totalDebtCents,
      "difference.totalDebtCents",
    ),
    netWorthCents: checkedDifference(
      alternative.netWorthCents,
      actual.netWorthCents,
      "difference.netWorthCents",
    ),
    forcedSaleGrossCents: checkedDifference(
      alternative.forcedSaleGrossCents,
      actual.forcedSaleGrossCents,
      "difference.forcedSaleGrossCents",
    ),
    forcedSaleCount: checkedDifference(
      alternative.forcedSaleCount,
      actual.forcedSaleCount,
      "difference.forcedSaleCount",
    ),
    newRevolvingCreditCents: checkedDifference(
      alternative.newRevolvingCreditCents,
      actual.newRevolvingCreditCents,
      "difference.newRevolvingCreditCents",
    ),
    residualShortfallCents: checkedDifference(
      alternative.residualShortfallCents,
      actual.residualShortfallCents,
      "difference.residualShortfallCents",
    ),
    recoveryRemainingMonths:
      actual.recoveryRemainingMonths === null ||
      alternative.recoveryRemainingMonths === null
        ? null
        : checkedDifference(
            alternative.recoveryRemainingMonths,
            actual.recoveryRemainingMonths,
            "difference.recoveryRemainingMonths",
          ),
    fiProgressPpm: checkedDifference(
      alternative.fiProgressPpm,
      actual.fiProgressPpm,
      "difference.fiProgressPpm",
    ),
    outcomeChanged:
      actual.outcomeKind !== alternative.outcomeKind ||
      actual.outcomeReasonCode !== alternative.outcomeReasonCode,
  }) as CounterfactualDifferenceV1;
  const seedControlMode: CounterfactualSeedControlModeV1 =
    matchedSeedMode === "named_world"
      ? "matched_named_world"
      : divergentSeedMode === "named_world"
        ? "named_world_control_unavailable"
      : stopReason === "seed_control_unavailable_after_rng_divergence"
        ? "partial_shared_cursor_then_diverged"
        : matchedSeedMode === "shared_cursor"
          ? "matched_shared_cursor_through_horizon"
          : "not_applicable_no_future_month";
  const evidenceIds = [
    input.plan.seedEvidence.stateEvidenceId,
    `command:${input.plan.sourceCommandId}`,
    ...taxEvidenceIds,
    `counterfactual-state:actual:${actual.revision}:${actual.finalStateChecksum}`,
    `counterfactual-state:alternative:${alternative.revision}:${alternative.finalStateChecksum}`,
  ].sort(compareText);
  const checksumInput = {
    version: COUNTERFACTUAL_V1_VERSION,
    sourceCommandId: input.plan.sourceCommandId,
    sourceRevision: input.plan.sourceRevision,
    interventionPath: input.plan.interventionPath,
    originalValue: input.plan.originalValue,
    alternateValue: input.plan.alternateValue,
    changedPaths: input.plan.changedPaths,
    requestedHorizonMonths: input.plan.requestedHorizonMonths,
    comparedMonths,
    acceptedCommandCount,
    lastComparableRevision,
    lastComparableMonth,
    stopReason,
    seedControl: {
      mode: seedControlMode,
      lastComparableRevision,
      lastComparableMonth,
    },
    assumptions: COUNTERFACTUAL_ASSUMPTIONS_V1,
    actual,
    alternative,
    difference,
    evidenceIds,
  };
  return deepFreeze({
    ...checksumInput,
    resultChecksum: sha256Canonical(checksumInput),
  }) as CounterfactualResultV1;
}
