import { describe, expect, it } from "vitest";

import { randomState } from "../domain/rng";
import {
  advanceEventEpochsV1,
  decodeOptionalWorldRandomStateV1,
  decodeWorldRandomStateV1,
  eventOpportunityDrawV1,
  eventParameterDrawV1,
  initializeNamedWorldRandomV1,
  WORLD_RANDOM_VERSION_V1,
  WorldRandomV1Error,
} from "../world-random-v1";

describe("named world RNG v1", () => {
  it("derives the same independent frozen streams without advancing the legacy cursor", () => {
    const legacy = randomState("prompt-14-opening");

    const first = initializeNamedWorldRandomV1(legacy);
    const second = initializeNamedWorldRandomV1(legacy);

    expect(first).toEqual(second);
    expect(first.version).toBe(WORLD_RANDOM_VERSION_V1);
    expect(new Set([
      first.macro.value,
      first.eventOpportunity.value,
      first.eventParameters.value,
      first.balanceDirector.value,
    ]).size).toBe(4);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.values(first).filter((value) => typeof value === "object").every(Object.isFrozen)).toBe(true);
    expect(legacy).toEqual(randomState("prompt-14-opening"));
  });

  it("locks the first-upgrade named stream vector", () => {
    const named = initializeNamedWorldRandomV1(randomState("prompt-14-golden"));

    expect({
      macro: named.macro.value,
      eventOpportunity: named.eventOpportunity.value,
      eventParameters: named.eventParameters.value,
      balanceDirector: named.balanceDirector.value,
    }).toEqual({
      macro: 366_796_508,
      eventOpportunity: 3_986_568_069,
      eventParameters: 2_310_724_788,
      balanceDirector: 693_785_236,
    });
  });

  it("strictly decodes named state while preserving an absent legacy field", () => {
    const named = initializeNamedWorldRandomV1(randomState(42));

    expect(decodeOptionalWorldRandomStateV1(undefined)).toBeUndefined();
    expect(decodeWorldRandomStateV1(JSON.parse(JSON.stringify(named)))).toEqual(named);
    expect(() => decodeOptionalWorldRandomStateV1(null)).toThrow(WorldRandomV1Error);
    expect(() =>
      decodeWorldRandomStateV1({ ...named, unexpected: true }),
    ).toThrowError(/must be exact named-world-rng-v1/);
    expect(() =>
      decodeWorldRandomStateV1({
        ...named,
        macro: { algorithm: "mulberry32-v1", value: -1 },
      }),
    ).toThrowError(/exact mulberry32-v1/);
  });

  it("keys opportunity draws by month and exact template identity, not catalog order", () => {
    const epoch = initializeNamedWorldRandomV1(randomState("catalog-order")).eventOpportunity;
    const templates = [
      { templateId: "medical-bill", templateVersion: 2 },
      { templateId: "car-repair", templateVersion: 1 },
    ] as const;
    const draw = (template: (typeof templates)[number]) =>
      eventOpportunityDrawV1({ epoch, simulationMonth: 12, ...template }).value;

    const forward = Object.fromEntries(templates.map((template) => [template.templateId, draw(template)]));
    const reverse = Object.fromEntries([...templates].reverse().map((template) => [template.templateId, draw(template)]));

    expect(forward).toEqual(reverse);
    expect(draw(templates[0])).toBe(draw(templates[0]));
  });

  it("keys gross parameters independently of player wealth or preparation", () => {
    const epoch = initializeNamedWorldRandomV1(randomState("matched-parameter")).eventParameters;
    const draw = () =>
      eventParameterDrawV1({
        epoch,
        simulationMonth: 31,
        templateId: "medical-bill",
        templateVersion: 2,
        parameterId: "gross-cost-cents",
        minimumInclusive: 25_000,
        maximumInclusive: 250_000,
      }).value;

    expect(draw()).toBe(draw());
    expect(() =>
      eventParameterDrawV1({
        epoch,
        simulationMonth: 31,
        templateId: "medical-bill",
        templateVersion: 2,
        parameterId: "gross-cost-cents",
        minimumInclusive: 250_000,
        maximumInclusive: 25_000,
      }),
    ).toThrowError(/bounds/);
  });

  it("advances both persisted event epochs exactly once for every completed scheduling month", () => {
    const opening = initializeNamedWorldRandomV1(randomState("epochs"));
    const afterOne = advanceEventEpochsV1(opening);
    const afterTwo = advanceEventEpochsV1(afterOne);

    expect(afterOne.eventOpportunity.value).not.toBe(opening.eventOpportunity.value);
    expect(afterOne.eventParameters.value).not.toBe(opening.eventParameters.value);
    expect(afterOne.macro).toEqual(opening.macro);
    expect(afterOne.balanceDirector).toEqual(opening.balanceDirector);
    expect(afterTwo).toEqual(advanceEventEpochsV1(advanceEventEpochsV1(opening)));
  });
});
