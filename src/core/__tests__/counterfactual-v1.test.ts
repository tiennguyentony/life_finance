import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { ratePpm } from "../domain/money";
import type { ResolveEventChoiceV2Command } from "../event-lifecycle-v2";
import type { SetRecurringStrategyCommand } from "../recurring-strategy-v2";
import {
  COUNTERFACTUAL_EXECUTION_POLICY_V1,
  canonicalStructuralDiffPathsV1,
  planCounterfactualV1,
  type CounterfactualRequestV1,
  type CounterfactualSeedEvidenceV1,
} from "../counterfactual-v1";

const SHARED_SEED: CounterfactualSeedEvidenceV1 = {
  mode: "shared_cursor",
  stateEvidenceId: `state:4:${"a".repeat(64)}`,
  randomStateChecksum: "b".repeat(64),
};

function strategyCommand(): SetRecurringStrategyCommand {
  return {
    schemaVersion: 2,
    id: "cmd.strategy.source",
    type: "set_recurring_strategy",
    expectedRevision: 4,
    effectiveMonth: "2026-07" as SetRecurringStrategyCommand["effectiveMonth"],
    payload: {
      strategy: {
        emergencyFundTargetMonthsPpm: ratePpm(3_000_000),
        insuranceCoverageIds: ["insurance.renters"],
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(100_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  };
}

function strategyRequest(
  field: "afterTaxBroadIndexRatePpm" = "afterTaxBroadIndexRatePpm",
  value = 150_000,
): CounterfactualRequestV1 {
  return {
    version: "counterfactual-v1",
    sourceCommandId: "cmd.strategy.source",
    intervention: {
      kind: "recurring_strategy_field",
      commandId: "cmd.strategy.source",
      field,
      value,
    },
    horizonMonths: 12,
  };
}

describe("Counterfactual v1 planning boundary", () => {
  it("changes exactly one allow-listed after-tax policy leaf without mutating evidence", () => {
    const source = strategyCommand();
    const request = strategyRequest();
    const sourceBefore = sha256Canonical(source);
    const requestBefore = sha256Canonical(request);
    const seedBefore = sha256Canonical(SHARED_SEED);

    const plan = planCounterfactualV1({
      request,
      sourceCommand: source,
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters", "insurance.umbrella"],
    });

    expect(plan.interventionPath).toBe(
      "payload.strategy.afterTaxBroadIndexRatePpm",
    );
    expect(plan.changedPaths).toEqual([plan.interventionPath]);
    expect(plan.originalValue).toBe(100_000);
    expect(plan.alternateValue).toBe(150_000);
    expect(plan.alternateCommand).toMatchObject({
      schemaVersion: source.schemaVersion,
      id: source.id,
      type: source.type,
      expectedRevision: source.expectedRevision,
      effectiveMonth: source.effectiveMonth,
    });
    expect(plan.seedEvidence).toEqual(SHARED_SEED);
    expect(sha256Canonical(source)).toBe(sourceBefore);
    expect(sha256Canonical(request)).toBe(requestBefore);
    expect(sha256Canonical(SHARED_SEED)).toBe(seedBefore);
  });

  it("changes only choiceId for a verified alternate event response", () => {
    const source: ResolveEventChoiceV2Command = {
      schemaVersion: 2,
      id: "cmd.response.source",
      type: "resolve_event_choice",
      expectedRevision: 9,
      effectiveMonth: "2026-10" as ResolveEventChoiceV2Command["effectiveMonth"],
      payload: { eventId: "evt.medical.1", choiceId: "pay_cash" },
    };
    const request: CounterfactualRequestV1 = {
      version: "counterfactual-v1",
      sourceCommandId: source.id,
      intervention: {
        kind: "event_response",
        commandId: source.id,
        eventId: source.payload.eventId,
        choiceId: "payment_plan",
      },
      horizonMonths: 6,
    };

    const plan = planCounterfactualV1({
      request,
      sourceCommand: source,
      seedEvidence: {
        mode: "named_world",
        version: "named-world-rng-v1",
        stateEvidenceId: `state:9:${"c".repeat(64)}`,
        macroEpoch: 10,
        eventOpportunityEpoch: 10,
        streamStateChecksum: "d".repeat(64),
      },
      availableEventChoiceIds: ["pay_cash", "payment_plan"],
      availableInsuranceCoverageIds: [],
    });

    expect(plan.interventionPath).toBe("payload.choiceId");
    expect(plan.changedPaths).toEqual(["payload.choiceId"]);
    expect(plan.alternateCommand).toEqual({
      ...source,
      payload: { ...source.payload, choiceId: "payment_plan" },
    });
    expect(plan.seedEvidence).toMatchObject({
      mode: "named_world",
      macroEpoch: 10,
      eventOpportunityEpoch: 10,
    });
  });

  it("treats an insurance replacement as one canonical policy field", () => {
    const source = strategyCommand();
    const request: CounterfactualRequestV1 = {
      version: "counterfactual-v1",
      sourceCommandId: source.id,
      intervention: {
        kind: "recurring_strategy_field",
        commandId: source.id,
        field: "insuranceCoverageIds",
        value: ["insurance.umbrella", "insurance.renters"],
      },
      horizonMonths: 3,
    };
    const plan = planCounterfactualV1({
      request,
      sourceCommand: source,
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters", "insurance.umbrella"],
    });

    expect(plan.changedPaths).toEqual([
      "payload.strategy.insuranceCoverageIds",
    ]);
    expect(plan.alternateValue).toEqual([
      "insurance.renters",
      "insurance.umbrella",
    ]);
  });

  it("rejects unsupported pre-tax policy, duplicate insurance, invalid choice, and same value", () => {
    const source = strategyCommand();
    const unsupported = {
      ...strategyRequest(),
      intervention: {
        kind: "recurring_strategy_field" as const,
        commandId: source.id,
        field: "preTax401kSalaryRatePpm",
        value: 0,
      },
    } as unknown as CounterfactualRequestV1;
    expect(() => planCounterfactualV1({
      request: unsupported,
      sourceCommand: source,
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({
      code: "UNSUPPORTED_INTERVENTION",
    }));

    expect(() => planCounterfactualV1({
      request: {
        ...strategyRequest(),
        intervention: {
          kind: "recurring_strategy_field",
          commandId: source.id,
          field: "insuranceCoverageIds",
          value: ["insurance.renters", "insurance.renters"],
        },
      },
      sourceCommand: source,
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({ code: "INVALID_ALTERNATE_VALUE" }));

    expect(() => planCounterfactualV1({
      request: strategyRequest("afterTaxBroadIndexRatePpm", 100_000),
      sourceCommand: source,
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({ code: "INVALID_ALTERNATE_VALUE" }));
  });

  it("enforces the 24-month/256-command semantic bounds and trusted seed evidence", () => {
    expect(Object.isFrozen(COUNTERFACTUAL_EXECUTION_POLICY_V1)).toBe(true);
    expect(COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumHorizonMonths).toBe(24);
    expect(COUNTERFACTUAL_EXECUTION_POLICY_V1.maximumAcceptedCommands).toBe(256);

    expect(() => planCounterfactualV1({
      request: { ...strategyRequest(), horizonMonths: 25 },
      sourceCommand: strategyCommand(),
      seedEvidence: SHARED_SEED,
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));

    expect(() => planCounterfactualV1({
      request: strategyRequest(),
      sourceCommand: strategyCommand(),
      seedEvidence: {
        ...SHARED_SEED,
        randomStateChecksum: "not-a-checksum",
      },
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_CORRUPT" }));

    expect(() => planCounterfactualV1({
      request: strategyRequest(),
      sourceCommand: strategyCommand(),
      seedEvidence: {
        ...SHARED_SEED,
        stateEvidenceId: `state:3:${"a".repeat(64)}`,
      },
      availableEventChoiceIds: [],
      availableInsuranceCoverageIds: ["insurance.renters"],
    })).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_CORRUPT" }));
  });

  it("reports multiple changed paths instead of accepting an expanded intervention", () => {
    const source = strategyCommand();
    const expanded = {
      ...source,
      expectedRevision: source.expectedRevision + 1,
      payload: {
        strategy: {
          ...source.payload.strategy,
          afterTaxBroadIndexRatePpm: 150_000,
        },
      },
    };

    expect(canonicalStructuralDiffPathsV1(source, expanded, [
      "payload.strategy.insuranceCoverageIds",
    ])).toEqual([
      "expectedRevision",
      "payload.strategy.afterTaxBroadIndexRatePpm",
    ]);
  });
});
