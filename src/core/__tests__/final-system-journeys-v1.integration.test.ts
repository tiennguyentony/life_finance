import { describe, expect, it } from "vitest";

import { AiWorldDirectorService } from "../../server/ai/world-director-service";
import { AI_PRIVACY_NOTICE_VERSION } from "../../server/ai/privacy-notice";
import type { V2Repository } from "../../server/api/v2/repository-port";
import { TeachingRewriteServiceV2 } from "../../server/teaching/rewrite-service-v2";
import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  queueScheduledDeclarativePersonalEventV2,
  queueScheduledPersonalEventV2,
  resolveEventChoiceV2,
} from "../event-lifecycle-v2";
import { DECLARATIVE_EVENT_SCHEDULER_V2_VERSION } from "../event-scheduler-v2";
import { FINANCIAL_KERNEL_V2_VERSION } from "../financial-kernel-v2";
import { projectFinancialGoal } from "../financial-goals-v2";
import { finalizeGameStateV2, type GameStateV2 } from "../game-state-v2";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../market";
import {
  processMonthlyTurnV2,
  type ProcessMonthV2Command,
} from "../monthly-turn-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { OUTCOME_POLICY_V1_VERSION } from "../outcome-policy-v2";
import type { PersonalEventTemplateV2 } from "../personal-event-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../runtime-balance-policy-v2";
import { createInitialRuntimeBalanceStateV2 } from "../runtime-balance-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../scenario-director-policy-v2";
import { advanceTimeV2, type AdvanceTimeV2Command } from "../time-controller-v2";
import { WORLD_RANDOM_VERSION_V1 } from "../world-random-v1";
import { getEventTemplate } from "../../data/event-templates";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

type JourneyStateOptions = Readonly<{
  seed?: string;
  runId?: string;
  healthPlanId?: "health.ppo_balanced" | "health.hdhp_hsa";
  cashCents?: number;
  taxableBroadIndexCents?: number;
  revolvingCreditLimitCents?: number;
  runtimeBalanceV2?: boolean;
  financialGoal?: Parameters<typeof createNativeGameStateV2>[0]["financialGoal"];
}>;

function journeyState(options: JourneyStateOptions = {}): GameStateV2 {
  const healthPlanId = options.healthPlanId ?? "health.hdhp_hsa";
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId,
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: options.runId ?? `run.final-journey.${options.seed ?? "default"}`,
    playerId: "player.final-journey",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: options.seed ?? "final-journey",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    ...(options.runtimeBalanceV2 === false
      ? {}
      : { runtimeBalanceDifficulty: "normal" as const }),
    ...(options.financialGoal === undefined
      ? {}
      : { financialGoal: options.financialGoal }),
    finances: {
      cashCents: moneyCents(options.cashCents ?? 1_000_000),
      taxableBroadIndexCents: moneyCents(
        options.taxableBroadIndexCents ?? 500_000,
      ),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(
        options.revolvingCreditLimitCents ?? 1_000_000,
      ),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function monthCommand(
  state: GameStateV2,
  suffix: string,
  overrides: Partial<ProcessMonthV2Command["payload"]> = {},
): ProcessMonthV2Command {
  const year = Number(state.currentMonth.slice(0, 4));
  return {
    schemaVersion: 2,
    id: `cmd.final-journey.${suffix}`,
    type: "process_month_v2",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
      eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
      worldRandomVersion: WORLD_RANDOM_VERSION_V1,
      marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
      macroDifficulty: "normal",
      taxEvidence: {
        schemaVersion: 1,
        traceId: `tax.final-journey.${suffix}`,
        economicYear: year,
        policyYear: year,
        stateCode: "WA",
        filingStatus: "single",
        provider: "PolicyEngine US",
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
        projectedFromFrozenPolicy: false,
        grossIncomeCents: moneyCents(1_000_000),
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: moneyCents(200_000),
        afterTaxCashIncomeCents: moneyCents(800_000),
      },
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      ...overrides,
    },
  };
}

function advanceCommand(
  state: GameStateV2,
  suffix: string,
  maxMonths: number,
): AdvanceTimeV2Command {
  return {
    schemaVersion: 2,
    id: `advance.final-journey.${suffix}`,
    type: "advance_time_v2",
    maxMonths,
    mode: { kind: "until_end" },
    monthlyInputs: Array.from({ length: maxMonths }, (_, index) => {
      const input = monthCommand(state, `${suffix}.${index + 1}`);
      return { commandId: input.id, payload: input.payload };
    }),
  };
}

function fixedMedicalTemplate(
  id: string,
  tier: "medium" | "large" | "catastrophe",
  billCents: number,
  recoveryMonths: number,
): PersonalEventTemplateV2 {
  const medical = getPersonalEventTemplateV2("personal.medical_bill");
  return {
    ...medical,
    id,
    severityTier: tier,
    pressureCost: tier === "catastrophe" ? 7 : tier === "large" ? 4 : 3,
    hazard: {
      ...medical.hazard,
      baseChancePpm: ratePpm(1_000_000),
      minimumChancePpm: ratePpm(1_000_000),
      maximumChancePpm: ratePpm(1_000_000),
    },
    parameters: [{
      ...medical.parameters[0]!,
      minimum: billCents,
      maximum: billCents,
    }],
    cooldowns: { ...medical.cooldowns, eventMonths: 8 },
    recovery: { durationMonths: recoveryMonths },
    maximumOccurrences: 10,
  };
}

function resolvePending(
  state: GameStateV2,
  choiceId: string,
  catalog: readonly PersonalEventTemplateV2[],
): GameStateV2 {
  const pending = state.gameplay.eventLifecycle.pending;
  if (!pending) throw new Error("journey fixture requires a pending event");
  return resolveEventChoiceV2(
    state,
    {
      schemaVersion: 2,
      id: `cmd.final-journey.resolve.${pending.eventId}`,
      type: "resolve_event_choice",
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      payload: { eventId: pending.eventId, choiceId },
    },
    { personalEventCatalog: catalog },
  );
}

describe("Prompt 15 final system journeys", () => {
  it("ends at FI on the first completed financial month and rejects any later month", () => {
    const opening = journeyState({
      seed: "early-fi",
      taxableBroadIndexCents: 100_000_000,
      financialGoal: {
        version: "financial-goal-v1",
        desiredAnnualSpendingCents: moneyCents(120_000),
        safeWithdrawalRatePpm: ratePpm(40_000),
        targetAgeYears: 55,
        source: "player_selected",
      },
    });
    const completed = advanceTimeV2(
      opening,
      advanceCommand(opening, "early-fi", 2),
      { personalEventCatalog: [] },
    );

    expect(completed.monthsAdvanced).toBe(1);
    expect(completed.pauseReason).toEqual({ kind: "financial_independence" });
    expect(completed.records[0]?.shortfall).toBeNull();
    expect(completed.state.outcome).toMatchObject({
      kind: "financial_independence",
      grade: "S",
      reasonCode: "financial_independence_target_reached",
      reachedMonth: completed.state.currentMonth,
    });
    expect(completed.records[0]?.scheduledEvent).toBeNull();
    expect(projectFinancialGoal(
      completed.state.finances,
      completed.state.gameplay.financialGoal,
    ).progressPpm).toBe(1_000_000);
    const immediateStop = advanceTimeV2(
      completed.state,
      advanceCommand(completed.state, "after-early-fi", 1),
      { personalEventCatalog: [] },
    );
    expect(immediateStop).toMatchObject({
      monthsAdvanced: 0,
      pauseReason: { kind: "financial_independence" },
      endCondition: { kind: "financial_independence", grade: "S" },
    });
    expect(immediateStop.state).toEqual(completed.state);
  });

  it("assigns bankruptcy only when the Financial Engine reports residual shortfall", () => {
    const opening = journeyState({
      seed: "bankruptcy-owner",
      cashCents: 100_000,
      taxableBroadIndexCents: 0,
      revolvingCreditLimitCents: 500_000,
    });
    const funded = processMonthlyTurnV2(
      opening,
      monthCommand(opening, "funded-obligation", {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(100_000),
          covered: false,
        },
      }),
      { personalEventCatalog: [] },
    );
    const failed = processMonthlyTurnV2(
      opening,
      monthCommand(opening, "failed-obligation", {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(50_000_000),
          covered: false,
        },
      }),
      { personalEventCatalog: [] },
    );

    expect(funded.record.fundingPlan!.residualShortfallCents).toBe(0);
    expect(funded.record.shortfall).toBeNull();
    expect(funded.state.outcome).toBeNull();
    expect(failed.record.shortfall?.residualShortfallCents).toBeGreaterThan(0);
    expect(failed.record.fundingPlan!.residualShortfallCents).toBe(
      failed.record.shortfall?.residualShortfallCents,
    );
    expect(failed.state.outcome).toMatchObject({
      kind: "bankruptcy",
      grade: "F",
      reasonCode: "actual_required_obligation_shortfall",
      automaticLiquidSolvency: {
        residualShortfallCents: failed.record.shortfall?.residualShortfallCents,
        isSolvent: false,
      },
    });
  });

  it("rejects every Runtime Balance candidate and continues with the following ordinary month", () => {
    const catastrophe = fixedMedicalTemplate(
      "personal.final_journey_rejected_catastrophe",
      "catastrophe",
      2_000_000,
      4,
    );
    const opening = journeyState({
      seed: "all-candidates-rejected",
      runtimeBalanceV2: false,
    });
    const legacyLarge = getEventTemplate("personal.industry_layoff");
    const sourceEventId = "evt.2026-07.personal.industry_layoff.v1";
    const queued = queueScheduledPersonalEventV2(opening, {
      proposal: {
        eventId: sourceEventId,
        templateId: legacyLarge.id,
        templateVersion: legacyLarge.version,
        parameters: { income_gap_cents: 300_000 },
      },
      template: legacyLarge,
      targetedWeakness: "unrelated_hazard",
    });
    const resolved = resolveEventChoiceV2(queued, {
      schemaVersion: 2,
      id: "cmd.final-journey.recovery-source",
      type: "resolve_event_choice",
      expectedRevision: queued.revision,
      effectiveMonth: queued.currentMonth,
      payload: {
        eventId: sourceEventId,
        choiceId: "emergency_budget",
      },
    });
    const sourceEvidence = resolved.gameplay.eventLifecycle.history.at(-1)!;
    const recovering = finalizeGameStateV2({
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        runtimeBalance: {
          ...createInitialRuntimeBalanceStateV2("normal"),
          pressureUnits: 10,
          monthsSinceAnyEvent: 0,
          monthsSinceLargeEvent: 0,
          recovery: {
            sourceEventId,
            sourceTier: "large",
            targetedWeakness: sourceEvidence.targetedWeakness,
            remainingMonths: 2,
          },
          recentEvents: [{
            eventId: sourceEventId,
            templateId: sourceEvidence.templateId,
            templateVersion: sourceEvidence.templateVersion,
            category: "career",
            lessonTags: ["lesson.emergency_fund"],
            tier: "large",
            targetedWeakness: sourceEvidence.targetedWeakness,
            approvedMonth: sourceEvidence.scheduledMonth,
          }],
        },
      },
    });

    const rejected = processMonthlyTurnV2(
      recovering,
      monthCommand(recovering, "all-rejected"),
      { personalEventCatalog: [catastrophe] },
    );
    expect(rejected.record.runtimeBalanceDecision).toMatchObject({
      status: "none",
      candidates: [expect.objectContaining({
        templateId: catastrophe.id,
        rejectionCodes: expect.arrayContaining(["recovery_block"]),
      })],
    });
    expect(rejected.record.runtimeBalanceDecision?.approved).toBeUndefined();
    expect(rejected.state.gameplay.eventLifecycle.pending).toBeNull();
    expect(rejected.state.currentMonth).toBe("2026-08");

    const ordinary = processMonthlyTurnV2(
      rejected.state,
      monthCommand(rejected.state, "after-all-rejected"),
      { personalEventCatalog: [] },
    );
    expect(ordinary.state.currentMonth).toBe("2026-09");
    expect(ordinary.state.outcome).toBeNull();
    expect(ordinary.record.scheduledEvent).toBeNull();
    expect(ordinary.record.fundingPlan?.fullyFunded).toBe(true);
  });

  it("approves and resolves a major event once, blocks a catastrophe during recovery, then continues", () => {
    const major = fixedMedicalTemplate(
      "personal.final_journey_major",
      "large",
      500_000,
      2,
    );
    const catastrophe = fixedMedicalTemplate(
      "personal.final_journey_catastrophe",
      "catastrophe",
      2_000_000,
      4,
    );
    const opening = journeyState({ seed: "major-recovery" });
    const scheduled = processMonthlyTurnV2(
      opening,
      monthCommand(opening, "major.schedule"),
      { personalEventCatalog: [major] },
    );

    expect(scheduled.record.runtimeBalanceDecision).toMatchObject({
      status: "approved",
      approved: { templateId: major.id },
    });
    expect(scheduled.state.gameplay.eventLifecycle.pending).toMatchObject({
      templateId: major.id,
      parameters: { gross_bill_cents: 500_000 },
    });
    const resolved = resolvePending(scheduled.state, "pay_uninsured", [major]);
    const playerCost = resolved.gameplay.eventLifecycle.history.at(-1)!
      .playerCostCents;
    expect(playerCost).toBe(500_000);

    const funded = processMonthlyTurnV2(
      resolved,
      monthCommand(resolved, "major.fund"),
      { personalEventCatalog: [major, catastrophe] },
    );
    expect(funded.record.resolvedExpenseCents).toBe(playerCost);
    expect(funded.state.ledger.transactions.filter(
      ({ commandId, reasonCode }) =>
        commandId === funded.record.commandId &&
        reasonCode === "monthly_resolved_expense_v2",
    )).toHaveLength(1);
    expect(funded.record.runtimeBalanceDecision).toMatchObject({
      status: "none",
      candidates: [],
    });
    expect(funded.record.runtimeBalanceCandidateSet?.candidateTemplateIds)
      .not.toContain(catastrophe.id);
    const fundedBalance = funded.state.gameplay.runtimeBalance;
    if (fundedBalance?.version !== 2 || fundedBalance.recovery === null) {
      throw new Error("major-event journey requires active recovery");
    }
    const recoveryMonths = fundedBalance.recovery.remainingMonths;
    expect(recoveryMonths).toBeGreaterThan(0);

    let recovered = funded;
    for (let index = 0; index < recoveryMonths; index += 1) {
      const previous = recovered.state.gameplay.runtimeBalance;
      if (previous?.version !== 2 || previous.recovery === null) {
        throw new Error("recovery ended before its recorded countdown");
      }
      const next = processMonthlyTurnV2(
        recovered.state,
        monthCommand(recovered.state, `major.recover.${index}`),
        { personalEventCatalog: [major] },
      );
      expect(next.record.resolvedExpenseCents).toBe(0);
      expect(next.state.ledger.transactions.filter(
        ({ commandId, reasonCode }) =>
          commandId === next.record.commandId &&
          reasonCode === "monthly_resolved_expense_v2",
      )).toHaveLength(0);
      const nextBalance = next.state.gameplay.runtimeBalance;
      if (nextBalance?.version !== 2) {
        throw new Error("journey lost Runtime Balance v2");
      }
      expect(nextBalance.recovery?.remainingMonths ?? 0).toBe(
        previous.recovery.remainingMonths - 1,
      );
      recovered = next;
    }
    expect(recovered.state.gameplay.runtimeBalance).toMatchObject({
      version: 2,
      recovery: null,
    });
    expect(recovered.state.outcome).toBeNull();
  });

  it("keeps a matched medical event gross amount fixed while preparation changes impact and funding", () => {
    const medical = getPersonalEventTemplateV2("personal.medical_bill");
    const proposal = {
      eventId: "evt.2026-07.personal.medical_bill.v2",
      templateId: medical.id,
      templateVersion: medical.version,
      parameters: { gross_bill_cents: 1_500_000 },
    } as const;
    const preparedOpening = journeyState({
      seed: "matched-medical",
      runId: "run.final-journey.prepared",
      healthPlanId: "health.ppo_balanced",
      runtimeBalanceV2: false,
      cashCents: 2_500_000,
      taxableBroadIndexCents: 0,
      revolvingCreditLimitCents: 3_000_000,
    });
    const unpreparedOpening = journeyState({
      seed: "matched-medical",
      runId: "run.final-journey.unprepared",
      healthPlanId: "health.hdhp_hsa",
      runtimeBalanceV2: false,
      cashCents: 100_000,
      taxableBroadIndexCents: 0,
      revolvingCreditLimitCents: 3_000_000,
    });
    const queue = (state: GameStateV2) => queueScheduledDeclarativePersonalEventV2(
      state,
      { proposal, template: medical, targetedWeakness: "unrelated_hazard" },
      { personalEventCatalog: [medical] },
    );
    const preparedResolved = resolvePending(
      queue(preparedOpening),
      "use_insurance",
      [medical],
    );
    const unpreparedResolved = resolvePending(
      queue(unpreparedOpening),
      "use_insurance",
      [medical],
    );
    const preparedImpact = preparedResolved.gameplay.eventLifecycle.history.at(-1)!;
    const unpreparedImpact = unpreparedResolved.gameplay.eventLifecycle.history.at(-1)!;

    expect(preparedImpact.parameters).toEqual(unpreparedImpact.parameters);
    expect(preparedImpact.playerCostCents).toBeLessThan(
      unpreparedImpact.playerCostCents,
    );
    expect(preparedImpact.insurerCostCents).toBeGreaterThan(
      unpreparedImpact.insurerCostCents,
    );

    const preparedMonth = processMonthlyTurnV2(
      preparedResolved,
      monthCommand(preparedResolved, "matched.prepared", {
        taxEvidence: {
          ...monthCommand(preparedResolved, "matched.prepared.tax").payload
            .taxEvidence,
          traceId: "tax.final-journey.matched.prepared",
          totalTaxCents: moneyCents(900_000),
          afterTaxCashIncomeCents: moneyCents(100_000),
        },
      }),
      { personalEventCatalog: [medical] },
    );
    const unpreparedMonth = processMonthlyTurnV2(
      unpreparedResolved,
      monthCommand(unpreparedResolved, "matched.unprepared", {
        taxEvidence: {
          ...monthCommand(unpreparedResolved, "matched.unprepared.tax").payload
            .taxEvidence,
          traceId: "tax.final-journey.matched.unprepared",
          totalTaxCents: moneyCents(900_000),
          afterTaxCashIncomeCents: moneyCents(100_000),
        },
      }),
      { personalEventCatalog: [medical] },
    );
    expect(preparedMonth.record.resolvedExpenseCents).toBe(
      preparedImpact.playerCostCents,
    );
    expect(unpreparedMonth.record.resolvedExpenseCents).toBe(
      unpreparedImpact.playerCostCents,
    );
    expect(preparedMonth.record.fundingPlan!.creditUsedCents).toBe(0);
    expect(unpreparedMonth.record.fundingPlan!.creditUsedCents).toBeGreaterThan(0);
  });

  it("returns identical deterministic Director and Teaching state for unavailable and invalid AI", async () => {
    const state = journeyState({ seed: "ai-fallback" });
    const repository = {
      loadAuthorizedRunV2: async () => state,
      applyCommandV2: async () => {
        throw new Error("rank preview cannot mutate state");
      },
    } as unknown as V2Repository;
    const unavailable = new AiWorldDirectorService(repository, () => ({
      generate: async () => {
        throw new Error("provider unavailable");
      },
    }) as never);
    const invalid = new AiWorldDirectorService(repository, () => ({
      generate: async () => ({ inventedFinancialMutation: 1 }),
    }) as never);
    const request = {
      expectedRevision: state.revision,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    } as const;

    const unavailableResult = await unavailable.createEvent(
      state.runId,
      "secret",
      request,
    );
    const invalidResult = await invalid.createEvent(
      state.runId,
      "secret",
      request,
    );

    expect(unavailableResult.source).toBe("deterministic_fallback");
    expect(invalidResult.source).toBe("deterministic_fallback");
    expect(unavailableResult.ranking).toEqual(invalidResult.ranking);
    expect(unavailableResult.state).toEqual(state);
    expect(invalidResult.state).toEqual(state);
    expect(unavailableResult.stateChecksum).toBe(sha256Canonical(state));
    expect(invalidResult.stateChecksum).toBe(unavailableResult.stateChecksum);

    const teachingRepository = { loadAuthorizedRunV2: async () => state };
    const teachingRequest = {
      expectedRevision: state.revision,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true as const,
      target: {
        kind: "moment" as const,
        conceptId: "financial_independence",
      },
    };
    const unavailableTeaching = await new TeachingRewriteServiceV2(
      teachingRepository,
      async () => {
        throw new Error("provider unavailable");
      },
    ).rewrite(state.runId, "secret", teachingRequest);
    const invalidTeaching = await new TeachingRewriteServiceV2(
      teachingRepository,
      async () => ({ inventedFinancialClaim: "guaranteed" }),
    ).rewrite(state.runId, "secret", teachingRequest);

    expect(unavailableTeaching.rewrite.source).toBe("template_fallback");
    expect(invalidTeaching.rewrite.source).toBe("template_fallback");
    expect(unavailableTeaching.rewrite.content).toEqual(
      invalidTeaching.rewrite.content,
    );
    expect(unavailableTeaching.stateChecksum).toBe(sha256Canonical(state));
    expect(invalidTeaching.stateChecksum).toBe(
      unavailableTeaching.stateChecksum,
    );
  });
});
