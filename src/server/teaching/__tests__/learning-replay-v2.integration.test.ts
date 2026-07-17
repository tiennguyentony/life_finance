import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { RecordLearningInteractionV2Command } from "../../../core/learning-interaction-v2";
import { analyzeRiskV1 } from "../../../core/risk-v1";
import { selectTeachingMomentV2 } from "../../../core/teaching-relevance-v2";
import { decodePersistedGameCommandV2 } from "../../db/persisted-command-v2";
import { reduceGameCommandV2 } from "../../db/run-repository-support";
import { replayAcceptedCommandsV2 } from "../../db/run-state-replay-v2";

describe("Teaching v2 persisted learning replay integration", () => {
  it("round-trips first use through the production codec and replay reducer once without financial or RNG drift", () => {
    const initial = migrateGameStateV1ToV2(createInitialGameState({
      runId: "run.teaching-learning-replay",
      startMonth: "2029-04",
      randomSeed: "teaching-learning-replay",
      player: {
        playerId: "player.teaching-learning-replay",
        birthMonth: "1994-01",
        locationId: "location.test",
        careerTrackId: "career.test",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
        homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(100_000),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(3_600_000),
        requiredObligationsCents: moneyCents(300_000),
      },
      wellbeing: {
        burnoutPpm: ratePpm(0),
        happinessPpm: ratePpm(1_000_000),
      },
    }));
    const selected = selectTeachingMomentV2(
      initial,
      analyzeRiskV1(initial),
      { kind: "automatic" },
    );
    expect(selected.moment?.conceptId).toBe("emergency_fund");
    const command: RecordLearningInteractionV2Command = {
      schemaVersion: 2,
      id: `teaching.automatic.${initial.revision}.${selected.moment!.conceptId}`,
      type: "record_learning_interaction_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        conceptId: selected.moment!.conceptId,
        kind: "glossary",
      },
    };
    const decoded = decodePersistedGameCommandV2(JSON.parse(JSON.stringify(command)));
    expect(decoded).toEqual(command);

    const reduced = reduceGameCommandV2(initial, decoded);
    expect(reduced.monthlyRecord).toBeNull();
    const resultingChecksum = sha256Canonical(reduced.state);
    const replayed = replayAcceptedCommandsV2(
      {
        runId: initial.runId,
        revision: initial.revision,
        stateSchemaVersion: initial.schemaVersion,
        engineVersion: initial.engineVersion,
        state: initial,
        stateChecksum: sha256Canonical(initial),
      },
      [{
        runId: initial.runId,
        commandId: command.id,
        commandSchemaVersion: command.schemaVersion,
        commandType: command.type,
        expectedRevision: command.expectedRevision,
        resultingRevision: reduced.state.revision,
        effectiveMonth: command.effectiveMonth,
        payload: command.payload,
        resultingStateChecksum: resultingChecksum,
      }],
      reduced.state.revision,
    );

    expect(replayed.stateChecksum).toBe(resultingChecksum);
    expect(replayed.state).toEqual(reduced.state);
    expect(replayed.state.finances).toEqual(initial.finances);
    expect(replayed.state.random).toEqual(initial.random);
    expect(
      replayed.state.gameplay.aiLearningMemory?.concepts.filter(
        ({ conceptId }) => conceptId === selected.moment!.conceptId,
      ),
    ).toHaveLength(1);
    expect(
      selectTeachingMomentV2(
        replayed.state,
        analyzeRiskV1(replayed.state),
        { kind: "automatic" },
      ).moment?.conceptId,
    ).not.toBe(selected.moment!.conceptId);
  });
});
