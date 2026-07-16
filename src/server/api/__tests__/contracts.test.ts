import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import {
  createRunRequestSchema,
  gameCommandSchema,
  gameStateSchema,
  internalGameCommandSchema,
  journalTransactionSchema,
} from "../contracts";
import { generateOpenApiDocument } from "../openapi";
import {
  createRunV2RequestSchema,
  gameCommandV2PublicSchema,
  migrateRunV2ResponseSchema,
} from "../contracts-v2";

const finances = {
  cashCents: 10_000_00,
  taxableInvestmentsCents: 20_000_00,
  retirementCents: 30_000_00,
  homeValueCents: 0,
  otherInvestableAssetsCents: 0,
  otherAssetsCents: 0,
  nonCreditLiabilitiesCents: 0,
  creditLimitCents: 10_000_00,
  creditUsedCents: 0,
  annualLivingCostCents: 60_000_00,
  requiredObligationsCents: 5_000_00,
};

function v1State() {
  return createInitialGameState({
    runId: "10000000-0000-4000-8000-000000000001",
    startMonth: "2026-07",
    randomSeed: "api",
    player: {
      playerId: "player_api",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: Object.fromEntries(
      Object.entries(finances).map(([key, value]) => [key, moneyCents(value)]),
    ) as Parameters<typeof createInitialGameState>[0]["finances"],
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  });
}

describe("v1 API contracts", () => {
  it("accepts a complete initial-state request and rejects unknown nested fields", () => {
    const request = {
      startMonth: "2026-07",
      player: {
        birthMonth: "1990-01",
        locationId: "US-CA",
        careerTrackId: "software_engineer",
        filingStatus: "single",
      },
      finances,
      wellbeing: { burnoutPpm: 200_000, happinessPpm: 800_000 },
      randomSeed: "api-contract",
    };
    expect(createRunRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      createRunRequestSchema.parse({
        ...request,
        finances: { ...finances, modelInventedBalance: 1 },
      }),
    ).toThrow();
  });

  it("rejects unsafe cents, invalid credit, months, and command fields", () => {
    expect(() =>
      createRunRequestSchema.parse({
        startMonth: "2026-13",
        player: {
          birthMonth: "1990-01",
          locationId: "US-CA",
          careerTrackId: "engineer",
          filingStatus: "single",
        },
        finances: {
          ...finances,
          cashCents: Number.MAX_SAFE_INTEGER + 1,
          creditUsedCents: 20_000_00,
        },
        wellbeing: { burnoutPpm: 0, happinessPpm: 0 },
        randomSeed: 1,
      }),
    ).toThrow();
    expect(() =>
      internalGameCommandSchema.parse({
        schemaVersion: 1,
        id: "cmd.invalid",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "advance_month",
        payload: { months: 12 },
      }),
    ).toThrow();
  });

  it("parses actual engine state and a strict monthly event command", () => {
    const state = v1State();
    expect(gameStateSchema.parse(state)).toEqual(state);
    expect(
      internalGameCommandSchema.parse({
        schemaVersion: 1,
        id: "cmd.month.1",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "process_month",
        payload: {
          employmentIncomeCents: 8_000_00,
          taxableLiquidationCostRatePpm: 10_000,
          event: {
            proposal: {
              eventId: "evt.tech.1",
              templateId: "macro.tech_boom",
              templateVersion: 1,
              parameters: { equity_boost_ppm: 50_000 },
            },
          },
        },
      }).type,
    ).toBe("process_month");
  });

  it("accepts complete or absent ledger provenance and rejects partial provenance", () => {
    const transaction = {
      id: "txn.opening",
      commandId: "system.initialize",
      effectiveMonth: "2026-07",
      reasonCode: "opening_balances",
      description: "Opening balances",
      sourceSystem: "state_initialization",
      category: "equity.opening",
      causalReference: { kind: "system", id: "run.opening" },
      postings: [
        { accountId: "asset.cash", debitCents: 100, creditCents: 0 },
        { accountId: "equity.opening", debitCents: 0, creditCents: 100 },
      ],
    };
    const legacy = {
      id: transaction.id,
      commandId: transaction.commandId,
      effectiveMonth: transaction.effectiveMonth,
      reasonCode: transaction.reasonCode,
      description: transaction.description,
      postings: transaction.postings,
    };

    expect(journalTransactionSchema.parse(transaction)).toEqual(transaction);
    expect(journalTransactionSchema.parse(legacy)).toEqual(legacy);
    expect(() =>
      journalTransactionSchema.parse({
        ...legacy,
        sourceSystem: "state_initialization",
      }),
    ).toThrow();
  });

  it("keeps authoritative journals and month inputs off the public boundary", () => {
    const envelope = {
      schemaVersion: 1,
      id: "cmd.public.1",
      expectedRevision: 0,
      effectiveMonth: "2026-07",
    } as const;
    expect(
      gameCommandSchema.parse({
        ...envelope,
        type: "take_action",
        payload: { action: { type: "invest_cash", amountCents: 100_00 } },
      }).type,
    ).toBe("take_action");
    for (const type of ["advance_month", "post_transaction", "process_month"]) {
      expect(() =>
        gameCommandSchema.parse({ ...envelope, type, payload: {} }),
      ).toThrow();
    }
  });
});

describe("v2 API contracts", () => {
  it("validates successful and idempotent migration responses", () => {
    const state = migrateGameStateV1ToV2(v1State());

    expect(
      migrateRunV2ResponseSchema.parse({
        state,
        stateChecksum: "0".repeat(64),
        idempotentReplay: true,
      }).idempotentReplay,
    ).toBe(true);
  });

  it("accepts catalog-backed creation and rejects authoritative month inputs", () => {
    expect(
      createRunV2RequestSchema.parse({
        schemaVersion: 2,
        startMonth: "2026-07",
        birthMonth: "1995-01",
        randomSeed: "contract-v2",
        catalogVersion: "us-2026.2",
        locationId: "location.seattle",
        careerId: "career.software",
        householdId: "household.single",
        benefitsPackageId: "benefits.corporate_flex",
        healthPlanId: "health.hdhp_hsa",
        retirementPlanId: "retirement.401k_standard",
        insuranceCoverageIds: ["insurance.renters"],
        scenarioId: "scenario.fresh_start",
        annualGrossSalaryCents: 12_000_000,
        finances: {
          cashCents: 1_000_000,
          taxableBroadIndexCents: 0,
          taxableSectorCents: 0,
          taxableSpeculativeCents: 0,
          retirement401kCents: 0,
          retirementIraCents: 0,
          hsaCents: 0,
          homeValueCents: 0,
          otherAssetsCents: 0,
          termDebts: [],
          revolvingCreditLimitCents: 1_000_000,
          revolvingCreditUsedCents: 0,
        },
        wellbeing: { burnoutPpm: 0, happinessPpm: 1_000_000 },
      }).schemaVersion,
    ).toBe(2);
    expect(() =>
      gameCommandV2PublicSchema.parse({
        schemaVersion: 2,
        id: "cmd.public-v2.month",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "process_month",
        payload: { taxEvidence: { totalTaxCents: 0 } },
      }),
    ).toThrow();
    expect(
      gameCommandV2PublicSchema.parse({
        schemaVersion: 2,
        id: "cmd.public-v2.choice",
        expectedRevision: 1,
        effectiveMonth: "2026-08",
        type: "resolve_event_choice",
        payload: {
          eventId: "evt.2026-08.personal.medical_bill",
          choiceId: "use_insurance",
        },
      }).type,
    ).toBe("resolve_event_choice");
    expect(
      gameCommandV2PublicSchema.parse({
        schemaVersion: 2,
        id: "cmd.public-v2.milestone",
        expectedRevision: 2,
        effectiveMonth: "2026-08",
        type: "manage_life_milestone",
        payload: {
          action: "schedule",
          milestoneId: "milestone.first-car",
          kind: "vehicle",
          label: "Buy a reliable car",
          targetMonth: "2027-01",
          estimatedCostCents: 2_000_000,
        },
      }).type,
    ).toBe("manage_life_milestone");
  });
});

describe("generated OpenAPI", () => {
  it("publishes versioned paths from the same strict schemas", () => {
    const document = generateOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths ?? {}).toSorted()).toEqual([
      "/api/v1/health",
      "/api/v1/runs",
      "/api/v1/runs/{runId}",
      "/api/v1/runs/{runId}/commands",
      "/api/v2/runs",
      "/api/v2/runs/{runId}",
      "/api/v2/runs/{runId}/ai/explanation",
      "/api/v2/runs/{runId}/ai/debrief",
      "/api/v2/runs/{runId}/ai/world-event",
      "/api/v2/runs/{runId}/checkpoint",
      "/api/v2/runs/{runId}/commands",
      "/api/v2/runs/{runId}/migrate",
    ].toSorted());
    expect(
      document.paths?.["/api/v1/runs/{runId}"]?.get?.security,
    ).toEqual([{ runBearer: [] }]);
    expect(document.components?.securitySchemes).toHaveProperty("runBearer");
    expect(JSON.stringify(document.paths?.["/api/v1/runs/{runId}"])).not.toContain(
      "accessSecret",
    );
    expect(
      document.paths?.["/api/v2/runs/{runId}/commands"]?.post?.security,
    ).toEqual([{ runBearer: [] }]);
    expect(
      document.paths?.["/api/v2/runs/{runId}/checkpoint"]?.get?.security,
    ).toEqual([{ runBearer: [] }]);
    expect(
      document.paths?.["/api/v2/runs/{runId}/migrate"]?.post?.security,
    ).toEqual([{ runBearer: [] }]);
    expect(
      JSON.stringify(document.paths?.["/api/v2/runs/{runId}/commands"]),
    ).not.toContain("taxEvidence");
    expect(document.paths?.["/api/v1/runs"]?.post?.deprecated).toBe(true);
    expect(
      Object.keys(document.paths?.["/api/v1/runs"]?.post?.responses ?? {}),
    ).toEqual(["410"]);
    expect(
      document.paths?.["/api/v1/runs/{runId}/commands"]?.post?.deprecated,
    ).toBe(true);
    expect(
      Object.keys(
        document.paths?.["/api/v1/runs/{runId}/commands"]?.post?.responses ?? {},
      ),
    ).toEqual(["410"]);
  });
});
