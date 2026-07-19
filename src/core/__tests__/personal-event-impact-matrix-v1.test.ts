import { describe, expect, it } from "vitest";

import {
  ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
} from "../../data/personal-event-templates-v2";
import {
  buildPersonalEventImpactMatrixV1,
  validatePersonalEventRewardPenaltyBalanceV1,
} from "../personal-event-impact-matrix-v1";

describe("personal event reward and penalty matrix v1", () => {
  it("enforces broad multi-choice coverage and a bounded reward mix", () => {
    const matrix = buildPersonalEventImpactMatrixV1(
      ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
    );

    expect(matrix.eventCount).toBe(25);
    expect(matrix.responseCount).toBeGreaterThanOrEqual(50);
    expect(matrix.classificationCounts).toEqual({
      positive: 7,
      neutral: 7,
      negative: 11,
    });
    expect(validatePersonalEventRewardPenaltyBalanceV1(matrix)).toEqual([]);
  });

  it("computes exact signed totals for immediate, recurring, and wellbeing effects", () => {
    const matrix = buildPersonalEventImpactMatrixV1(
      ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
    );
    const royalty = matrix.responses.find(
      ({ eventId, responseId }) =>
        eventId === "personal.side_project_license" &&
        responseId === "take_six_month_royalty",
    );
    const medicalPlan = matrix.responses.find(
      ({ eventId, responseId }) =>
        eventId === "personal.medical_bill" &&
        responseId === "medical_payment_plan",
    );
    const recovery = matrix.responses.find(
      ({ eventId, responseId }) =>
        eventId === "personal.employer_wellness_credit" &&
        responseId === "use_credit_for_recovery",
    );

    expect(royalty).toMatchObject({
      totalCashFlowMinimumCents: 120_000,
      totalCashFlowMaximumCents: 1_200_000,
    });
    expect(medicalPlan).toMatchObject({
      totalCashFlowMinimumCents: -1_800_000,
      totalCashFlowMaximumCents: -120_000,
    });
    expect(recovery).toMatchObject({
      totalCashFlowMinimumCents: 7_000,
      totalCashFlowMaximumCents: 52_500,
      burnoutDeltaMinimumPpm: -35_000,
      burnoutDeltaMaximumPpm: -35_000,
    });
  });
});
