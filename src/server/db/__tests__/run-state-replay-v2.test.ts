import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { RecordLearningInteractionV2Command } from "../../../core/learning-interaction-v2";
import { RunRepositoryError } from "../run-repository-contracts";
import { reduceGameCommandV2 } from "../run-repository-support";
import {
  replayAcceptedCommandsV2,
  selectLatestRunStateReplayAnchorV2,
  type AcceptedCommandReplayRowV2,
  type RunStateReplayAnchorV2,
} from "../run-state-replay-v2";

const runId = "10000000-0000-4000-8000-000000000099";

function initialState() {
  return migrateGameStateV1ToV2(
    createInitialGameState({
      runId,
      startMonth: "2026-07",
      randomSeed: "replay-v2",
      player: {
        playerId: "player.replay-v2",
        birthMonth: "1990-01",
        locationId: "US-WA",
        careerTrackId: "software_engineer",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(1_000_000),
        taxableInvestmentsCents: moneyCents(100_000),
        retirementCents: moneyCents(100_000),
        homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(100_000),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(600_000),
        requiredObligationsCents: moneyCents(50_000),
      },
      wellbeing: {
        burnoutPpm: ratePpm(100_000),
        happinessPpm: ratePpm(900_000),
      },
    }),
  );
}

function learningCommand(
  id: string,
  expectedRevision: number,
): RecordLearningInteractionV2Command {
  return {
    schemaVersion: 2,
    id,
    type: "record_learning_interaction_v2",
    expectedRevision,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      conceptId: `concept.${expectedRevision}`,
      kind: "ai_explanation",
    },
  };
}

function replayFixture() {
  const start = initialState();
  const firstCommand = learningCommand("cmd.replay.1", 0);
  const first = reduceGameCommandV2(start, firstCommand).state;
  const secondCommand = learningCommand("cmd.replay.2", 1);
  const second = reduceGameCommandV2(first, secondCommand).state;
  const anchor: RunStateReplayAnchorV2 = {
    runId,
    revision: start.revision,
    stateSchemaVersion: start.schemaVersion,
    engineVersion: start.engineVersion,
    state: start,
    stateChecksum: sha256Canonical(start),
  };
  const rows: AcceptedCommandReplayRowV2[] = [
    row(firstCommand, sha256Canonical(first)),
    row(secondCommand, sha256Canonical(second)),
  ];
  return { anchor, rows, start, first, second };
}

function row(
  command: RecordLearningInteractionV2Command,
  resultingStateChecksum: string,
): AcceptedCommandReplayRowV2 {
  return {
    runId,
    commandId: command.id,
    commandSchemaVersion: command.schemaVersion,
    commandType: command.type,
    expectedRevision: command.expectedRevision,
    resultingRevision: command.expectedRevision + 1,
    effectiveMonth: command.effectiveMonth,
    payload: command.payload,
    resultingStateChecksum,
  };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

describe("verified v2 run-state replay", () => {
  it("replays accepted rows to the same state and canonical checksum", () => {
    const fixture = replayFixture();

    expect(
      replayAcceptedCommandsV2(fixture.anchor, fixture.rows, 2),
    ).toEqual({
      state: fixture.second,
      stateChecksum: sha256Canonical(fixture.second),
    });
  });

  it("rejects a revision gap", () => {
    const fixture = replayFixture();

    expect(
      captureError(() =>
        replayAcceptedCommandsV2(fixture.anchor, [fixture.rows[1]!], 2),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it.each([
    ["unknown type", { commandType: "invented_command" }],
    ["invalid payload", { payload: null }],
  ])("rejects a stored command with %s", (_label, override) => {
    const fixture = replayFixture();
    const badRow = { ...fixture.rows[0]!, ...override };

    expect(
      captureError(() => replayAcceptedCommandsV2(fixture.anchor, [badRow], 1)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects anchor checksum drift", () => {
    const fixture = replayFixture();

    expect(
      captureError(() =>
        replayAcceptedCommandsV2(
          { ...fixture.anchor, stateChecksum: "0".repeat(64) },
          [],
          0,
        ),
      ),
    ).toBeInstanceOf(RunRepositoryError);
    expect(
      captureError(() =>
        replayAcceptedCommandsV2(
          { ...fixture.anchor, stateChecksum: "0".repeat(64) },
          [],
          0,
        ),
      ),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects checksum drift after any replayed command", () => {
    const fixture = replayFixture();
    const rows = [
      { ...fixture.rows[0]!, resultingStateChecksum: "f".repeat(64) },
      fixture.rows[1]!,
    ];

    expect(
      captureError(() => replayAcceptedCommandsV2(fixture.anchor, rows, 2)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("chooses the latest compatible snapshot or migration anchor", () => {
    const fixture = replayFixture();
    const migrationAnchor: RunStateReplayAnchorV2 = {
      runId,
      revision: fixture.first.revision,
      stateSchemaVersion: fixture.first.schemaVersion,
      engineVersion: fixture.first.engineVersion,
      state: fixture.first,
      stateChecksum: sha256Canonical(fixture.first),
    };

    expect(
      selectLatestRunStateReplayAnchorV2(fixture.anchor, migrationAnchor),
    ).toBe(migrationAnchor);
    expect(
      selectLatestRunStateReplayAnchorV2(migrationAnchor, {
        ...migrationAnchor,
      }),
    ).not.toBe(migrationAnchor);
  });

  it("rejects a replay target with no compatible anchor", () => {
    expect(
      captureError(() => selectLatestRunStateReplayAnchorV2(null, null)),
    ).toMatchObject({ code: "CORRUPT_STATE" });
  });
});
