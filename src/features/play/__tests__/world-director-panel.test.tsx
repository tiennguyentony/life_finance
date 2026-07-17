import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { WorldDirectorPanel } from "../world-director-panel";

describe("WorldDirectorPanel Risk v1 readiness", () => {
  it("allows a consented ranking preview without a persisted Exposure snapshot", () => {
    const state = migrateGameStateV1ToV2(createInitialGameState({
      runId: "run.world-panel",
      startMonth: "2026-07",
      randomSeed: "world-panel",
      player: {
        playerId: "player.world-panel",
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
        creditLimitCents: moneyCents(0),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(600_000),
        requiredObligationsCents: moneyCents(50_000),
      },
      wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
    }));

    const html = renderToStaticMarkup(
      <WorldDirectorPanel
        state={state}
        busy={false}
        consented
        onConsentChange={() => undefined}
        onCreateEvent={() => undefined}
      />,
    );

    expect(state.gameplay.exposure.current).toBeNull();
    expect(html).toContain("Preview Hostile Fed ranking");
    expect(html).not.toContain("disabled");
  });
});
