import { describe, expect, it } from "vitest";

import { simulationMonth } from "../domain/month";
import {
  createTeachingFactPacketV2,
  TeachingFactsV2Error,
} from "../teaching-facts-v2";

describe("TeachingFactPacketV2", () => {
  it("keeps verified values traceable and deeply immutable", () => {
    const packet = createTeachingFactPacketV2({
      asOfRevision: 12,
      asOfMonth: simulationMonth("2030-04"),
      facts: [
        {
          factId: "goal.current.progress_ppm",
          labelId: "financial_independence_progress",
          value: { kind: "rate_ppm", value: 420_000 },
          source: {
            kind: "outcome_result",
            sourceId: "outcome:12:financial_independence_target_not_reached",
            supportingSourceIds: ["outcome:12:financial_independence_target_not_reached"],
            field: "financialIndependence.progressPpm",
            revision: 12,
            month: simulationMonth("2030-04"),
          },
        },
      ],
    });

    expect(packet).toEqual({
      version: "teaching-facts-v2",
      asOfRevision: 12,
      asOfMonth: "2030-04",
      facts: [
        {
          factId: "goal.current.progress_ppm",
          labelId: "financial_independence_progress",
          value: { kind: "rate_ppm", value: 420_000 },
          source: {
            kind: "outcome_result",
            sourceId: "outcome:12:financial_independence_target_not_reached",
            supportingSourceIds: ["outcome:12:financial_independence_target_not_reached"],
            field: "financialIndependence.progressPpm",
            revision: 12,
        month: simulationMonth("2030-04"),
          },
        },
      ],
    });
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.facts)).toBe(true);
    expect(Object.isFrozen(packet.facts[0]?.value)).toBe(true);
    expect(Object.isFrozen(packet.facts[0]?.source)).toBe(true);
  });

  it("rejects duplicate facts and evidence from the future", () => {
    const fact = {
      factId: "risk.emergency_fund_months",
      labelId: "emergency_fund_months",
      value: { kind: "months_ppm" as const, value: 2_000_000 },
      source: {
        kind: "risk_snapshot" as const,
        sourceId: "risk:2030-05:risk-v1.emergency_fund_months",
        supportingSourceIds: ["risk:2030-05:risk-v1.emergency_fund_months"],
        field: "metrics.emergency_fund_months.rawValue",
        revision: 13,
        month: simulationMonth("2030-05"),
      },
    };

    expect(() =>
      createTeachingFactPacketV2({
        asOfRevision: 12,
        asOfMonth: simulationMonth("2030-04"),
        facts: [fact, fact],
      }),
    ).toThrowError(TeachingFactsV2Error);
  });
});
