import { describe, expect, it } from "vitest";

import { randomState } from "../domain/rng";
import { marketSimulationStateV2, simulateMarketMonthV2 } from "../market";
import {
  advanceEventEpochsV1,
  decodeWorldRandomStateV1,
  eventOpportunityDrawV1,
  initializeNamedWorldRandomV1,
  withNextMacroStateV1,
} from "../world-random-v1";

describe("named world RNG + production macro integration", () => {
  it("keeps macro and shared opportunity evidence matched across divergent eligibility", () => {
    const opening = initializeNamedWorldRandomV1(randomState("matched-world"));
    const advanceStrategy = (eligibleTemplateIds: readonly string[]) => {
      const market = simulateMarketMonthV2(
        marketSimulationStateV2("expansion", opening.macro, "normal"),
      );
      const rawOpportunities = Object.fromEntries(
        eligibleTemplateIds.map((templateId) => [
          templateId,
          eventOpportunityDrawV1({
            epoch: opening.eventOpportunity,
            simulationMonth: 7,
            templateId,
            templateVersion: 1,
          }).value,
        ]),
      );
      const nextWorld = advanceEventEpochsV1(
        withNextMacroStateV1(opening, market.nextState.random),
      );
      return { market, rawOpportunities, nextWorld };
    };

    const prepared = advanceStrategy(["car-repair", "medical-bill"]);
    const unprepared = advanceStrategy(["medical-bill", "rent-shock"]);

    expect(prepared.market).toEqual(unprepared.market);
    expect(prepared.rawOpportunities["medical-bill"]).toBe(
      unprepared.rawOpportunities["medical-bill"],
    );
    expect(prepared.nextWorld.macro).toEqual(unprepared.nextWorld.macro);
    expect(prepared.nextWorld.eventOpportunity).toEqual(
      unprepared.nextWorld.eventOpportunity,
    );
    expect(prepared.nextWorld.eventParameters).toEqual(
      unprepared.nextWorld.eventParameters,
    );
  });

  it("continues identically after a JSON persistence boundary", () => {
    const opening = initializeNamedWorldRandomV1(randomState("json-continuation"));
    const persisted = decodeWorldRandomStateV1(JSON.parse(JSON.stringify(opening)));
    const runMonth = (world: typeof opening) => {
      const result = simulateMarketMonthV2(
        marketSimulationStateV2("recovery", world.macro, "guided", 3),
      );
      return advanceEventEpochsV1(
        withNextMacroStateV1(world, result.nextState.random),
      );
    };

    expect(runMonth(persisted)).toEqual(runMonth(opening));
  });
});
