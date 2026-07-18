import { sha256Canonical } from "../core/canonical";
import type { GameStateV2 } from "../core/game-state-v2";
import type { MonthlyTaxEvidence } from "../core/payroll-v2";
import {
  buildMonthlyTaxEvidenceFromPolicyEngineV1,
  buildTaxRequest,
} from "../server/api/tax-orchestrator";
import { fingerprintAnnualTaxContext } from "../server/tax/context-cache";
import { OfflineBalanceLabV1Error } from "./balance-lab-v1-contracts";
import type { BalanceLabRunSpecV1 } from "./balance-lab-v1-contracts";
import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  type TaxCalculationResult,
} from "../server/tax/contracts";

export type BalanceLabTaxEvidenceSourceV1 = Readonly<{
  version: "quick-tax-fixture-v1" | "policyengine-live-v1";
  getEvidence(state: GameStateV2, commandId: string): MonthlyTaxEvidence;
  evidenceFingerprint(): string;
  limitation: string | null;
  preflight?(spec: BalanceLabRunSpecV1): void;
}>;

export type PinnedTaxEvidenceBundleV1 = Readonly<{
  version: "quick-tax-fixture-v1" | "policyengine-evidence-tape-v1";
  provider: "PolicyEngine US";
  bundleVersion: typeof POLICYENGINE_BUNDLE_VERSION;
  rulesVersion: typeof POLICYENGINE_US_VERSION;
  rows: readonly Readonly<{
    economicYear: number;
    annualGrossIncomeCents: number;
    annualEmployee401kCents: number;
    annualEmployeeHsaCents: number;
    annualTotalTaxCents: number;
  }>[];
}>;

export type QuickTaxEvidenceFixtureV1 = Readonly<{
  version: "quick-tax-fixture-v1";
  provider: "PolicyEngine US";
  bundleVersion: string;
  rulesVersion: string;
  evidenceByAnnualContext: Readonly<Record<string, MonthlyTaxEvidence>>;
}>;

export function createQuickTaxEvidenceSourceV1(
  fixture: QuickTaxEvidenceFixtureV1,
): BalanceLabTaxEvidenceSourceV1 {
  if (
    fixture.version !== "quick-tax-fixture-v1" ||
    fixture.provider !== "PolicyEngine US" ||
    fixture.bundleVersion.length === 0 ||
    fixture.rulesVersion.length === 0
  ) {
    throw new OfflineBalanceLabV1Error(
      "MISSING_TAX_EVIDENCE",
      "quick tax fixture metadata is invalid",
    );
  }
  const fingerprint = sha256Canonical(fixture);
  return Object.freeze({
    version: fixture.version,
    limitation:
      "Quick evidence is exact only for checked-in annual contexts; other contexts require the external pinned PolicyEngine service.",
    evidenceFingerprint: () => fingerprint,
    getEvidence: (state: GameStateV2, commandId: string) => {
      const context = fingerprintAnnualTaxContext(buildTaxRequest(state, commandId));
      const evidence = fixture.evidenceByAnnualContext[context];
      if (evidence === undefined) {
        throw new OfflineBalanceLabV1Error(
          "MISSING_TAX_EVIDENCE",
          `quick tax fixture does not contain annual context ${context}`,
        );
      }
      return buildMonthlyTaxEvidenceFromPolicyEngineV1(
        state,
        commandId,
        { kind: "cached", evidence },
      );
    },
  });
}

function decodePinnedBundleV1(
  value: unknown,
  expectedVersion: PinnedTaxEvidenceBundleV1["version"],
): PinnedTaxEvidenceBundleV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OfflineBalanceLabV1Error("MISSING_TAX_EVIDENCE", "quick tax evidence must be an object");
  }
  const bundle = value as Record<string, unknown>;
  if (Object.keys(bundle).sort().join("|") !==
      "bundleVersion|provider|rows|rulesVersion|version" ||
      bundle.version !== expectedVersion ||
      bundle.provider !== "PolicyEngine US" ||
      bundle.bundleVersion !== POLICYENGINE_BUNDLE_VERSION ||
      bundle.rulesVersion !== POLICYENGINE_US_VERSION ||
      !Array.isArray(bundle.rows) || bundle.rows.length < 1) {
    throw new OfflineBalanceLabV1Error("MISSING_TAX_EVIDENCE", "quick tax evidence metadata is invalid");
  }
  const keys = "annualEmployee401kCents|annualEmployeeHsaCents|annualGrossIncomeCents|annualTotalTaxCents|economicYear";
  const rows = bundle.rows.map((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new OfflineBalanceLabV1Error("MISSING_TAX_EVIDENCE", "quick tax evidence row is invalid");
    }
    const row = candidate as Record<string, unknown>;
    if (Object.keys(row).sort().join("|") !== keys ||
        !Object.values(row).every((field) => Number.isSafeInteger(field) && (field as number) >= 0)) {
      throw new OfflineBalanceLabV1Error("MISSING_TAX_EVIDENCE", "quick tax evidence row is invalid");
    }
    return Object.freeze({ ...row }) as PinnedTaxEvidenceBundleV1["rows"][number];
  });
  return Object.freeze({
    version: expectedVersion,
    provider: "PolicyEngine US",
    bundleVersion: POLICYENGINE_BUNDLE_VERSION,
    rulesVersion: POLICYENGINE_US_VERSION,
    rows: Object.freeze(rows),
  });
}

export function createPinnedQuickTaxEvidenceSourceV1(
  unsafeBundle: unknown,
): BalanceLabTaxEvidenceSourceV1 {
  return createPinnedTaxEvidenceSourceV1(
    decodePinnedBundleV1(unsafeBundle, "quick-tax-fixture-v1"),
    "quick-tax-fixture-v1",
    "Checked-in PolicyEngine evidence is pinned to the quick cohort years, salary, filing status, and pretax contribution contexts.",
  );
}

export function createPreResolvedPolicyEngineTaxEvidenceSourceV1(
  unsafeBundle: unknown,
): BalanceLabTaxEvidenceSourceV1 {
  return createPinnedTaxEvidenceSourceV1(
    decodePinnedBundleV1(unsafeBundle, "policyengine-evidence-tape-v1"),
    "policyengine-live-v1",
    null,
  );
}

function createPinnedTaxEvidenceSourceV1(
  bundle: PinnedTaxEvidenceBundleV1,
  sourceVersion: BalanceLabTaxEvidenceSourceV1["version"],
  limitation: string | null,
): BalanceLabTaxEvidenceSourceV1 {
  const fingerprint = sha256Canonical(bundle);
  const years = new Set(bundle.rows.map(({ economicYear }) => economicYear));
  return Object.freeze({
    version: sourceVersion,
    limitation,
    evidenceFingerprint: () => fingerprint,
    preflight: (spec) => {
      const requiredYears = Math.ceil(spec.horizonMonths / 12);
      for (let offset = 0; offset < requiredYears; offset += 1) {
        if (!years.has(2026 + offset)) {
          throw new OfflineBalanceLabV1Error(
            "MISSING_TAX_EVIDENCE",
            `pinned tax evidence does not cover economic year ${2026 + offset}`,
          );
        }
      }
    },
    getEvidence: (state, commandId) => {
      const request = buildTaxRequest(state, commandId);
      const primary = request.people.find(({ role }) => role === "primary");
      const job = primary?.income.w2Jobs[0];
      if (job === undefined) {
        throw new OfflineBalanceLabV1Error("MISSING_TAX_EVIDENCE", "tax context has no primary W-2 job");
      }
      const row = bundle.rows.find((candidate) =>
        candidate.economicYear === request.economicYear &&
        candidate.annualGrossIncomeCents === job.wagesCents &&
        candidate.annualEmployee401kCents === job.pretaxRetirementContributionsCents &&
        candidate.annualEmployeeHsaCents === job.pretaxHealthContributionsCents,
      );
      if (row === undefined) {
        throw new OfflineBalanceLabV1Error(
          "MISSING_TAX_EVIDENCE",
          `pinned tax evidence does not contain annual context ${fingerprintAnnualTaxContext(request)}`,
        );
      }
      const result: TaxCalculationResult = {
        schemaVersion: 1,
        traceId: request.traceId,
        economicYear: request.economicYear,
        policyYear: request.policyYear,
        stateCode: request.stateCode,
        filingStatus: request.filingStatus,
        annualGrossIncomeCents: job.wagesCents,
        federalIncomeTaxCents: row.annualTotalTaxCents,
        stateIncomeTaxCents: 0,
        employeePayrollTaxCents: 0,
        selfEmploymentTaxCents: 0,
        totalTaxCents: row.annualTotalTaxCents,
        afterTaxIncomeCents: job.wagesCents - row.annualTotalTaxCents,
        effectiveTaxRatePpm: Math.floor(
          (row.annualTotalTaxCents * 1_000_000) / job.wagesCents,
        ),
        componentsCents: { pinned_quick_total_tax: row.annualTotalTaxCents },
        model: {
          provider: "PolicyEngine US",
          bundleVersion: bundle.bundleVersion,
          rulesVersion: bundle.rulesVersion,
          projectedFromFrozenPolicy: false,
        },
        disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
      };
      return buildMonthlyTaxEvidenceFromPolicyEngineV1(
        state,
        commandId,
        { kind: "calculated", result },
      );
    },
  });
}

/**
 * The production calculator is asynchronous and external. The synchronous
 * headless runner refuses to estimate when that service is not pre-resolved.
 */
export function unavailablePolicyEngineTaxSourceV1(
  reason = "Pinned PolicyEngine API URL/token is unavailable",
): BalanceLabTaxEvidenceSourceV1 {
  return Object.freeze({
    version: "policyengine-live-v1",
    limitation: reason,
    evidenceFingerprint: () => sha256Canonical({ version: "policyengine-live-v1", reason }),
    preflight: () => {
      throw new OfflineBalanceLabV1Error("TAX_SERVICE_UNAVAILABLE", reason);
    },
    getEvidence: () => {
      throw new OfflineBalanceLabV1Error("TAX_SERVICE_UNAVAILABLE", reason);
    },
  });
}
