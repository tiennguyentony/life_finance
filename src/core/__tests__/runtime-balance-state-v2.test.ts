import { describe, expect, it } from "vitest";

import { ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  advanceRuntimeBalanceMonthV2,
  createInitialRuntimeBalanceStateV2,
  regenerateRuntimeBalancePressureV2,
  runtimeBalanceStateV2,
  validateRuntimeBalanceStateV2,
  type RuntimeBalanceStateV2,
} from "../runtime-balance-state-v2";

describe("Runtime Balance state v2", () => {
  it("creates a complete frozen Normal profile state", () => {
    const state = createInitialRuntimeBalanceStateV2("normal");

    expect(state).toEqual({
      version: 2,
      difficulty: "normal",
      pressureUnits: 4,
      maximumPressureUnits: 10,
      monthlyPressureRegenerationUnits: 1,
      monthsSinceAnyEvent: null,
      monthsSinceMediumEvent: null,
      monthsSinceLargeEvent: null,
      monthsSinceCatastrophicEvent: null,
      catastropheCount: 0,
      recovery: null,
      recentEvents: [],
      lessonExposureCounts: [],
      recentNegativeCashFlowMonths: 0,
      lastApprovedImpactScorePpm: null,
    });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("advances timers separately and regenerates pressure only for a calm month", () => {
    const initial: RuntimeBalanceStateV2 = {
      ...createInitialRuntimeBalanceStateV2("normal"),
      pressureUnits: 9,
      monthsSinceAnyEvent: 0,
      monthsSinceMediumEvent: 2,
      monthsSinceLargeEvent: 1,
      monthsSinceCatastrophicEvent: 8,
      recovery: {
        sourceEventId: "evt.large",
        sourceTier: "large",
        targetedWeakness: "unrelated_hazard",
        remainingMonths: 1,
      },
    };

    const advanced = advanceRuntimeBalanceMonthV2(initial, false);
    expect(advanced).toMatchObject({
      pressureUnits: 9,
      monthsSinceAnyEvent: 1,
      monthsSinceMediumEvent: 3,
      monthsSinceLargeEvent: 2,
      monthsSinceCatastrophicEvent: 9,
      recovery: null,
      recentNegativeCashFlowMonths: 0,
    });
    expect(regenerateRuntimeBalancePressureV2(advanced).pressureUnits).toBe(10);
    expect(
      advanceRuntimeBalanceMonthV2(initial, true).recentNegativeCashFlowMonths,
    ).toBe(1);
  });

  it("upgrades historical v1 values only when the v2 controller is selected", () => {
    const selected = runtimeBalanceStateV2(
      {
        version: 1,
        pressurePpm: ratePpm(500_000),
        recoveryUntilMonth: simulationMonth("2026-09"),
        catastropheCount: 2,
        lastApprovedEventMonth: simulationMonth("2026-07"),
      },
      "guided",
      simulationMonth("2026-08"),
    );

    expect(selected).toMatchObject({
      version: 2,
      difficulty: "guided",
      pressureUnits: 4,
      maximumPressureUnits: 8,
      catastropheCount: 2,
      monthsSinceAnyEvent: 1,
      recovery: { remainingMonths: 1 },
    });
  });

  it("reports structured nested, bounds, duplicate, and profile violations", () => {
    const invalid = {
      ...createInitialRuntimeBalanceStateV2("normal"),
      pressureUnits: 11,
      catastropheCount: -1,
      recovery: {
        sourceEventId: "evt.invalid",
        sourceTier: "micro",
        targetedWeakness: "unknown",
        remainingMonths: 0,
      },
      recentEvents: [
        {
          eventId: "evt.1",
          templateId: "personal.medical_bill",
          templateVersion: 2,
          category: "health",
          lessonTags: ["lesson.insurance", "lesson.insurance"],
          tier: "medium",
          targetedWeakness: "unrelated_hazard",
          approvedMonth: "2026-7",
        },
      ],
      lessonExposureCounts: [
        { lessonTag: "lesson.insurance", count: 1 },
        { lessonTag: "lesson.insurance", count: 2 },
      ],
    } as unknown as RuntimeBalanceStateV2;

    expect(validateRuntimeBalanceStateV2(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "pressureUnits", code: "pressure_out_of_bounds" }),
        expect.objectContaining({ path: "catastropheCount", code: "invalid_count" }),
        expect.objectContaining({ path: "recovery.sourceTier", code: "invalid_recovery_tier" }),
        expect.objectContaining({ path: "recentEvents.0.approvedMonth", code: "invalid_month" }),
        expect.objectContaining({ path: "recentEvents.0.lessonTags", code: "duplicate_value" }),
        expect.objectContaining({ path: "lessonExposureCounts.1.lessonTag", code: "duplicate_value" }),
      ]),
    );
  });

  it("totally validates malformed nested JSON instead of throwing", () => {
    const malformed = {
      ...createInitialRuntimeBalanceStateV2("normal"),
      recovery: undefined,
      recentEvents: [null],
      lessonExposureCounts: [null],
      developmentLastRejections: [null],
    } as unknown as RuntimeBalanceStateV2;

    expect(() => validateRuntimeBalanceStateV2(malformed)).not.toThrow();
    expect(validateRuntimeBalanceStateV2(malformed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "recovery", code: "invalid_recovery" }),
        expect.objectContaining({ path: "recentEvents.0", code: "invalid_entry" }),
        expect.objectContaining({ path: "lessonExposureCounts.0", code: "invalid_entry" }),
        expect.objectContaining({ path: "developmentLastRejections.0", code: "invalid_entry" }),
      ]),
    );
  });

  it("bounds lesson and diagnostic state and validates rejection codes", () => {
    const invalid = {
      ...createInitialRuntimeBalanceStateV2("normal"),
      lessonExposureCounts: Array.from({ length: 65 }, (_, index) => ({
        lessonTag: `lesson.${index}`,
        count: 1,
      })),
      developmentLastRejections: Array.from({ length: 65 }, (_, index) => ({
        templateId: `personal.${index}`,
        code: index === 0 ? "invented_reason" : "ineligible",
      })),
    } as unknown as RuntimeBalanceStateV2;

    expect(validateRuntimeBalanceStateV2(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "lessonExposureCounts", code: "invalid_collection" }),
        expect.objectContaining({ path: "developmentLastRejections", code: "invalid_collection" }),
        expect.objectContaining({ path: "developmentLastRejections.0.code", code: "invalid_rejection_code" }),
      ]),
    );
  });

  it("rejects non-canonical cache order and invalid individual lesson IDs", () => {
    const event = (eventId: string, approvedMonth: "2026-07" | "2026-08") => ({
      eventId,
      templateId: "personal.medical_bill",
      templateVersion: 2,
      category: "health" as const,
      lessonTags: ["invalid lesson tag"],
      tier: "medium" as const,
      targetedWeakness: "unrelated_hazard" as const,
      approvedMonth: simulationMonth(approvedMonth),
    });
    const invalid = {
      ...createInitialRuntimeBalanceStateV2("normal"),
      recentEvents: [
        event("evt.later", "2026-08"),
        event("evt.earlier", "2026-07"),
      ],
      lessonExposureCounts: [
        { lessonTag: "lesson.z", count: 1 },
        { lessonTag: "lesson.a", count: 1 },
      ],
    };

    expect(validateRuntimeBalanceStateV2(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "recentEvents.1.approvedMonth",
          code: "invalid_order",
        }),
        expect.objectContaining({
          path: "recentEvents.0.lessonTags",
          code: "invalid_identifier",
        }),
        expect.objectContaining({
          path: "lessonExposureCounts.1.lessonTag",
          code: "invalid_order",
        }),
      ]),
    );
  });
});
