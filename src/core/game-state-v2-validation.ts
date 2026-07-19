import { canonicalJson, sha256Canonical } from "./canonical";
import { compareMonths, monthsBetween, simulationMonth } from "./domain/month";
import { randomState } from "./domain/rng";
import { decodeOptionalWorldRandomStateV1 } from "./world-random-v1";
import {
  assertValidGameState,
  calculateAgeYearsAtMonth,
  calculateNetWorth,
  type GameState as GameStateV1,
  type DeterministicGameOutcomeV1,
  type StateInvariantViolation,
} from "./game-state";
import {
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
  V1_TO_V2_MIGRATION_VERSION,
} from "./game-state-v2-constants";
import type {
  GameStateV2,
  PendingEventV2,
  ResolvedEventEvidenceV2,
} from "./game-state-v2";
import type { PersonalEventTemplateV2 } from "./personal-event-v2";
import { validateCatalogAndBenefitsStateV2 } from "./game-state-v2-catalog-validation";
import { validateEventAndCareerStateV2 } from "./game-state-v2-event-validation";
import {
  projectFinancialGoal,
  projectFinancialGoalV1Compatibility,
  validateFinancialGoal,
} from "./financial-goals-v2";
import { validateLifeMilestoneState } from "./life-milestones-v2";
import { validateAiLearningMemory } from "./ai-learning-memory-v2";
import { validateRuntimeBalanceStateV1 } from "./runtime-balance-state-v1";
import {
  validateRuntimeBalanceStateV2,
  type RuntimeBalanceRecentEventV2,
} from "./runtime-balance-state-v2";

import {
  validateMacroMarketSnapshotV2,
  type MacroMarketSnapshotV2,
} from "./market";
import {
  gradeRetirementProgressV1,
  outcomePolicyForVersionV2,
} from "./outcome-policy-v2";

export type GameStateV2ValidationOptions = Readonly<{
  personalEventCatalog?: readonly PersonalEventTemplateV2[];
  allowTransientRandomAdvance?: boolean;
}>;

export class InvalidGameStateV2Error extends Error {
  readonly violations: readonly StateInvariantViolation[];

  constructor(violations: readonly StateInvariantViolation[]) {
    super(
      `game state v2 violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidGameStateV2Error";
    this.violations = violations;
  }
}

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sum(values: readonly number[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0));
}

const ONBOARDING_ASSUMPTION_CODES = new Set([
  "DEFAULT_START_MONTH",
  "DEFAULT_CATALOG_VERSION",
  "DEFAULT_CATALOG_SELECTION",
  "UNKNOWN_LOCATION_PRODUCT_DEFAULT",
  "DEFAULT_STARTING_CASH",
  "DEFAULT_FINANCE_ZERO",
  "DEFAULT_CREDIT_LIMIT",
  "DEFAULT_WELLBEING",
  "DEFAULT_INSURANCE",
  "DEFAULT_RUNTIME_DIFFICULTY",
  "DEFAULT_FINANCIAL_GOAL",
  "DEFAULT_CATALOG_LIVING_COST",
  "DEFAULT_EXPENSE_ZERO",
  "TAKE_HOME_DISPLAY_ONLY",
  "DECLARED_EXPENSES_AUTHORITATIVE",
]);
const ONBOARDING_FIELD_SOURCES = new Set([
  "user_entered",
  "persona_fixture",
  "catalog_default",
  "product_default",
]);

function validateOnboardingInitializationV1(
  state: GameStateV2,
  violations: StateInvariantViolation[],
  options: GameStateV2ValidationOptions,
): void {
  const evidence = state.gameplay.initialization;
  if (evidence === undefined) return;
  const hash = /^[a-f0-9]{64}$/;
  const baseValid =
    evidence !== null &&
    typeof evidence === "object" &&
    evidence.version === "onboarding-v1" &&
    evidence.schemaVersion === 2 &&
    ["typed", "persona", "ai_assisted"].includes(evidence.sourceMode) &&
    evidence.defaultsVersion === "onboarding-defaults-v1" &&
    evidence.locationDefaultsVersion === "onboarding-location-defaults-v1" &&
    evidence.confirmed === true &&
    hash.test(evidence.reviewChecksum) &&
    hash.test(evidence.normalizedInputChecksum) &&
    typeof evidence.initialRandomSeed === "string" &&
    evidence.initialRandomSeed.length >= 1 &&
    evidence.initialRandomSeed.length <= 256 &&
    evidence.derivedOwners?.stateAndObligations === "createNativeGameStateV2" &&
    evidence.derivedOwners?.financialGoal === "projectFinancialGoal" &&
    (("risk" in evidence.derivedOwners &&
      evidence.derivedOwners.risk === "analyzeRiskV1") ||
      ("exposure" in evidence.derivedOwners &&
        evidence.derivedOwners.exposure === "recordExposureSnapshotV2"));
  if (!baseValid) {
    violations.push(
      violation(
        "gameplay.initialization",
        "invalid_onboarding_initialization",
        "onboarding evidence must use supported closed versions, checksums, seed, confirmation, and owners",
      ),
    );
    return;
  }
  if (
    state.revision === 0 &&
    options.allowTransientRandomAdvance !== true &&
    sha256Canonical(randomState(evidence.initialRandomSeed)) !==
      sha256Canonical(state.random)
  ) {
    violations.push(
      violation(
        "gameplay.initialization.initialRandomSeed",
        "onboarding_seed_mismatch",
        "the persisted initial seed must produce the authoritative opening RNG state",
      ),
    );
  }
  const persona = evidence.persona;
  const validPersona =
    persona !== null &&
    typeof persona === "object" &&
    typeof persona.id === "string" &&
    persona.id.length > 0 &&
    persona.version === "onboarding-persona-v1";
  if (
    (evidence.sourceMode === "persona" && !validPersona) ||
    (evidence.sourceMode === "typed" && persona !== null) ||
    (evidence.sourceMode === "ai_assisted" && persona !== null && !validPersona)
  ) {
    violations.push(
      violation(
        "gameplay.initialization.persona",
        "onboarding_persona_mismatch",
        "persona evidence is required for persona mode, optional for hybrid AI-assisted mode, and absent for typed mode",
      ),
    );
  }
  const assumptions = Array.isArray(evidence.assumptions)
    ? evidence.assumptions
    : [];
  const provenance = Array.isArray(evidence.provenance)
    ? evidence.provenance
    : [];
  const assumptionsValid =
    Array.isArray(evidence.assumptions) &&
    assumptions.length <= 64 &&
    assumptions.every(
      (entry) =>
        typeof entry?.path === "string" &&
        entry.path.length > 0 &&
        entry.path.length <= 160 &&
        ONBOARDING_ASSUMPTION_CODES.has(entry.code) &&
        typeof entry.sourceId === "string" &&
        entry.sourceId.length > 0 &&
        entry.sourceId.length <= 160 &&
        typeof entry.sourceVersion === "string" &&
        entry.sourceVersion.length > 0 &&
        entry.sourceVersion.length <= 80,
    );
  const provenanceValid =
    Array.isArray(evidence.provenance) &&
    provenance.length <= 96 &&
    provenance.every(
      (entry) =>
        typeof entry?.path === "string" &&
        entry.path.length > 0 &&
        entry.path.length <= 160 &&
        ONBOARDING_FIELD_SOURCES.has(entry.source) &&
        typeof entry.sourceId === "string" &&
        entry.sourceId.length > 0 &&
        entry.sourceId.length <= 160 &&
        typeof entry.sourceVersion === "string" &&
        entry.sourceVersion.length > 0 &&
        entry.sourceVersion.length <= 80,
    );
  const sortedAssumptions = assumptionsValid
    ? [...assumptions].sort((left, right) =>
        left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
      )
    : [];
  const sortedProvenance = provenanceValid
    ? [...provenance].sort((left, right) => left.path.localeCompare(right.path))
    : [];
  const assumptionsUnique =
    assumptionsValid &&
    new Set(assumptions.map((entry) => `${entry.path}:${entry.code}`)).size ===
      assumptions.length;
  const provenanceUnique =
    provenanceValid &&
    new Set(provenance.map((entry) => entry.path)).size === provenance.length;
  if (
    !assumptionsValid ||
    !provenanceValid ||
    sha256Canonical(assumptions) !== sha256Canonical(sortedAssumptions) ||
    sha256Canonical(provenance) !== sha256Canonical(sortedProvenance) ||
    !assumptionsUnique ||
    !provenanceUnique
  ) {
    violations.push(
      violation(
        "gameplay.initialization",
        "invalid_onboarding_evidence",
        "onboarding assumptions and provenance must be bounded, closed, unique, and canonically sorted",
      ),
    );
  }
  const expenses = evidence.declaredExpenses;
  if (expenses !== null) {
    const values =
      expenses !== undefined && typeof expenses === "object"
        ? [
            expenses.essentialAnnualCents,
            expenses.discretionaryAnnualCents,
            expenses.totalAnnualCents,
          ]
        : [];
    const evidenceDoesNotReconcile =
      values.length !== 3 ||
      !values.every(isNonNegativeSafeInteger) ||
      BigInt(values[0] ?? -1) + BigInt(values[1] ?? -1) !==
        BigInt(values[2] ?? -1);
    // This evidence records the confirmed opening budget. The live annual
    // living cost is intentionally allowed to diverge as inflation and player
    // decisions are applied, including inside a revision-zero monthly
    // transition before the command revision is finalized.
    if (evidenceDoesNotReconcile) {
      violations.push(
        violation(
          "gameplay.initialization.declaredExpenses",
          "onboarding_expense_mismatch",
          "confirmed opening expense components must reconcile internally",
        ),
      );
    }
  }
}

function validateRate(
  value: number,
  path: string,
  violations: StateInvariantViolation[],
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    violations.push(
      violation(path, "invalid_rate", "must be between 0 and 1,000,000 PPM"),
    );
  }
}

function validateMoneyRecord(
  values: Readonly<Record<string, number>>,
  prefix: string,
  violations: StateInvariantViolation[],
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!isNonNegativeSafeInteger(value)) {
      violations.push(
        violation(
          `${prefix}.${key}`,
          "invalid_money",
          "must be a non-negative safe integer number of cents",
        ),
      );
    }
  }
}

function validateDeterministicOutcomeAgainstState(
  state: GameStateV2,
  violations: StateInvariantViolation[],
): void {
  if (
    state.outcome === null ||
    !("outcomePolicyVersion" in state.outcome)
  ) {
    return;
  }
  const outcome = state.outcome as DeterministicGameOutcomeV1;
  let policy;
  let projection;
  let compatibilityProjection;
  try {
    policy = outcomePolicyForVersionV2(outcome.outcomePolicyVersion);
    projection = projectFinancialGoal(
      state.finances,
      state.gameplay.financialGoal,
    );
    compatibilityProjection = projectFinancialGoalV1Compatibility(
      state.finances,
      state.gameplay.financialGoal,
    );
  } catch {
    violations.push(
      violation(
        "outcome",
        "invalid_outcome_authority",
        "versioned outcome evidence must resolve through supported goal and outcome policies",
      ),
    );
    return;
  }

  const fi = outcome.financialIndependence;
  const matchesProjection = (candidate: typeof projection): boolean =>
    fi.goalSource === candidate.goal.source &&
    fi.investableAssetsCents === candidate.investableAssetsCents &&
    fi.targetCents === candidate.targetCents &&
    fi.progressPpm === candidate.progressPpm;
  const matchingProjection = matchesProjection(projection)
    ? projection
    : matchesProjection(compatibilityProjection)
      ? compatibilityProjection
      : null;
  if (matchingProjection === null) {
    violations.push(
      violation(
        "outcome.financialIndependence",
        "outcome_projection_mismatch",
        "FI evidence must equal the authoritative projection from persisted state",
      ),
    );
  }

  if (outcome.displayedNetWorthCents !== calculateNetWorth(state.finances)) {
    violations.push(
      violation(
        "outcome.displayedNetWorthCents",
        "outcome_net_worth_mismatch",
        "displayed net worth must equal the authoritative state calculation",
      ),
    );
  }

  const currentAgeYears = calculateAgeYearsAtMonth(
    state.player.birthMonth,
    state.currentMonth,
  );
  const expectedGrade = gradeRetirementProgressV1(
    (matchingProjection ?? projection).progressPpm,
    outcome.outcomePolicyVersion,
  );
  const retirement = outcome.retirementReadiness;
  if (
    retirement.retirementAgeYears !== policy.retirementAgeYears ||
    retirement.currentAgeYears !== currentAgeYears ||
    retirement.reachedRetirementAge !==
      (currentAgeYears >= policy.retirementAgeYears) ||
    retirement.gradeIfRetiredNow !== expectedGrade
  ) {
    violations.push(
      violation(
        "outcome.retirementReadiness",
        "outcome_retirement_mismatch",
        "retirement evidence must equal the authoritative age, policy, and FI grade",
      ),
    );
  }

  const solvent = outcome.automaticLiquidSolvency.isSolvent;
  const validTerminalState =
    (outcome.kind === "bankruptcy" &&
      outcome.grade === "F" &&
      !solvent) ||
    (outcome.kind === "financial_independence" &&
      outcome.grade === "S" &&
      solvent &&
      projection.progressPpm === 1_000_000) ||
    (outcome.kind === "retirement_age" &&
      outcome.grade === expectedGrade &&
      solvent &&
      projection.progressPpm < 1_000_000 &&
      currentAgeYears >= policy.retirementAgeYears);
  if (!validTerminalState) {
    violations.push(
      violation(
        "outcome.kind",
        "outcome_terminal_state_mismatch",
        "outcome kind and grade must match persisted solvency, FI progress, and age",
      ),
    );
  }
}

function runtimeBalanceEventMatchesLifecycle(
  cached: RuntimeBalanceRecentEventV2,
  lifecycle: PendingEventV2 | ResolvedEventEvidenceV2,
): boolean {
  const lifecycleLessons = lifecycle.lessonTags === undefined
    ? null
    : [lifecycle.lessonTags.primary, ...lifecycle.lessonTags.secondary];
  return cached.eventId === lifecycle.eventId &&
    cached.templateId === lifecycle.templateId &&
    cached.templateVersion === lifecycle.templateVersion &&
    cached.tier === lifecycle.tier &&
    cached.targetedWeakness === lifecycle.targetedWeakness &&
    cached.approvedMonth === lifecycle.scheduledMonth &&
    (lifecycle.category === undefined || cached.category === lifecycle.category) &&
    (lifecycleLessons === null ||
      canonicalJson(cached.lessonTags) === canonicalJson(lifecycleLessons));
}

function validateRuntimeBalanceLifecycleV2(
  state: GameStateV2,
  violations: StateInvariantViolation[],
): void {
  const balance = state.gameplay.runtimeBalance;
  if (balance?.version !== 2) return;
  if (!Array.isArray(balance.recentEvents)) return;
  const indexedRecentEvents = balance.recentEvents.flatMap((event, index) => {
    if (
      event === null ||
      typeof event !== "object" ||
      typeof event.eventId !== "string"
    ) return [];
    try {
      simulationMonth(event.approvedMonth);
      if (compareMonths(event.approvedMonth, state.currentMonth) > 0) {
        violations.push(violation(
          `gameplay.runtimeBalance.recentEvents.${index}.approvedMonth`,
          "runtime_balance_future_approval",
          "cached approval month cannot be later than the authoritative current month",
        ));
      }
      return [{ event, index }];
    } catch {
      return [];
    }
  });
  const recentEvents = indexedRecentEvents.map(({ event }) => event);
  const lifecycleEvidence = [
    ...(state.gameplay.eventLifecycle.pending === null
      ? []
      : [state.gameplay.eventLifecycle.pending]),
    ...state.gameplay.eventLifecycle.history,
  ];
  const cachedByEventId = new Map(
    recentEvents.map((event) => [event.eventId, event]),
  );

  indexedRecentEvents.forEach(({ event: cached, index }) => {
    const lifecycle = lifecycleEvidence.find(
      ({ eventId }) => eventId === cached.eventId,
    );
    if (
      lifecycle === undefined ||
      !runtimeBalanceEventMatchesLifecycle(cached, lifecycle)
    ) {
      violations.push(violation(
        `gameplay.runtimeBalance.recentEvents.${index}`,
        "runtime_balance_lifecycle_mismatch",
        "cached Runtime Balance event evidence must match pending or resolved lifecycle evidence",
      ));
    }
  });

  const validLegacyCarryover = balance.legacyCarryover !== undefined &&
    balance.legacyCarryover !== null &&
    typeof balance.legacyCarryover === "object" &&
    (balance.legacyCarryover.lastApprovedEventMonth === null ||
      (() => {
        try {
          simulationMonth(balance.legacyCarryover!.lastApprovedEventMonth!);
          return true;
        } catch {
          return false;
        }
      })()) &&
    Number.isSafeInteger(balance.legacyCarryover.catastropheCount) &&
    balance.legacyCarryover.catastropheCount >= 0
      ? balance.legacyCarryover
      : null;
  const latestApprovedMonth = (
    events: readonly RuntimeBalanceRecentEventV2[],
    legacyMonth: GameStateV2["currentMonth"] | null = null,
  ) => {
    const months = [
      ...(legacyMonth === null ? [] : [legacyMonth]),
      ...events.map(({ approvedMonth }) => approvedMonth),
    ];
    return months.reduce<GameStateV2["currentMonth"] | null>(
      (latest, month) =>
        latest === null || compareMonths(month, latest) > 0 ? month : latest,
      null,
    );
  };
  const expectedElapsed = (approvedMonth: GameStateV2["currentMonth"] | null) =>
    approvedMonth === null
      ? null
      : Math.max(0, monthsBetween(approvedMonth, state.currentMonth));
  const timerChecks = [
    {
      path: "monthsSinceAnyEvent",
      actual: balance.monthsSinceAnyEvent,
      expected: expectedElapsed(latestApprovedMonth(
        recentEvents,
        validLegacyCarryover?.lastApprovedEventMonth ?? null,
      )),
    },
    {
      path: "monthsSinceMediumEvent",
      actual: balance.monthsSinceMediumEvent,
      expected: expectedElapsed(latestApprovedMonth(
        recentEvents.filter(({ tier }) => tier === "medium"),
      )),
    },
    {
      path: "monthsSinceLargeEvent",
      actual: balance.monthsSinceLargeEvent,
      expected: expectedElapsed(latestApprovedMonth(
        recentEvents.filter(({ tier }) => tier === "large"),
      )),
    },
    {
      path: "monthsSinceCatastrophicEvent",
      actual: balance.monthsSinceCatastrophicEvent,
      expected: expectedElapsed(latestApprovedMonth(
        recentEvents.filter(({ tier }) => tier === "catastrophe"),
      )),
    },
  ];
  for (const { path, actual, expected } of timerChecks) {
    if (actual !== expected) {
      violations.push(violation(
        `gameplay.runtimeBalance.${path}`,
        "runtime_balance_timer_mismatch",
        "event spacing counters must derive from retained lifecycle-backed approval evidence",
      ));
    }
  }
  const expectedCatastropheCount =
    (validLegacyCarryover?.catastropheCount ?? 0) +
    recentEvents.filter(({ tier }) => tier === "catastrophe").length;
  if (balance.catastropheCount !== expectedCatastropheCount) {
    violations.push(violation(
      "gameplay.runtimeBalance.catastropheCount",
      "runtime_balance_catastrophe_count_mismatch",
      "catastrophe count must equal legacy carryover plus retained lifecycle-backed approvals",
    ));
  }

  const pending = state.gameplay.eventLifecycle.pending;
  if (pending !== null && !cachedByEventId.has(pending.eventId)) {
    violations.push(violation(
      "gameplay.eventLifecycle.pending",
      "runtime_balance_pending_cache_mismatch",
      "a pending event in Runtime Balance v2 must appear in the bounded recent-event cache",
    ));
  }

  if (
    balance.recovery !== null &&
    balance.recovery !== undefined &&
    typeof balance.recovery === "object" &&
    balance.recovery.sourceEventId !== "legacy.runtime-balance-v1"
  ) {
    const cached = cachedByEventId.get(balance.recovery.sourceEventId);
    const lifecycle = lifecycleEvidence.find(
      ({ eventId }) => eventId === balance.recovery?.sourceEventId,
    );
    if (
      cached === undefined ||
      lifecycle === undefined ||
      cached.tier !== balance.recovery.sourceTier ||
      cached.targetedWeakness !== balance.recovery.targetedWeakness ||
      !runtimeBalanceEventMatchesLifecycle(cached, lifecycle)
    ) {
      violations.push(violation(
        "gameplay.runtimeBalance.recovery",
        "runtime_balance_recovery_source_mismatch",
        "active recovery must reference matching cached and lifecycle event evidence",
      ));
    }
  }
}

export function validateGameStateV2(
  state: GameStateV2,
  options: GameStateV2ValidationOptions = {},
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  if (state.gameplay.runtimeBalance !== undefined) {
    const runtimeViolations = state.gameplay.runtimeBalance?.version === 2
      ? validateRuntimeBalanceStateV2(state.gameplay.runtimeBalance)
      : validateRuntimeBalanceStateV1(
          state.gameplay.runtimeBalance as import("./runtime-balance-state-v1").RuntimeBalanceStateV1,
        );
    violations.push(
      ...runtimeViolations.map(
        (runtimeViolation) => ({
          ...runtimeViolation,
          path:
            runtimeViolation.path.length === 0
              ? "gameplay.runtimeBalance"
              : `gameplay.runtimeBalance.${runtimeViolation.path}`,
        }),
      ),
    );
    validateRuntimeBalanceLifecycleV2(state, violations);
  }

  if (state.gameplay.financialGoal !== undefined) {
    try {
      validateFinancialGoal(state.gameplay.financialGoal);
    } catch {
      violations.push(
        violation(
          "gameplay.financialGoal",
          "invalid_financial_goal",
          "FI goal must use goals-v1 with bounded spending, withdrawal rate, and age",
        ),
      );
    }
  }
  if (state.gameplay.lifeMilestones !== undefined) {
    try {
      validateLifeMilestoneState(state.gameplay.lifeMilestones);
    } catch {
      violations.push(
        violation(
          "gameplay.lifeMilestones",
          "invalid_life_milestones",
          "life milestones must be versioned, bounded, unique, and internally reconciled",
        ),
      );
    }
  }
  if (state.gameplay.aiLearningMemory !== undefined) {
    try {
      validateAiLearningMemory(state.gameplay.aiLearningMemory);
    } catch {
      violations.push(
        violation(
          "gameplay.aiLearningMemory",
          "invalid_ai_learning_memory",
          "AI learning memory must remain versioned, bounded, unique, and structured",
        ),
      );
    }
  }

  // Most replayed/native states predate confirmed onboarding evidence. Keep
  // that optional validation out of the very hot monthly-finalization path.
  if (state.gameplay.initialization !== undefined) {
    validateOnboardingInitializationV1(state, violations, options);
  }
  try {
    decodeOptionalWorldRandomStateV1(state.worldRandom);
  } catch {
    violations.push(
      violation(
        "worldRandom",
        "invalid_world_random_state",
        "named world random state must use the exact supported version and stream shape",
      ),
    );
  }

  if (state.schemaVersion !== GAME_STATE_V2_SCHEMA_VERSION) {
    violations.push(
      violation("schemaVersion", "unsupported_schema", "must be schema version 2"),
    );
  }
  if (state.engineVersion !== ENGINE_V2_VERSION) {
    violations.push(
      violation("engineVersion", "unsupported_engine", "must be engine version 4.1.0"),
    );
  }
  if (
    state.migration !== null &&
    (state.migration.sourceSchemaVersion !== 1 ||
      state.migration.sourceEngineVersion !== "4.0.0" ||
      state.migration.targetSchemaVersion !== GAME_STATE_V2_SCHEMA_VERSION ||
      state.migration.targetEngineVersion !== ENGINE_V2_VERSION ||
      state.migration.migrationVersion !== V1_TO_V2_MIGRATION_VERSION)
  ) {
    violations.push(
      violation("migration", "invalid_migration_record", "must identify the exact v1-to-v2 migration"),
    );
  }

  const baseState: GameStateV1 = {
    ...state,
    schemaVersion: 1,
    engineVersion: "4.0.0",
  };
  try {
    assertValidGameState(baseState);
  } catch (error) {
    if (error instanceof Error && "violations" in error) {
      violations.push(
        ...((error as { violations: readonly StateInvariantViolation[] }).violations),
      );
    } else {
      violations.push(
        violation("baseState", "invalid_v1_projection", "must preserve valid v1 state invariants"),
      );
    }
  }

  validateMoneyRecord(
    state.gameplay.portfolio as unknown as Readonly<Record<string, number>>,
    "gameplay.portfolio",
    violations,
  );
  validateMoneyRecord(
    {
      legacyUnclassifiedPrincipalCents:
        state.gameplay.debts.legacyUnclassifiedPrincipalCents,
      revolvingCreditLimitCents: state.gameplay.debts.revolvingCreditLimitCents,
      revolvingCreditUsedCents: state.gameplay.debts.revolvingCreditUsedCents,
    },
    "gameplay.debts",
    violations,
  );

  const portfolio = state.gameplay.portfolio;
  const taxableTotal = sum([
    portfolio.taxableBroadIndexCents,
    portfolio.taxableSectorCents,
    portfolio.taxableSpeculativeCents,
    portfolio.taxableLegacyUnclassifiedCents,
  ]);
  const retirementTotal = sum([
    portfolio.retirement401kCents,
    portfolio.retirementIraCents,
    portfolio.retirementLegacyUnclassifiedCents,
  ]);
  const otherInvestableTotal = sum([
    portfolio.hsaCents,
    portfolio.otherInvestableLegacyUnclassifiedCents,
  ]);
  if (taxableTotal !== BigInt(state.finances.taxableInvestmentsCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "taxable_total_mismatch",
        "taxable portfolio buckets must equal the aggregate taxable balance",
      ),
    );
  }
  if (retirementTotal !== BigInt(state.finances.retirementCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "retirement_total_mismatch",
        "retirement portfolio buckets must equal the aggregate retirement balance",
      ),
    );
  }
  if (otherInvestableTotal !== BigInt(state.finances.otherInvestableAssetsCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "other_investable_total_mismatch",
        "HSA and legacy buckets must equal aggregate other investable assets",
      ),
    );
  }

  const debts = state.gameplay.debts;
  for (const [index, debt] of debts.termDebts.entries()) {
    validateMoneyRecord(
      {
        principalCents: debt.principalCents,
        minimumPaymentCents: debt.minimumPaymentCents,
      },
      `gameplay.debts.termDebts.${index}`,
      violations,
    );
    validateRate(
      debt.annualInterestRatePpm,
      `gameplay.debts.termDebts.${index}.annualInterestRatePpm`,
      violations,
    );
    if (!Number.isSafeInteger(debt.remainingTermMonths) || debt.remainingTermMonths < 0) {
      violations.push(
        violation(
          `gameplay.debts.termDebts.${index}.remainingTermMonths`,
          "invalid_term",
          "must be a non-negative safe integer",
        ),
      );
    }
    if (
      (debt.principalCents === 0 &&
        (debt.minimumPaymentCents !== 0 || debt.remainingTermMonths !== 0)) ||
      (debt.principalCents > 0 &&
        (debt.minimumPaymentCents <= 0 || debt.remainingTermMonths <= 0))
    ) {
      violations.push(
        violation(
          `gameplay.debts.termDebts.${index}`,
          "invalid_debt_lifecycle",
          "active debt requires positive payment and term; paid debt requires both zero",
        ),
      );
    }
  }
  if (
    sum([
      debts.legacyUnclassifiedPrincipalCents,
      ...debts.termDebts.map((debt) => debt.principalCents),
    ]) !== BigInt(state.finances.nonCreditLiabilitiesCents)
  ) {
    violations.push(
      violation(
        "gameplay.debts",
        "non_credit_total_mismatch",
        "term and legacy debt principal must equal aggregate non-credit liabilities",
      ),
    );
  }
  if (
    debts.revolvingCreditLimitCents !== state.finances.creditLimitCents ||
    debts.revolvingCreditUsedCents !== state.finances.creditUsedCents
  ) {
    violations.push(
      violation(
        "gameplay.debts",
        "credit_total_mismatch",
        "revolving credit must equal aggregate credit balances",
      ),
    );
  }

  const strategy = state.gameplay.recurringStrategy;
  if (
    !["regime-v1", "regime-v2"].includes(
      state.gameplay.market.modelVersion,
    ) ||
    !Number.isSafeInteger(state.gameplay.market.monthsInRegime) ||
    state.gameplay.market.monthsInRegime < 0
  ) {
    violations.push(
      violation(
        "gameplay.market",
        "invalid_market_lifecycle",
        "market model and months in regime must be persisted",
      ),
    );
  }
  const macroMarket = state.gameplay.market;
  if (macroMarket.modelVersion === "regime-v2") {
    try {
      validateMacroMarketSnapshotV2(
        macroMarket as MacroMarketSnapshotV2,
      );
    } catch {
      violations.push(
        violation(
          "gameplay.market",
          "invalid_structured_macro_state",
          "regime-v2 requires its calibration, difficulty, borrowing, labor, inflation, volatility, and asset-condition facts",
        ),
      );
    }
  }
  const cumulativePriceIndexPpm =
    state.gameplay.market.cumulativePriceIndexPpm;
  if (
    cumulativePriceIndexPpm !== undefined &&
    (!Number.isSafeInteger(cumulativePriceIndexPpm) ||
      cumulativePriceIndexPpm <= 0)
  ) {
    violations.push(
      violation(
        "gameplay.market.cumulativePriceIndexPpm",
        "invalid_cumulative_price_index",
        "must be a positive safe integer PPM index",
      ),
    );
  }
  try {
    simulationMonth(strategy.effectiveMonth);
    if (compareMonths(strategy.effectiveMonth, state.currentMonth) > 0) {
      violations.push(
        violation(
          "gameplay.recurringStrategy.effectiveMonth",
          "future_strategy",
          "active recurring strategy must not begin after the current month",
        ),
      );
    }
  } catch {
    violations.push(
      violation(
        "gameplay.recurringStrategy.effectiveMonth",
        "invalid_month",
        "must use canonical YYYY-MM",
      ),
    );
  }
  validateRate(strategy.preTax401kSalaryRatePpm, "gameplay.recurringStrategy.preTax401kSalaryRatePpm", violations);
  validateRate(strategy.preTaxHsaSalaryRatePpm, "gameplay.recurringStrategy.preTaxHsaSalaryRatePpm", violations);
  validateRate(strategy.afterTaxBroadIndexRatePpm, "gameplay.recurringStrategy.afterTaxBroadIndexRatePpm", violations);
  validateRate(strategy.afterTaxSectorRatePpm, "gameplay.recurringStrategy.afterTaxSectorRatePpm", violations);
  validateRate(strategy.afterTaxSpeculativeRatePpm, "gameplay.recurringStrategy.afterTaxSpeculativeRatePpm", violations);
  validateRate(strategy.afterTaxIraRatePpm, "gameplay.recurringStrategy.afterTaxIraRatePpm", violations);
  validateRate(strategy.afterTaxExtraDebtRatePpm, "gameplay.recurringStrategy.afterTaxExtraDebtRatePpm", violations);
  if (
    strategy.emergencyFundTargetMonthsPpm !== undefined &&
    (!Number.isSafeInteger(strategy.emergencyFundTargetMonthsPpm) ||
      strategy.emergencyFundTargetMonthsPpm < 0 ||
      strategy.emergencyFundTargetMonthsPpm > 24_000_000)
  ) {
    violations.push(
      violation(
        "gameplay.recurringStrategy.emergencyFundTargetMonthsPpm",
        "invalid_emergency_fund_target",
        "emergency-fund target must be between 0 and 24 months",
      ),
    );
  }
  if (strategy.insuranceCoverageIds !== undefined) {
    const ids = strategy.insuranceCoverageIds;
    const available =
      state.gameplay.catalogSnapshot?.selected.insuranceCoverages ?? [];
    if (
      ids.length > 16 ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) =>
          typeof id !== "string" ||
          id.length === 0 ||
          !available.some((coverage) => coverage.id === id),
      )
    ) {
      violations.push(
        violation(
          "gameplay.recurringStrategy.insuranceCoverageIds",
          "invalid_insurance_selection",
          "active insurance IDs must be unique and available in the run snapshot",
        ),
      );
    }
  }
  if (
    sum([strategy.preTax401kSalaryRatePpm, strategy.preTaxHsaSalaryRatePpm]) >
    BigInt(1_000_000)
  ) {
    violations.push(
      violation(
        "gameplay.recurringStrategy",
        "pretax_overallocated",
        "pre-tax salary allocations must not exceed 100%",
      ),
    );
  }
  if (
    sum([
      strategy.afterTaxBroadIndexRatePpm,
      strategy.afterTaxSectorRatePpm,
      strategy.afterTaxSpeculativeRatePpm,
      strategy.afterTaxIraRatePpm,
      strategy.afterTaxExtraDebtRatePpm,
    ]) > BigInt(1_000_000)
  ) {
    violations.push(
      violation(
        "gameplay.recurringStrategy",
        "aftertax_overallocated",
        "after-tax allocations must not exceed 100%",
      ),
    );
  }

  violations.push(...validateCatalogAndBenefitsStateV2(state));

  const termDebtIds = debts.termDebts.map(({ id }) => id);
  if (new Set(termDebtIds).size !== termDebtIds.length) {
    violations.push(
      violation(
        "gameplay.debts.termDebts",
        "duplicate_debt",
        "term debt ids must be unique",
      ),
    );
  }
  const exposure = state.gameplay.exposure;
  const exposureMonths = exposure.history.map(({ month }) => month);
  if (new Set(exposureMonths).size !== exposureMonths.length) {
    violations.push(
      violation(
        "gameplay.exposure.history",
        "duplicate_exposure_month",
        "each simulation month may have one exposure snapshot",
      ),
    );
  }
  for (const [index, snapshot] of exposure.history.entries()) {
    try {
      simulationMonth(snapshot.month);
    } catch {
      violations.push(
        violation(
          `gameplay.exposure.history.${index}.month`,
          "invalid_exposure_month",
          "exposure month must use canonical simulation time",
        ),
      );
    }
    const bounded = [
      snapshot.revolvingDebtPpm,
      snapshot.portfolioConcentrationPpm,
      snapshot.insuranceGapPpm,
      snapshot.jobInvestmentCorrelationPpm,
    ];
    if (
      !Number.isSafeInteger(snapshot.scorePpm) ||
      snapshot.scorePpm < 1_000_000 ||
      snapshot.scorePpm > 3_000_000 ||
      !Number.isSafeInteger(snapshot.emergencyFundMonthsPpm) ||
      snapshot.emergencyFundMonthsPpm < 0 ||
      snapshot.emergencyFundMonthsPpm > 12_000_000 ||
      (snapshot.debtToIncomePpm !== null &&
        (!Number.isSafeInteger(snapshot.debtToIncomePpm) ||
          snapshot.debtToIncomePpm < 0)) ||
      bounded.some(
        (value) =>
          value !== null &&
          (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000),
      )
    ) {
      violations.push(
        violation(
          `gameplay.exposure.history.${index}`,
          "invalid_exposure_metric",
          "exposure metrics must remain inside their versioned bounds",
        ),
      );
    }
  }
  if (
    (exposure.current === null) !== (exposure.history.length === 0) ||
    (exposure.current !== null &&
      (exposure.history.at(-1)?.month !== exposure.current.month ||
        sha256Canonical(exposure.history.at(-1)) !==
          sha256Canonical(exposure.current)))
  ) {
    violations.push(
      violation(
        "gameplay.exposure.current",
        "exposure_current_mismatch",
        "current exposure must equal the final historical month",
      ),
    );
  }
  violations.push(...validateEventAndCareerStateV2(state, options.personalEventCatalog));
  validateDeterministicOutcomeAgainstState(state, violations);

  return violations;
}

export function assertValidGameStateV2(
  state: GameStateV2,
  options: GameStateV2ValidationOptions = {},
): void {
  const violations = validateGameStateV2(state, options);
  if (violations.length > 0) throw new InvalidGameStateV2Error(violations);
}
