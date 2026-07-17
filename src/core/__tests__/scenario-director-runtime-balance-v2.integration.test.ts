import { describe, expect, it } from "vitest";

import {
  PERSONAL_EVENT_TEMPLATES_V2,
  getPersonalEventTemplateV2,
} from "../../data/personal-event-templates-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { randomState, type RandomState } from "../domain/rng";
import { queueScheduledDeclarativePersonalEventV2 } from "../event-lifecycle-v2";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  generateDeclarativePersonalEventCandidatesV2,
  type DeclarativePersonalEventCandidateV2,
  type DeclarativePersonalEventCandidatesV2,
  type PersonalEventTemplateV2,
} from "../personal-event-v2";
import { analyzeRiskV1 } from "../risk-v1";
import {
  projectScenarioDirectorStateContextV2,
  scenarioDirectorTagsForCandidateV2,
} from "../scenario-director-context-v2";
import {
  chooseBalancedEventV2,
  type RuntimeBalanceCandidateV2,
} from "../runtime-balance-controller-v2";
import { estimatePersonalEventImpactV2 } from "../runtime-balance-impact-v2";
import type { RuntimeBalanceStateV2 } from "../runtime-balance-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  rankScenarioCandidatesV2,
  type ScenarioDirectorDecisionV2,
  type ScenarioDirectorInputV2,
} from "../scenario-director-v2";

function state(options: Readonly<{
  prepared?: boolean;
  cashCents?: number;
  creditUsedCents?: number;
  randomSeed?: string;
}> = {}): GameStateV2 {
  const prepared = options.prepared ?? true;
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
  const requestedCashCents = options.cashCents ?? 2_000_000;
  const requestedCreditUsedCents = options.creditUsedCents ?? 0;
  const native = createNativeGameStateV2({
    runId: `run.director-balance.${prepared}`,
    playerId: "player.director-balance",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: options.randomSeed ?? "director-balance",
    resolvedScenario,
    runtimeBalanceDifficulty: "normal",
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(
        Math.max(100_000, Math.min(2_500_000, requestedCashCents)),
      ),
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
      revolvingCreditUsedCents: moneyCents(requestedCreditUsedCents),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return {
    ...native,
    finances: {
      ...native.finances,
      cashCents: moneyCents(requestedCashCents),
      creditUsedCents: moneyCents(requestedCreditUsedCents),
    },
    gameplay: {
      ...native.gameplay,
      portfolio: {
        ...native.gameplay.portfolio,
        cashCents: moneyCents(requestedCashCents),
      },
      debts: {
        ...native.gameplay.debts,
        revolvingCreditUsedCents: moneyCents(requestedCreditUsedCents),
      },
    },
  } as GameStateV2;
}

function withRandom(base: GameStateV2, random: RandomState): GameStateV2 {
  return { ...base, random };
}

function withBalance(
  base: GameStateV2,
  patch: Partial<RuntimeBalanceStateV2>,
): GameStateV2 {
  const balance = base.gameplay.runtimeBalance;
  if (balance?.version !== 2) throw new Error("fixture requires Runtime Balance v2");
  return {
    ...base,
    gameplay: {
      ...base.gameplay,
      runtimeBalance: { ...balance, ...patch },
    },
  } as GameStateV2;
}

function withDirectorContextEvidence(base: GameStateV2): GameStateV2 {
  return {
    ...base,
    gameplay: {
      ...base.gameplay,
      eventLifecycle: {
        ...base.gameplay.eventLifecycle,
        history: [{
          commandId: "cmd.director-context.keep-lifestyle",
          resultingRevision: 1,
          eventId: "event.director-context.lifestyle",
          templateId: "personal.lifestyle_upgrade",
          templateVersion: 2,
          tier: "medium",
          targetedWeakness: "unrelated_hazard",
          parameters: { annual_cost_increase_cents: 120_000 },
          choiceId: "keep_current_lifestyle",
          availableChoiceIds: ["accept_upgrade", "keep_current_lifestyle"],
          scheduledMonth: base.currentMonth,
          resolvedMonth: base.currentMonth,
          playerCostCents: moneyCents(0),
          insurerCostCents: moneyCents(0),
          eventSchemaVersion: 2,
          category: "behavioral_trap",
          classification: "neutral",
          lessonTags: {
            primary: "lesson.lifestyle_creep",
            secondary: ["lesson.goal_tradeoff"],
          },
          pressureCost: 2,
          recoveryDurationMonths: 1,
          fallbackNarrative: {
            headline: "A lifestyle upgrade is within reach",
            body: "The offer is appealing, but accepting it permanently raises annual spending.",
          },
        }],
        activeStoryIds: ["story.2026-07.macro.tech_boom"],
        macroStories: [{
          storyId: "story.2026-07.macro.tech_boom",
          templateId: "macro.tech_boom",
          templateVersion: 1,
          parameters: { equity_boost_ppm: 10_000 },
          startedMonth: base.currentMonth,
          expiresMonth: simulationMonth("2026-09"),
          returnModifiersPpm: {
            equity: ratePpm(10_000),
            bonds: ratePpm(-2_000),
            cash: ratePpm(0),
            housing: ratePpm(0),
          },
        }],
      },
    },
  } as GameStateV2;
}

function alwaysCandidateTemplate(
  id: string,
  primaryLesson: string,
  pressureCost: number,
): PersonalEventTemplateV2 {
  const medical = getPersonalEventTemplateV2("personal.medical_bill");
  return {
    ...medical,
    id,
    category: "maintenance",
    severityTier: "micro",
    lessonTags: { primary: primaryLesson, secondary: [] },
    hazard: {
      baseChancePpm: 1_000_000,
      minimumChancePpm: 1_000_000,
      maximumChancePpm: 1_000_000,
      modifiers: [],
    },
    pressureCost,
    parameters: [{
      id: "gross_bill_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 500_000,
      maximum: 500_000,
    }],
    cooldowns: { eventMonths: 0, categoryMonths: 0, lessonMonths: 0 },
    maximumOccurrences: 100,
    recovery: { durationMonths: 0 },
    followUps: [],
  };
}

function directorCandidate(candidate: DeclarativePersonalEventCandidateV2) {
  return {
    templateId: candidate.template.id,
    templateVersion: candidate.template.version,
    category: candidate.template.category,
    tier: candidate.template.severityTier,
    targetedWeakness: candidate.targetedWeakness,
    lessonTags: candidate.template.lessonTags,
    directorTags: scenarioDirectorTagsForCandidateV2(
      candidate.template,
      candidate.targetedWeakness,
    ),
  } as const;
}

function directorInput(
  current: GameStateV2,
  candidates: DeclarativePersonalEventCandidatesV2,
): ScenarioDirectorInputV2 {
  const balance = current.gameplay.runtimeBalance;
  if (balance?.version !== 2) throw new Error("fixture requires Runtime Balance v2");
  const context = projectScenarioDirectorStateContextV2(current);
  return {
    version: "scenario-director-v2",
    month: current.currentMonth,
    riskSnapshot: analyzeRiskV1(current),
    macro: context.macro,
    candidates: candidates.candidates.map(directorCandidate),
    recentDecisions: context.recentDecisions,
    recentEvents: context.recentEvents,
    lessonExposureCounts: context.lessonExposureCounts,
    difficulty: context.difficulty,
    ...(context.storyArc === undefined ? {} : { storyArc: context.storyArc }),
  };
}

function rankCandidates(
  current: GameStateV2,
  candidates: DeclarativePersonalEventCandidatesV2,
): ScenarioDirectorDecisionV2 {
  return rankScenarioCandidatesV2(directorInput(current, candidates));
}

function mapExactRankedCandidates(
  generated: DeclarativePersonalEventCandidatesV2,
  director: ScenarioDirectorDecisionV2,
): readonly RuntimeBalanceCandidateV2[] {
  const byIdentity = new Map(
    generated.candidates.map((candidate) => [
      `${candidate.template.id}@${candidate.template.version}`,
      candidate,
    ]),
  );
  return director.ranked.map(({ templateId, templateVersion }) => {
    const candidate = byIdentity.get(`${templateId}@${templateVersion}`);
    if (!candidate) throw new Error("director ranking substituted a candidate");
    return candidate;
  });
}

function chooseFromDirector(
  current: GameStateV2,
  generated: DeclarativePersonalEventCandidatesV2,
  director: ScenarioDirectorDecisionV2,
  eventCatalog: readonly PersonalEventTemplateV2[],
) {
  return chooseBalancedEventV2(
    current,
    generated.candidates,
    generated.nextRandom,
    ratePpm(10_000),
    {
      eventCatalog,
      monthlyCashFlowEvidence: {
        monthlyCashInflowCents: moneyCents(730_000),
        requiredCashCents: moneyCents(584_967),
      },
      scenarioDirectorInput: directorInput(current, generated),
      scenarioDirectorDecision: director,
    },
  );
}

function findCanonicalOpportunity(
  base: GameStateV2,
  template: PersonalEventTemplateV2,
): Readonly<{
  state: GameStateV2;
  generated: DeclarativePersonalEventCandidatesV2;
}> {
  for (let index = 0; index < 2_000; index += 1) {
    const candidateState = withRandom(base, randomState(`director-opportunity.${index}`));
    const generated = generateDeclarativePersonalEventCandidatesV2(
      candidateState,
      [template],
    );
    if (generated.candidates.length === 1) {
      return { state: candidateState, generated };
    }
  }
  throw new Error("deterministic fixture could not find a canonical opportunity");
}

describe("Scenario Director -> Runtime Balance -> lifecycle integration", () => {
  it("accepts exact state-projected choice and story context without granting approval authority", () => {
    const template = alwaysCandidateTemplate(
      "personal.director-context-candidate",
      "lesson.other",
      1,
    );
    const current = withDirectorContextEvidence(state());
    const generated = generateDeclarativePersonalEventCandidatesV2(current, [template]);
    const baseInput = directorInput(current, generated);
    const context = projectScenarioDirectorStateContextV2(current);
    const input: ScenarioDirectorInputV2 = {
      ...baseInput,
      macro: context.macro,
      recentDecisions: context.recentDecisions,
      recentEvents: context.recentEvents,
      lessonExposureCounts: context.lessonExposureCounts,
      difficulty: context.difficulty,
      ...(context.storyArc === undefined ? {} : { storyArc: context.storyArc }),
    };
    const decision = rankScenarioCandidatesV2(input);

    const choice = chooseBalancedEventV2(
      current,
      generated.candidates,
      generated.nextRandom,
      ratePpm(10_000),
      {
        eventCatalog: [template],
        monthlyCashFlowEvidence: {
          monthlyCashInflowCents: moneyCents(730_000),
          requiredCashCents: moneyCents(584_967),
        },
        scenarioDirectorInput: input,
        scenarioDirectorDecision: decision,
      },
    );

    expect(choice.decision.scenarioDirector?.rankingInputChecksum).toBe(
      decision.rankingInputChecksum,
    );
    expect(choice.decision.status).toBe("approved");
  });

  it("uses Risk v1 and exact event templates, consumes no ranking RNG, and queues only controller approval", () => {
    const medical = getPersonalEventTemplateV2("personal.medical_bill");
    const opportunity = findCanonicalOpportunity(state(), medical);
    const randomAfterHazard = opportunity.generated.nextRandom;

    const director = rankCandidates(opportunity.state, opportunity.generated);
    const ranked = mapExactRankedCandidates(opportunity.generated, director);

    expect(director.riskVersion).toBe("risk-v1");
    expect(director.ranked.map(({ templateId }) => templateId)).toEqual([
      medical.id,
    ]);
    expect(ranked[0]?.template).toBe(medical);
    expect(opportunity.generated.nextRandom).toEqual(randomAfterHazard);
    expect(opportunity.state.gameplay.eventLifecycle.pending).toBeNull();

    const choice = chooseFromDirector(
      opportunity.state,
      opportunity.generated,
      director,
      PERSONAL_EVENT_TEMPLATES_V2,
    );
    expect(choice.decision.status).toBe("approved");
    expect(choice.nextRandom).not.toEqual(randomAfterHazard);
    expect(opportunity.state.gameplay.eventLifecycle.pending).toBeNull();

    const chosenState = {
      ...opportunity.state,
      random: choice.nextRandom,
      gameplay: {
        ...opportunity.state.gameplay,
        runtimeBalance: choice.runtimeBalance,
      },
    } as GameStateV2;
    const queued = queueScheduledDeclarativePersonalEventV2(
      chosenState,
      choice.event!,
    );
    expect(queued.gameplay.eventLifecycle.pending).toMatchObject({
      eventId: choice.decision.approved?.eventId,
      templateId: medical.id,
      templateVersion: medical.version,
    });
    expect(queued.random).toEqual(choice.nextRandom);
  });

  it("preserves Director order so Balance can reject the top proposal and approve a later fair candidate", () => {
    const top = alwaysCandidateTemplate(
      "personal.z_top_unfair",
      "lesson.emergency_fund",
      4,
    );
    const later = alwaysCandidateTemplate(
      "personal.a_later_fair",
      "lesson.other",
      1,
    );
    const catalog = [later, top];
    const current = withBalance(
      state({ prepared: false, cashCents: 0, creditUsedCents: 800_000 }),
      {
        pressureUnits: 1,
        lessonExposureCounts: [
          { lessonTag: "lesson.emergency_fund", count: 3 },
          { lessonTag: "lesson.other", count: 0 },
        ],
      },
    );
    const generated = generateDeclarativePersonalEventCandidatesV2(current, catalog);
    expect(generated.candidates.map(({ template }) => template.id)).toEqual([
      later.id,
      top.id,
    ]);
    const director = rankCandidates(current, generated);
    expect(director.ranked.map(({ templateId }) => templateId)).toEqual([
      top.id,
      later.id,
    ]);

    const choice = chooseFromDirector(current, generated, director, catalog);

    expect(choice.decision.candidates.map(({ templateId }) => templateId)).toEqual([
      top.id,
      later.id,
    ]);
    expect(choice.decision.candidates[0]?.rejectionCodes).toContain(
      "insufficient_pressure",
    );
    expect(choice.decision.approved?.templateId).toBe(later.id);
  });

  it("rejects tampered Director evidence before Balance can use its order", () => {
    const first = alwaysCandidateTemplate(
      "personal.first_verified",
      "lesson.emergency_fund",
      1,
    );
    const second = alwaysCandidateTemplate(
      "personal.second_verified",
      "lesson.other",
      1,
    );
    const current = state();
    const generated = generateDeclarativePersonalEventCandidatesV2(current, [
      first,
      second,
    ]);
    const input = directorInput(current, generated);
    const decision = rankScenarioCandidatesV2(input);
    const randomBefore = generated.nextRandom;

    expect(() =>
      chooseBalancedEventV2(
        current,
        generated.candidates,
        generated.nextRandom,
        ratePpm(10_000),
        {
          eventCatalog: [first, second],
          monthlyCashFlowEvidence: {
            monthlyCashInflowCents: moneyCents(730_000),
            requiredCashCents: moneyCents(584_967),
          },
          scenarioDirectorInput: input,
          scenarioDirectorDecision: {
            ...decision,
            candidateSetChecksum: "0".repeat(64),
          },
        },
      ),
    ).toThrowError(/verified deterministic input/);
    expect(generated.nextRandom).toEqual(randomBefore);
    expect(current.gameplay.eventLifecycle.pending).toBeNull();
  });

  it("returns explicit null and never queues when every Director-ranked candidate is rejected", () => {
    const first = alwaysCandidateTemplate(
      "personal.first_rejected",
      "lesson.emergency_fund",
      2,
    );
    const second = alwaysCandidateTemplate(
      "personal.second_rejected",
      "lesson.other",
      2,
    );
    const catalog = [first, second];
    const current = withBalance(state(), { pressureUnits: 0 });
    const generated = generateDeclarativePersonalEventCandidatesV2(current, catalog);
    const director = rankCandidates(current, generated);
    const choice = chooseFromDirector(current, generated, director, catalog);
    const afterLifecycle = choice.event === null
      ? current
      : queueScheduledDeclarativePersonalEventV2(current, choice.event);

    expect(choice.event).toBeNull();
    expect(choice.decision).toMatchObject({
      status: "none",
      nullReason: "all_rejected",
    });
    expect(choice.decision.candidates.every(({ rejectionCodes }) =>
      rejectionCodes.includes("insufficient_pressure"))).toBe(true);
    expect(afterLifecycle.gameplay.eventLifecycle.pending).toBeNull();
  });

  it("lets preparation change Risk rank and impact without changing event membership or hazard RNG", () => {
    const emergency = alwaysCandidateTemplate(
      "personal.z_emergency",
      "lesson.emergency_fund",
      1,
    );
    const other = alwaysCandidateTemplate(
      "personal.a_other",
      "lesson.other",
      1,
    );
    const catalog = [emergency, other];
    const prepared = state({
      prepared: true,
      cashCents: 20_000_000,
      creditUsedCents: 0,
      randomSeed: "matched-opportunity",
    });
    const unprepared = state({
      prepared: false,
      cashCents: 0,
      creditUsedCents: 800_000,
      randomSeed: "matched-opportunity",
    });
    const preparedCandidates = generateDeclarativePersonalEventCandidatesV2(
      prepared,
      catalog,
    );
    const unpreparedCandidates = generateDeclarativePersonalEventCandidatesV2(
      unprepared,
      catalog,
    );

    expect(preparedCandidates.candidateTemplateIds).toEqual(
      unpreparedCandidates.candidateTemplateIds,
    );
    expect(preparedCandidates.eligibleTemplateIds).toEqual(
      unpreparedCandidates.eligibleTemplateIds,
    );
    expect(preparedCandidates.nextRandom).toEqual(unpreparedCandidates.nextRandom);

    const preparedRank = rankCandidates(prepared, preparedCandidates);
    const unpreparedRank = rankCandidates(unprepared, unpreparedCandidates);
    expect(preparedRank.ranked[0]?.templateId).toBe(other.id);
    expect(unpreparedRank.ranked[0]?.templateId).toBe(emergency.id);

    const parameters = { gross_bill_cents: 500_000 };
    const cashFlowEvidence = {
      monthlyCashInflowCents: moneyCents(730_000),
      requiredCashCents: moneyCents(584_967),
    };
    const preparedImpact = estimatePersonalEventImpactV2(
      prepared,
      emergency,
      parameters,
      ratePpm(10_000),
      cashFlowEvidence,
    );
    const unpreparedImpact = estimatePersonalEventImpactV2(
      unprepared,
      emergency,
      parameters,
      ratePpm(10_000),
      cashFlowEvidence,
    );
    expect(preparedImpact.minimumUncoveredCostCents).toBeLessThan(
      unpreparedImpact.minimumUncoveredCostCents,
    );
  });
});
