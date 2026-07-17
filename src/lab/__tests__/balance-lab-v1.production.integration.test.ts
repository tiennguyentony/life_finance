import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../core/canonical";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { projectFinancialGoal } from "../../core/financial-goals-v2";
import {
  calculateAutomaticLiquidity,
  calculateNetWorth,
  createInitialGameState,
  type GameState,
  type MarketRegime,
} from "../../core/game-state";
import {
  marketSimulationStateV2,
  simulateMarketMonthV2,
} from "../../core/market";
import {
  advanceEventEpochsV1,
  eventOpportunityDrawV1,
  withNextMacroStateV1,
} from "../../core/world-random-v1";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import type { BalanceLabBotIdV1 } from "../balance-lab-v1-contracts";
import {
  runOfflineBalanceLabV1,
  type BalanceLabProductionOwnersV1,
} from "../balance-lab-v1-runner";

type ProductionState = Readonly<{
  game: GameState;
  regime: MarketRegime;
  monthsInRegime: number;
  botId?: BalanceLabBotIdV1;
}>;

type ProductionRecord = Readonly<{
  macroEvidenceHash: string;
  rawOpportunityFingerprint: string;
}>;

describe("offline balance lab + production owner integration", () => {
  it("runs a matched bounded cohort through production market, FI, net-worth, and liquidity owners", () => {
    const owners: BalanceLabProductionOwnersV1<ProductionState, ProductionRecord> = {
      createOpeningState: ({ personaId, matchedSeed }) => Object.freeze({
        game: createInitialGameState({
          runId: `${personaId}.${matchedSeed}`,
          startMonth: "2026-01",
          player: {
            playerId: personaId,
            birthMonth: "1990-01",
            locationId: "location.test",
            careerTrackId: "career.test",
            filingStatus: "single",
          },
          finances: {
            cashCents: moneyCents(1_000_000),
            taxableInvestmentsCents: moneyCents(2_000_000),
            retirementCents: moneyCents(3_000_000),
            homeValueCents: moneyCents(0),
            otherInvestableAssetsCents: moneyCents(0),
            otherAssetsCents: moneyCents(0),
            nonCreditLiabilitiesCents: moneyCents(500_000),
            creditLimitCents: moneyCents(1_000_000),
            creditUsedCents: moneyCents(100_000),
            annualLivingCostCents: moneyCents(4_800_000),
            requiredObligationsCents: moneyCents(400_000),
          },
          wellbeing: {
            burnoutPpm: ratePpm(100_000),
            happinessPpm: ratePpm(900_000),
          },
          randomSeed: matchedSeed,
        }),
        regime: "expansion",
        monthsInRegime: 0,
      }),
      checksumState: sha256Canonical,
      applyBotPolicy: ({ state, policy, botRandom }) => Object.freeze({
        state: Object.freeze({ ...state, botId: policy.id }),
        nextBotRandom: botRandom,
      }),
      processMonth: ({ state, monthIndex, difficulty, worldRandom }) => {
        const market = simulateMarketMonthV2(
          marketSimulationStateV2(
            state.regime,
            worldRandom.macro,
            difficulty,
            state.monthsInRegime,
          ),
        );
        const rawOpportunities = PERSONAL_EVENT_TEMPLATES_V2.map((template) => ({
          templateId: template.id,
          templateVersion: template.version,
          draw: eventOpportunityDrawV1({
            epoch: worldRandom.eventOpportunity,
            simulationMonth: monthIndex,
            templateId: template.id,
            templateVersion: template.version,
          }).value,
        }));
        const rawOpportunityFingerprint = sha256Canonical(rawOpportunities);
        const macroEvidenceHash = sha256Canonical(market.month);
        const nextWorld = advanceEventEpochsV1(
          withNextMacroStateV1(worldRandom, market.nextState.random),
        );
        return Object.freeze({
          state: Object.freeze({
            ...state,
            regime: market.nextState.regime,
            monthsInRegime: market.nextState.monthsInRegime,
          }),
          record: Object.freeze({ macroEvidenceHash, rawOpportunityFingerprint }),
          worldRandom: nextWorld,
          worldEvidence: Object.freeze({
            monthIndex,
            macroEvidenceHash,
            rawOpportunityFingerprint,
            nextMacroStateValue: nextWorld.macro.value,
            nextOpportunityEpochValue: nextWorld.eventOpportunity.value,
          }),
          terminal: false,
        });
      },
      readAuthoritativeMetrics: ({ state, processedMonths }) => {
        const goal = projectFinancialGoal(state.game.finances);
        const netWorth = calculateNetWorth(state.game.finances);
        return Object.freeze({
          endReason: "active",
          grade: null,
          retirementFiProgressPpm: goal.progressPpm,
          displayedNetWorthCents: netWorth,
          liquidSolvencyCents: calculateAutomaticLiquidity(state.game.finances),
          highInterestDebtCreatedCents: 0,
          interestPaidCents: 0,
          forcedSaleCount: 0,
          eventCountByTier: Object.freeze({
            micro: 0,
            medium: 0,
            large: 0,
            catastrophe: 0,
          }),
          catastropheCount: 0,
          recoveryMonths: Object.freeze([]),
          lessonIds: Object.freeze([]),
          noEventMonths: processedMonths,
          unavoidableFailure: false,
          objectiveValues: Object.freeze({ displayedNetWorthCents: netWorth }),
        });
      },
    };

    const result = runOfflineBalanceLabV1(
      {
        version: "offline-balance-lab-v1",
        experimentId: "production-integration",
        personaIds: ["healthy-test"],
        matchedSeeds: [90210],
        botIds: ["disciplined-v1", "cash-hoarder-v1"],
        horizonMonths: 4,
        difficulty: "normal",
      },
      owners,
    );

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]!.worldEvidence).toEqual(result.runs[1]!.worldEvidence);
    expect(result.runs[0]!.metrics.displayedNetWorthCents).toBe(5_400_000);
    expect(result.runs[0]!.metrics.liquidSolvencyCents).toBe(3_900_000);
    expect(result.runs[0]!.metrics.retirementFiProgressPpm).toBeGreaterThan(0);
    expect(result.runs.every((run) => run.metrics.noEventMonths === 4)).toBe(true);
  });
});
