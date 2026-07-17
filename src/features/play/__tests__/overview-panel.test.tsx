import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { recordExposureSnapshotV2 } from "../../../core/exposure-v2";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2, type GameStateV2 } from "../../../core/game-state-v2";
import { OverviewPanel } from "../overview-panel";

function state(): GameStateV2 {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.overview-risk",
    startMonth: "2026-07",
    randomSeed: "overview-risk",
    player: {
      playerId: "player.overview-risk",
      birthMonth: "1995-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(100_000),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(600_000),
      requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

describe("OverviewPanel current risk", () => {
  it("renders fresh Risk v1 after a non-month cash change rather than stale Exposure", () => {
    const exposed = recordExposureSnapshotV2(state());
    const current = {
      ...exposed,
      finances: {
        ...exposed.finances,
        cashCents: moneyCents(2_000_000),
      },
    } as GameStateV2;

    const html = renderToStaticMarkup(
      <OverviewPanel
        state={current}
        latestTurn={null}
        onSelectConcept={() => undefined}
      />,
    );

    expect(html).toContain("Risk v1");
    expect(html).toContain("24.0 months");
    expect(html).not.toContain("2.0 months");
  });
});
