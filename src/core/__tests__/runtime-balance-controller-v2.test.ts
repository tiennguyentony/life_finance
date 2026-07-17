import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { randomState } from "../domain/rng";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import type { PersonalEventTemplateV2 } from "../personal-event-v2";
import { estimatePersonalEventImpactV2 } from "../runtime-balance-impact-v2";
import {
  assessCandidatePacingV2,
  assessRuntimeBalanceImpactV2,
  chooseBalancedEventV2,
  prioritizeRuntimeBalanceCandidatesV2,
  type RuntimeBalanceCandidateV2,
} from "../runtime-balance-controller-v2";
import { createInitialRuntimeBalanceStateV2 } from "../runtime-balance-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function baseState(
  difficulty: "guided" | "normal" | "hard" = "normal",
  prepared = true,
): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: prepared ? "health.hdhp_hsa" : null,
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: prepared ? ["insurance.renters"] : [],
      scenarioId: "scenario.fresh_start",
    },
  );
  const native = createNativeGameStateV2({
    runId: `run.runtime-balance-controller.${difficulty}.${prepared}`,
    playerId: "player.runtime-balance-controller",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "runtime-balance-controller",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(500_000),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return {
    ...native,
    gameplay: {
      ...native.gameplay,
      runtimeBalance: createInitialRuntimeBalanceStateV2(difficulty),
    },
  } as unknown as GameStateV2;
}

function withBalance(
  state: GameStateV2,
  patch: Partial<ReturnType<typeof createInitialRuntimeBalanceStateV2>>,
): GameStateV2 {
  return {
    ...state,
    gameplay: {
      ...state.gameplay,
      runtimeBalance: {
        ...(state.gameplay.runtimeBalance as unknown as ReturnType<
          typeof createInitialRuntimeBalanceStateV2
        >),
        ...patch,
      },
    },
  } as unknown as GameStateV2;
}

function candidate(
  template: PersonalEventTemplateV2,
): RuntimeBalanceCandidateV2 {
  return {
    template,
    targetedWeakness: "unrelated_hazard",
  };
}

function cloneTemplate(
  id: string,
  patch: Partial<PersonalEventTemplateV2> = {},
): PersonalEventTemplateV2 {
  const source = getPersonalEventTemplateV2("personal.medical_bill");
  return {
    ...source,
    id,
    cooldowns: { eventMonths: 0, categoryMonths: 0, lessonMonths: 0 },
    recovery: { durationMonths: 0 },
    maximumOccurrences: 100,
    ...patch,
  };
}

function choose(
  state: GameStateV2,
  candidates: readonly RuntimeBalanceCandidateV2[],
  seed = "runtime-balance-choice",
) {
  return chooseBalancedEventV2(
    state,
    candidates,
    randomState(seed),
    ratePpm(10_000),
    {
      developmentMode: true,
      eventCatalog: candidates.map(({ template }) => template),
      monthlyCashFlowEvidence: {
        monthlyCashInflowCents: moneyCents(730_000),
        requiredCashCents: moneyCents(584_967),
      },
    },
  );
}

describe("Runtime Balance controller v2", () => {
  it("approves deterministically, samples hard bounds, and spends without calm regeneration", () => {
    const state = baseState();
    const candidates = [candidate(getPersonalEventTemplateV2("personal.medical_bill"))];

    const first = choose(state, candidates);
    const replay = choose(state, candidates);

    expect(first).toEqual(replay);
    expect(first.event?.proposal.parameters.gross_bill_cents).toBeGreaterThanOrEqual(100_000);
    expect(first.event?.proposal.parameters.gross_bill_cents).toBeLessThanOrEqual(1_500_000);
    expect(first.runtimeBalance.pressureUnits).toBe(1);
    expect(first.decision).toMatchObject({
      version: "runtime-balance-decision-v1",
      status: "approved",
      pressureBeforeUnits: 4,
      pressureAfterUnits: 1,
      controllerVersion: "runtime-balance-v1",
      policyVersion: "runtime-balance-policy-v1",
      impactEstimatorVersion: "runtime-balance-impact-v1",
      evaluatedCandidateCount: 1,
    });
    expect(first.runtimeBalance.recentEvents).toHaveLength(1);
    expect(first.runtimeBalance.recentEvents[0]).toMatchObject({
      templateVersion: 2,
    });
  });

  it("records exact recovery source identity for a large approval", () => {
    const template = cloneTemplate("personal.large_recovery", {
      severityTier: "large",
      pressureCost: 4,
      recovery: { durationMonths: 4 },
      cooldowns: { eventMonths: 4, categoryMonths: 0, lessonMonths: 0 },
      parameters: [{
        id: "gross_bill_cents",
        kind: "money_cents",
        distribution: "uniform_int",
        minimum: 100_000,
        maximum: 100_000,
      }],
    });
    const result = choose(baseState(), [candidate(template)]);

    expect(result.event).not.toBeNull();
    expect(result.runtimeBalance.recovery).toMatchObject({
      sourceEventId: result.event!.proposal.eventId,
      sourceTier: "large",
      remainingMonths: 4,
    });
  });

  it("returns null with structured evidence and regenerates only after insufficient pressure", () => {
    const state = withBalance(baseState(), { pressureUnits: 1 });
    const result = choose(state, [candidate(getPersonalEventTemplateV2("personal.medical_bill"))]);

    expect(result.event).toBeNull();
    expect(result.runtimeBalance.pressureUnits).toBe(2);
    expect(result.decision).toMatchObject({
      status: "none",
      nullReason: "all_rejected",
      pressureBeforeUnits: 1,
      pressureAfterUnits: 2,
      candidates: [
        expect.objectContaining({ rejectionCodes: ["insufficient_pressure"] }),
      ],
    });
  });

  it("enforces event/category/lesson/tier cooldowns, recovery, and catastrophe limits", () => {
    const catastrophic = cloneTemplate("personal.catastrophe", {
      severityTier: "catastrophe",
      pressureCost: 7,
      recovery: { durationMonths: 12 },
      cooldowns: { eventMonths: 12, categoryMonths: 12, lessonMonths: 12 },
    });
    const prior = {
      eventId: "evt.prior",
      templateId: catastrophic.id,
      templateVersion: catastrophic.version,
      category: catastrophic.category,
      lessonTags: [catastrophic.lessonTags.primary],
      tier: catastrophic.severityTier,
      targetedWeakness: "unrelated_hazard" as const,
      approvedMonth: simulationMonth("2026-06"),
    };
    const state = withBalance(baseState(), {
      pressureUnits: 10,
      catastropheCount: 2,
      recentEvents: [prior],
      monthsSinceCatastrophicEvent: 1,
      recovery: {
        sourceEventId: "evt.prior",
        sourceTier: "catastrophe",
        targetedWeakness: "unrelated_hazard",
        remainingMonths: 6,
      },
    });
    const result = choose(state, [candidate(catastrophic)]);
    const reasons = result.decision.candidates[0]!.rejectionCodes;

    expect(reasons).toEqual(
      expect.arrayContaining([
        "event_cooldown",
        "category_cooldown",
        "lesson_cooldown",
        "tier_cooldown",
        "recovery_block",
        "catastrophe_limit",
      ]),
    );
  });

  it.each([
    ["guided", 1],
    ["normal", 2],
    ["hard", 3],
  ] as const)("enforces the %s catastrophe limit", (difficulty, limit) => {
    const template = cloneTemplate(`personal.catastrophe-limit.${difficulty}`, {
      classification: "positive",
      severityTier: "catastrophe",
      pressureCost: 0,
    });
    const state = withBalance(baseState(difficulty), {
      catastropheCount: limit,
    });
    const balance = state.gameplay.runtimeBalance as ReturnType<
      typeof createInitialRuntimeBalanceStateV2
    >;

    expect(
      assessCandidatePacingV2(state, balance, candidate(template), [template]),
    ).toContain("catastrophe_limit");
  });

  it("applies difficulty-owned minimum event, category, and lesson cooldowns", () => {
    const template = cloneTemplate("personal.profile_cooldown", {
      classification: "positive",
      pressureCost: 0,
      cooldowns: { eventMonths: 0, categoryMonths: 0, lessonMonths: 0 },
    });
    const prior = {
      eventId: "evt.profile-cooldown.prior",
      templateId: template.id,
      templateVersion: template.version,
      category: template.category,
      lessonTags: [template.lessonTags.primary],
      tier: template.severityTier,
      targetedWeakness: "unrelated_hazard" as const,
      approvedMonth: simulationMonth("2026-07"),
    };
    const guidedState = withBalance(baseState("guided"), {
      recentEvents: [prior],
    });
    const hardState = withBalance(baseState("hard"), {
      recentEvents: [prior],
    });
    const guidedBalance = guidedState.gameplay.runtimeBalance as ReturnType<
      typeof createInitialRuntimeBalanceStateV2
    >;
    const hardBalance = hardState.gameplay.runtimeBalance as ReturnType<
      typeof createInitialRuntimeBalanceStateV2
    >;

    expect(
      assessCandidatePacingV2(
        guidedState,
        guidedBalance,
        candidate(template),
        [template],
      ),
    ).toEqual(expect.arrayContaining([
      "event_cooldown",
      "category_cooldown",
      "lesson_cooldown",
    ]));
    expect(
      assessCandidatePacingV2(
        hardState,
        hardBalance,
        candidate(template),
        [template],
      ),
    ).not.toEqual(expect.arrayContaining([
      "event_cooldown",
      "category_cooldown",
      "lesson_cooldown",
    ]));
  });

  it("retargets a real weakness during recovery but never treats unrelated hazard as one", () => {
    const template = cloneTemplate("personal.retarget", { pressureCost: 0 });
    const state = withBalance(baseState(), {
      recovery: {
        sourceEventId: "evt.recovery.large",
        sourceTier: "large",
        targetedWeakness: "low_emergency_fund",
        remainingMonths: 3,
      },
    });
    const balance = state.gameplay.runtimeBalance as unknown as ReturnType<
      typeof createInitialRuntimeBalanceStateV2
    >;

    expect(
      assessCandidatePacingV2(state, balance, {
        template,
        targetedWeakness: "low_emergency_fund",
      }, [template]),
    ).toContain("recovery_retarget");
    expect(
      assessCandidatePacingV2(state, balance, candidate(template), [template]),
    ).not.toContain("recovery_retarget");
    const currentSchemaResult = chooseBalancedEventV2(
      state,
      [{ template, targetedWeakness: "low_emergency_fund" }],
      randomState("meaningful-target-is-not-current-schema"),
      ratePpm(10_000),
      {
        eventCatalog: [template],
        monthlyCashFlowEvidence: {
          monthlyCashInflowCents: moneyCents(730_000),
          requiredCashCents: moneyCents(584_967),
        },
      },
    );
    expect(currentSchemaResult.event).toBeNull();
    expect(currentSchemaResult.decision.candidates[0]!.rejectionCodes).toEqual(
      expect.arrayContaining(["ineligible", "recovery_retarget"]),
    );
  });

  it("uses repetition penalties and underrepresented lesson coverage without bypassing fairness", () => {
    const repeated = cloneTemplate("personal.repeated", {
      classification: "positive",
      severityTier: "micro",
      pressureCost: 0,
      lessonTags: { primary: "lesson.repeated", secondary: [] },
    });
    const underrepresented = cloneTemplate("personal.underrepresented", {
      classification: "positive",
      severityTier: "micro",
      pressureCost: 0,
      lessonTags: { primary: "lesson.new", secondary: [] },
    });
    const state = withBalance(baseState(), {
      recentEvents: [{
        eventId: "evt.repeated.prior",
        templateId: repeated.id,
        templateVersion: repeated.version,
        category: repeated.category,
        lessonTags: [repeated.lessonTags.primary],
        tier: "micro",
        targetedWeakness: "unrelated_hazard",
        approvedMonth: simulationMonth("2025-01"),
      }],
      lessonExposureCounts: [
        { lessonTag: "lesson.repeated", count: 5 },
        { lessonTag: "lesson.new", count: 0 },
      ],
    });

    const result = choose(state, [candidate(repeated), candidate(underrepresented)]);

    const prioritized = prioritizeRuntimeBalanceCandidatesV2(
      state.gameplay.runtimeBalance as unknown as ReturnType<
        typeof createInitialRuntimeBalanceStateV2
      >,
      [candidate(repeated), candidate(underrepresented)],
    );

    expect(result.event?.template.id).toBe("personal.underrepresented");
    expect(prioritized[0]!.candidate.template.id).toBe(
      "personal.underrepresented",
    );
    expect(result.decision.candidates.find(({ templateId }) => templateId === repeated.id)).toMatchObject({
      repetitionPenalty: expect.any(Number),
    });
    expect(result.decision.candidates.find(({ templateId }) => templateId === underrepresented.id)).toMatchObject({
      lessonCoverageBonus: expect.any(Number),
    });
  });

  it("preserves director order when adjusted priority scores tie", () => {
    const first = cloneTemplate("personal.z_first", {
      classification: "positive",
      severityTier: "micro",
      pressureCost: 0,
      lessonTags: { primary: "lesson.old", secondary: [] },
    });
    const second = cloneTemplate("personal.a_second", {
      classification: "positive",
      severityTier: "micro",
      pressureCost: 0,
      lessonTags: { primary: "lesson.new", secondary: [] },
    });

    expect(
      prioritizeRuntimeBalanceCandidatesV2(
        {
          ...createInitialRuntimeBalanceStateV2("normal"),
          lessonExposureCounts: [
            { lessonTag: "lesson.old", count: 1 },
            { lessonTag: "lesson.new", count: 0 },
          ],
        },
        [candidate(first), candidate(second)],
      ).map(({ candidate: item }) => item.template.id),
    ).toEqual([first.id, second.id]);
  });

  it("rejects a stale candidate after authoritative maximum occurrences", () => {
    const template = cloneTemplate("personal.exhausted", {
      maximumOccurrences: 1,
      classification: "positive",
      severityTier: "micro",
      pressureCost: 0,
    });
    const opening = baseState();
    const exhausted: GameStateV2 = {
      ...opening,
      gameplay: {
        ...opening.gameplay,
        eventLifecycle: {
          ...opening.gameplay.eventLifecycle,
          history: [{
            commandId: "cmd.exhausted",
            resultingRevision: 1,
            eventId: "evt.exhausted",
            templateId: template.id,
            templateVersion: template.version,
            tier: template.severityTier,
            targetedWeakness: "unrelated_hazard",
            parameters: { gross_bill_cents: 100_000 },
            choiceId: "pay_uninsured",
            availableChoiceIds: ["pay_uninsured"],
            scheduledMonth: simulationMonth("2025-01"),
            resolvedMonth: simulationMonth("2025-01"),
            playerCostCents: moneyCents(100_000),
            insurerCostCents: moneyCents(0),
          }],
        },
      },
    };

    const result = choose(exhausted, [candidate(template)]);

    expect(result.event).toBeNull();
    expect(result.decision.candidates[0]!.rejectionCodes).toContain("ineligible");
  });

  it("rejects ineligible candidates and returns null when every candidate fails", () => {
    const ineligible = cloneTemplate("personal.homeowner_only", {
      eligibility: [{ type: "home_owned", expected: true }],
      pressureCost: 0,
    });
    const result = choose(baseState(), [candidate(ineligible)]);

    expect(result.event).toBeNull();
    expect(result.decision.candidates[0]!.rejectionCodes).toContain("ineligible");
  });

  it.each(["guided", "normal"] as const)(
    "%s rejects an immediate unavoidable failure",
    (difficulty) => {
      const catastrophicCost = cloneTemplate(`personal.unavoidable.${difficulty}`, {
        pressureCost: 0,
        parameters: [{
          id: "gross_bill_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 20_000_000,
          maximum: 20_000_000,
        }],
      });
      const opening = baseState(difficulty, false);
      const noResources: GameStateV2 = {
        ...opening,
        finances: {
          ...opening.finances,
          cashCents: moneyCents(0),
          taxableInvestmentsCents: moneyCents(0),
          creditLimitCents: moneyCents(0),
          creditUsedCents: moneyCents(0),
        },
        gameplay: {
          ...opening.gameplay,
          portfolio: {
            ...opening.gameplay.portfolio,
            taxableBroadIndexCents: moneyCents(0),
          },
        },
      };

      const result = choose(noResources, [candidate(catastrophicCost)]);

      expect(result.event).toBeNull();
      expect(result.decision.candidates[0]!.rejectionCodes).toContain(
        "unavoidable_failure",
      );
      expect(result.decision.candidates[0]!.impact).toMatchObject({
        bankruptcyRisk: "immediate",
        minimumUncoveredCostCents: expect.any(Number),
        likelyLiquidationCents: expect.any(Number),
        likelyCreditUseCents: expect.any(Number),
        reasonableResponseIds: expect.any(Array),
      });
    },
  );

  it("keeps Hard bounded and evaluates no more than the configured top five", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate(cloneTemplate(`personal.hard.${index}`, {
        pressureCost: 99,
        parameters: [{
          id: "gross_bill_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 100_000,
          maximum: 100_000 + index,
        }],
      })),
    );
    const result = choose(baseState("hard"), candidates);

    expect(result.event).toBeNull();
    expect(result.decision.evaluatedCandidateCount).toBe(5);
    expect(result.decision.candidates).toHaveLength(5);
  });

  it("invokes the estimator no more than five times for a large ranked input", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate(cloneTemplate(`personal.estimate-limit.${index}`, {
        pressureCost: 0,
        parameters: [{
          id: "gross_bill_cents",
          kind: "money_cents",
          distribution: "uniform_int",
          minimum: 100_000,
          maximum: 100_000,
        }],
      })),
    );
    let invocations = 0;
    const result = chooseBalancedEventV2(
      baseState("hard"),
      candidates,
      randomState("estimator-invocation-limit"),
      ratePpm(10_000),
      {
        eventCatalog: candidates.map(({ template }) => template),
        monthlyCashFlowEvidence: {
          monthlyCashInflowCents: moneyCents(730_000),
          requiredCashCents: moneyCents(584_967),
        },
        estimateImpact: (...args) => {
          invocations += 1;
          return {
            ...estimatePersonalEventImpactV2(...args),
            impactScorePpm: 1_000_000,
          };
        },
      },
    );

    expect(result.event).toBeNull();
    expect(invocations).toBe(5);
  });

  it("allows Hard to approve a bounded event outside the Normal recovery band", () => {
    const template = cloneTemplate("personal.hard-recovery-band", {
      classification: "positive",
      severityTier: "large",
      pressureCost: 0,
      recovery: { durationMonths: 60 },
      cooldowns: { eventMonths: 60, categoryMonths: 0, lessonMonths: 0 },
      parameters: [{
        id: "gross_bill_cents",
        kind: "money_cents",
        distribution: "uniform_int",
        minimum: 100_000,
        maximum: 100_000,
      }],
    });

    const normal = choose(baseState("normal"), [candidate(template)], "profile-band");
    const hard = choose(baseState("hard"), [candidate(template)], "profile-band");

    expect(normal.event).toBeNull();
    expect(normal.decision.candidates[0]?.rejectionCodes).toContain(
      "impact_above_band",
    );
    expect(hard.event).not.toBeNull();
    expect(hard.event?.proposal.parameters.gross_bill_cents).toBe(100_000);
  });

  it("returns estimator_error for a bounded template whose resolved totals overflow", () => {
    const source = cloneTemplate("personal.estimator_overflow", {
      pressureCost: 0,
      parameters: [{
        id: "gross_bill_cents",
        kind: "money_cents",
        distribution: "uniform_int",
        minimum: Number.MAX_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
      }],
      mitigations: [],
      responses: [{
        id: "pay",
        label: "Pay",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: {
            source: "parameter",
            parameterId: "gross_bill_cents",
            multiplierPpm: 1_000_000,
          },
          durationMonths: 120,
        }],
      }],
    });
    const result = choose(baseState(), [candidate(source)]);

    expect(result.event).toBeNull();
    expect(result.decision.candidates[0]!.rejectionCodes).toContain(
      "estimator_error",
    );
  });

  it("preflights a large ranked input within the bounded candidate budget", () => {
    const template = getPersonalEventTemplateV2("personal.performance_bonus");
    const candidates = Array.from({ length: 10_000 }, () => candidate(template));
    const started = performance.now();
    const result = choose(baseState(), candidates, "candidate-limit-benchmark");
    const elapsedMilliseconds = performance.now() - started;

    expect(result.decision.candidates).toHaveLength(5);
    expect(result.decision.evaluatedCandidateCount).toBeLessThanOrEqual(5);
    expect(elapsedMilliseconds).toBeLessThan(500);
  });

  it("keeps gross sampling wealth-independent while preparation lowers impact", () => {
    const medical = candidate(getPersonalEventTemplateV2("personal.medical_bill"));
    const prepared = choose(baseState("hard", true), [medical], "matched-seed");
    const unpreparedOpening = baseState("hard", false);
    const unprepared = choose(
      {
        ...unpreparedOpening,
        finances: {
          ...unpreparedOpening.finances,
          cashCents: moneyCents(50_000),
        },
      },
      [medical],
      "matched-seed",
    );
    const preparedEvidence = prepared.decision.candidates[0]!;
    const unpreparedEvidence = unprepared.decision.candidates[0]!;

    expect(preparedEvidence.parameters).toEqual(unpreparedEvidence.parameters);
    expect(preparedEvidence.impactScorePpm).toBeLessThan(
      unpreparedEvidence.impactScorePpm!,
    );
  });

  it("retains current lessons while bounding a full lesson history", () => {
    const fullHistory = Array.from({ length: 64 }, (_, index) => ({
      lessonTag: `lesson.prior.${index.toString().padStart(2, "0")}`,
      count: index + 1,
    }));
    const state = withBalance(baseState(), {
      lessonExposureCounts: fullHistory,
    });

    const result = choose(
      state,
      [candidate(getPersonalEventTemplateV2("personal.medical_bill"))],
      "bounded-lesson-history",
    );

    expect(result.event).not.toBeNull();
    expect(result.runtimeBalance.lessonExposureCounts).toHaveLength(64);
    expect(result.runtimeBalance.lessonExposureCounts).toEqual(
      [...result.runtimeBalance.lessonExposureCounts].toSorted((left, right) =>
        left.lessonTag.localeCompare(right.lessonTag)
      ),
    );
    expect(result.runtimeBalance.lessonExposureCounts).toContainEqual({
      lessonTag: "lesson.insurance",
      count: 1,
    });
    expect(result.runtimeBalance.lessonExposureCounts).toContainEqual({
      lessonTag: "lesson.emergency_fund",
      count: 1,
    });
  });

  it("retains every bounded catastrophe and the latest tier evidence in recent history", () => {
    const recentEvents = Array.from({ length: 24 }, (_, index) => ({
      eventId: `evt.prior.${index}`,
      templateId: `personal.prior.${index}`,
      templateVersion: 1,
      category: "health" as const,
      lessonTags: [`lesson.prior.${index}`],
      tier: index < 3 ? "catastrophe" as const : "medium" as const,
      targetedWeakness: "unrelated_hazard" as const,
      approvedMonth: simulationMonth("2026-06"),
    }));
    const state = withBalance(baseState("hard"), {
      catastropheCount: 3,
      monthsSinceAnyEvent: 1,
      monthsSinceMediumEvent: 1,
      monthsSinceCatastrophicEvent: 1,
      recentEvents,
    });

    const result = choose(
      state,
      [candidate(getPersonalEventTemplateV2("personal.performance_bonus"))],
      "bounded-catastrophe-history",
    );

    expect(result.event).not.toBeNull();
    expect(result.runtimeBalance.recentEvents).toHaveLength(24);
    expect(
      result.runtimeBalance.recentEvents
        .filter(({ tier }) => tier === "catastrophe")
        .map(({ eventId }) => eventId),
    ).toEqual(["evt.prior.0", "evt.prior.1", "evt.prior.2"]);
    expect(result.runtimeBalance.recentEvents.at(-1)?.eventId).toBe(
      result.event?.proposal.eventId,
    );
  });

  it("applies distinct impact bands and emits structured warnings", () => {
    const estimate = {
      impactScorePpm: 700_000,
      burnMonthsPpm: 30_000_000,
      negativeCashFlowDurationMonths: 15,
      recoveryTimeMonths: 30,
    };

    const guided = assessRuntimeBalanceImpactV2("guided", estimate);
    const hard = assessRuntimeBalanceImpactV2("hard", estimate);

    expect(guided.rejectionCodes).toContain("impact_above_band");
    expect(guided.warningCodes).toEqual(
      expect.arrayContaining([
        "impact_score_near_limit",
        "burn_months_near_limit",
        "negative_cash_flow_near_limit",
        "recovery_time_near_limit",
      ]),
    );
    expect(hard.rejectionCodes).toEqual([]);
    expect(hard.warningCodes).toEqual([]);
  });

  it("removes prior development diagnostics from non-development approvals and nulls", () => {
    const clean = baseState();
    const dirty = withBalance(clean, {
      developmentLastRejections: [{
        templateId: "personal.prior",
        code: "ineligible",
      }],
    });
    const approvedTemplate = getPersonalEventTemplateV2("personal.performance_bonus");
    const blockedTemplate = cloneTemplate("personal.blocked", { pressureCost: 99 });
    const run = (state: GameStateV2, template: PersonalEventTemplateV2) =>
      chooseBalancedEventV2(
        state,
        [candidate(template)],
        randomState("diagnostics-do-not-persist"),
        ratePpm(10_000),
        {
          eventCatalog: [template],
          monthlyCashFlowEvidence: {
            monthlyCashInflowCents: moneyCents(730_000),
            requiredCashCents: moneyCents(584_967),
          },
        },
      );

    const approvedDirty = run(dirty, approvedTemplate);
    const approvedClean = run(clean, approvedTemplate);
    const nullDirty = run(dirty, blockedTemplate);
    const nullClean = run(clean, blockedTemplate);

    expect("developmentLastRejections" in approvedDirty.runtimeBalance).toBe(false);
    expect("developmentLastRejections" in nullDirty.runtimeBalance).toBe(false);
    expect(sha256Canonical(approvedDirty.runtimeBalance)).toBe(
      sha256Canonical(approvedClean.runtimeBalance),
    );
    expect(sha256Canonical(nullDirty.runtimeBalance)).toBe(
      sha256Canonical(nullClean.runtimeBalance),
    );
  });
});
