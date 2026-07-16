import { describe, expect, it } from "vitest";

import type {
  PlayerPolicyPreviewV2Request,
  PlayerPolicyPreviewV2Response,
} from "@/server/api/contracts-v2";

import {
  approvedPolicyCommand,
  createPolicyPreviewSession,
  invalidatePolicyPreview,
  isCurrentPolicyPreviewGeneration,
} from "../policy-preview-model";

const command = {
  schemaVersion: 2,
  id: "strategy.preview.browser",
  expectedRevision: 7,
  effectiveMonth: "2028-03",
  type: "set_recurring_strategy",
  payload: {
    strategy: {
      preTax401kSalaryRatePpm: 100_000,
      preTaxHsaSalaryRatePpm: 20_000,
      afterTaxBroadIndexRatePpm: 150_000,
      afterTaxSectorRatePpm: 0,
      afterTaxSpeculativeRatePpm: 0,
      afterTaxIraRatePpm: 25_000,
      afterTaxExtraDebtRatePpm: 50_000,
    },
  },
} as const satisfies PlayerPolicyPreviewV2Request;

const response = {
  schemaVersion: 1,
  commandType: "set_recurring_strategy",
  actionPolicyVersion: null,
  commandChecksum: "1".repeat(64),
  openingStateChecksum: "2".repeat(64),
  resultingStateChecksum: "3".repeat(64),
  openingRevision: 7,
  resultingRevision: 8,
  effects: {
    cashChangeCents: 0,
    automaticLiquidityChangeCents: 0,
    termDebtPrincipalChangeCents: 0,
    revolvingCreditUsedChangeCents: 0,
    annualLivingCostChangeCents: 0,
    requiredObligationsChangeCents: 0,
  },
  policyChanges: [],
  appendedLedgerTransactionIds: [],
  appendedLedgerTransactions: [],
} as const satisfies PlayerPolicyPreviewV2Response;

describe("player policy preview approval model", () => {
  it("returns the exact previewed public command only while its state revision and month are current", () => {
    const session = createPolicyPreviewSession(
      command,
      response,
      "Recurring strategy updated.",
    );

    expect(approvedPolicyCommand(session, 7, "2028-03")).toBe(command);
    expect(approvedPolicyCommand(session, 8, "2028-03")).toBeNull();
    expect(approvedPolicyCommand(session, 7, "2028-04")).toBeNull();
  });

  it("clears a stored command when a draft changes", () => {
    const session = createPolicyPreviewSession(
      command,
      response,
      "Recurring strategy updated.",
    );

    expect(invalidatePolicyPreview(session)).toBeNull();
  });

  it("rejects a preview response after the draft generation changes", () => {
    expect(isCurrentPolicyPreviewGeneration(3, 3)).toBe(true);
    expect(isCurrentPolicyPreviewGeneration(3, 4)).toBe(false);
    expect(isCurrentPolicyPreviewGeneration(-1, -1)).toBe(false);
  });
});
