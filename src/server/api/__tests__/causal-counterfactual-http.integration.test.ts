import { describe, expect, it, vi } from "vitest";

import { buildCausalHistoryV1 } from "../../../core/causal-history-v1";
import {
  handleGetCausalHistoryV1,
  handleRunCounterfactualV1,
} from "../http";
import type { RunApiServiceV2 } from "../service-v2";
import { RunRepositoryError } from "../../db/run-repository-contracts";

const runId = "12000000-0000-4000-8000-000000000012";
const accessSecret = `lf_run_${"A".repeat(43)}`;
const checksum = "a".repeat(64);

function emptyHistory() {
  return buildCausalHistoryV1({
    runId,
    fromRevision: 0,
    toRevision: 0,
    sourceStateChecksum: checksum,
    nodes: [],
    links: [],
    turningPoints: [],
    coverage: {
      beginsAtRevision: 0,
      endsAtRevision: 0,
      preMigrationHistoryAvailable: true,
      summarizedCommandRanges: [],
      missingEvidence: [],
    },
  });
}

function counterfactualResult() {
  const branch = {
    revision: 2,
    month: "2026-08",
    cashCents: 1_000_000,
    totalDebtCents: 0,
    netWorthCents: 1_000_000,
    recoveryRemainingMonths: null,
    fiProgressPpm: 100_000,
    outcomeKind: null,
    outcomeReasonCode: null,
    forcedSaleGrossCents: 0,
    forcedSaleCount: 0,
    newRevolvingCreditCents: 0,
    residualShortfallCents: 0,
    finalStateChecksum: checksum,
  } as const;
  return {
    version: "counterfactual-v1",
    sourceCommandId: "cmd.strategy",
    sourceRevision: 0,
    interventionPath: "payload.strategy.afterTaxBroadIndexRatePpm",
    originalValue: 100_000,
    alternateValue: 0,
    changedPaths: ["payload.strategy.afterTaxBroadIndexRatePpm"],
    requestedHorizonMonths: 1,
    comparedMonths: 1,
    acceptedCommandCount: 2,
    lastComparableRevision: 2,
    lastComparableMonth: "2026-08",
    stopReason: "requested_horizon_reached",
    seedControl: {
      mode: "matched_shared_cursor_through_horizon",
      lastComparableRevision: 2,
      lastComparableMonth: "2026-08",
    },
    assumptions: [
      "deterministic_simulation_comparison_not_real_life_prediction",
      "future_player_commands_held_unchanged_until_stop_reason",
      "tax_evidence_reused_only_while_context_fingerprint_matches",
      "future_seed_control_reported_from_verified_seed_evidence",
    ],
    actual: branch,
    alternative: { ...branch, finalStateChecksum: "b".repeat(64) },
    difference: {
      direction: "alternative_minus_actual",
      cashCents: 0,
      totalDebtCents: 0,
      netWorthCents: 0,
      forcedSaleGrossCents: 0,
      forcedSaleCount: 0,
      newRevolvingCreditCents: 0,
      residualShortfallCents: 0,
      recoveryRemainingMonths: null,
      fiProgressPpm: 0,
      outcomeChanged: false,
    },
    evidenceIds: [`state:0:${checksum}`, "command:cmd.strategy"],
    resultChecksum: "c".repeat(64),
  } as const;
}

describe("causal history and counterfactual HTTP integration", () => {
  it("requires bearer authentication before requesting causal history", async () => {
    const getCausalHistory = vi.fn();
    const service = { getCausalHistory } as unknown as RunApiServiceV2;
    const response = await handleGetCausalHistoryV1(
      new Request(`http://localhost/api/v2/runs/${runId}/history`),
      runId,
      service,
    );
    expect(response.status).toBe(401);
    expect(getCausalHistory).not.toHaveBeenCalled();
  });

  it("passes the authenticated read through the service and strict response contract", async () => {
    const history = emptyHistory();
    const getCausalHistory = vi.fn().mockResolvedValue({ history });
    const service = { getCausalHistory } as unknown as RunApiServiceV2;
    const response = await handleGetCausalHistoryV1(
      new Request(`http://localhost/api/v2/runs/${runId}/history?fromRevision=0&toRevision=0`, {
        headers: { Authorization: `Bearer ${accessSecret}` },
      }),
      runId,
      service,
    );
    expect(response.status).toBe(200);
    expect(getCausalHistory).toHaveBeenCalledWith(runId, accessSecret, {
      fromRevision: 0,
      toRevision: 0,
    });
    expect(await response.json()).toEqual({ history });
  });

  it("rejects reversed or wider-than-120 history ranges before repository work", async () => {
    const getCausalHistory = vi.fn();
    const service = { getCausalHistory } as unknown as RunApiServiceV2;
    const response = await handleGetCausalHistoryV1(
      new Request(
        `http://localhost/api/v2/runs/${runId}/history?fromRevision=1&toRevision=122`,
        { headers: { Authorization: `Bearer ${accessSecret}` } },
      ),
      runId,
      service,
    );
    expect(response.status).toBe(400);
    expect(getCausalHistory).not.toHaveBeenCalled();
  });

  it("maps an authenticated out-of-run history range to a client error", async () => {
    const getCausalHistory = vi.fn().mockRejectedValue(
      new RunRepositoryError(
        "INVALID_RANGE",
        "causal history target revision is outside the run",
      ),
    );
    const service = { getCausalHistory } as unknown as RunApiServiceV2;
    const response = await handleGetCausalHistoryV1(
      new Request(
        `http://localhost/api/v2/runs/${runId}/history?fromRevision=0&toRevision=5`,
        { headers: { Authorization: `Bearer ${accessSecret}` } },
      ),
      runId,
      service,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_RANGE" },
    });
  });

  it("validates one-change input and returns the bounded service result", async () => {
    const result = counterfactualResult();
    const runCounterfactual = vi.fn().mockResolvedValue({ result });
    const service = { runCounterfactual } as unknown as RunApiServiceV2;
    const body = {
      version: "counterfactual-v1",
      sourceCommandId: "cmd.strategy",
      intervention: {
        kind: "recurring_strategy_field",
        commandId: "cmd.strategy",
        field: "afterTaxBroadIndexRatePpm",
        value: 0,
      },
      horizonMonths: 1,
    };
    const response = await handleRunCounterfactualV1(
      new Request(`http://localhost/api/v2/runs/${runId}/counterfactual`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      runId,
      service,
    );
    expect(response.status).toBe(200);
    expect(runCounterfactual).toHaveBeenCalledWith(
      runId,
      accessSecret,
      expect.objectContaining({ sourceCommandId: "cmd.strategy" }),
    );
    expect(await response.json()).toEqual({ result });
  });
});
