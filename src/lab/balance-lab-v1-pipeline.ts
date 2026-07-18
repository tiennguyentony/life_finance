import { performance } from "node:perf_hooks";

import { canonicalJson, sha256Canonical } from "../core/canonical";
import {
  validatePersonalEventCatalogV2,
  type PersonalEventTemplateV2,
} from "../core/personal-event-v2";
import { createBalanceLabPersonaStateV1 } from "../data/balance-lab-personas-v1";
import { evaluateBalanceLabAcceptanceV1 } from "./balance-lab-v1-acceptance";
import {
  decodeBalanceLabConfigV1,
  resolveBalanceLabBatchV1,
  type BalanceLabBatchSizeV1,
  type BalanceLabConfigV1,
} from "./balance-lab-v1-config";
import { OfflineBalanceLabV1Error } from "./balance-lab-v1-contracts";
import { summarizeBalanceLabRunsV1 } from "./balance-lab-v1-metrics";
import { createBalanceLabProductionOwnersV1 } from "./balance-lab-v1-production";
import {
  buildBalanceLabReportV1,
  decodeBalanceLabReportV1,
  renderBalanceLabJsonV1,
  renderBalanceLabMarkdownV1,
  renderBalanceLabMatchedCsvV1,
  renderBalanceLabRunsCsvV1,
  type BalanceLabReportV1,
} from "./balance-lab-v1-reports";
import {
  runOfflineBalanceLabV1,
  type OfflineBalanceLabResultV1,
} from "./balance-lab-v1-runner";
import type { BalanceLabTaxEvidenceSourceV1 } from "./balance-lab-v1-tax-evidence";

export type BalanceLabPipelineResultV1 = Readonly<{
  report: BalanceLabReportV1;
  files: Readonly<Record<string, string>>;
  observedElapsedMs: number;
}>;

function bindEventCatalogFingerprint(
  result: OfflineBalanceLabResultV1,
  eventCatalogFingerprint: string,
): OfflineBalanceLabResultV1 {
  const base = Object.freeze({
    version: result.version,
    spec: result.spec,
    configurationHash: sha256Canonical({
      runnerConfigurationHash: result.configurationHash,
      eventCatalogFingerprint,
    }),
    runs: result.runs,
  });
  return Object.freeze({
    ...base,
    deterministicResultFingerprint: sha256Canonical(base),
  });
}

function preflightCatalog(
  value: unknown,
): readonly PersonalEventTemplateV2[] {
  if (!Array.isArray(value) || value.length < 1) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_EVENT_CONFIG",
      "event catalog must be a non-empty array",
    );
  }
  try {
    const catalog = value as readonly PersonalEventTemplateV2[];
    const violations = validatePersonalEventCatalogV2(catalog);
    if (violations.length > 0) {
      throw new OfflineBalanceLabV1Error(
        "INVALID_EVENT_CONFIG",
        violations.map(({ path, code }) => `${path}:${code}`).join(","),
      );
    }
    return catalog;
  } catch (cause) {
    if (cause instanceof OfflineBalanceLabV1Error) throw cause;
    throw new OfflineBalanceLabV1Error(
      "INVALID_EVENT_CONFIG",
      "event catalog could not be decoded",
    );
  }
}

export function runBalanceLabPipelineV1(input: Readonly<{
  unsafeConfig: unknown;
  size: BalanceLabBatchSizeV1;
  experimentId: string;
  codeVersion: BalanceLabReportV1["codeVersion"];
  taxEvidence: BalanceLabTaxEvidenceSourceV1;
  eventCatalog: unknown;
  verifyRepeatability?: boolean;
}>): BalanceLabPipelineResultV1 {
  const config: BalanceLabConfigV1 = decodeBalanceLabConfigV1(input.unsafeConfig);
  const catalog = preflightCatalog(input.eventCatalog);
  const eventCatalogFingerprint = sha256Canonical(catalog);
  const batch = resolveBalanceLabBatchV1(config, input.size, input.experimentId);
  input.taxEvidence.preflight?.(batch.spec);
  const taxFingerprint = input.taxEvidence.evidenceFingerprint();
  const owners = createBalanceLabProductionOwnersV1({
    createPersonaState: createBalanceLabPersonaStateV1,
    taxEvidence: input.taxEvidence,
    personalEventCatalog: catalog,
  });
  const started = performance.now();
  const result = bindEventCatalogFingerprint(
    runOfflineBalanceLabV1(batch.spec, owners),
    eventCatalogFingerprint,
  );
  const elapsedMs = Math.max(0, Math.round(performance.now() - started));
  if (input.verifyRepeatability !== false) {
    const repeated = bindEventCatalogFingerprint(
      runOfflineBalanceLabV1(batch.spec, owners),
      eventCatalogFingerprint,
    );
    if (
      repeated.deterministicResultFingerprint !==
        result.deterministicResultFingerprint ||
      canonicalJson(repeated.runs) !== canonicalJson(result.runs)
    ) {
      throw new OfflineBalanceLabV1Error(
        "PRODUCTION_OWNER_VIOLATION",
        "production cohort failed exact repeatability verification",
      );
    }
  }
  const summary = summarizeBalanceLabRunsV1(result.runs);
  const acceptance = evaluateBalanceLabAcceptanceV1(
    summary,
    config.acceptance,
    elapsedMs,
    input.size,
  );
  const processedProductionMonths = summary.processedMonths;
  const report = buildBalanceLabReportV1({
    codeVersion: input.codeVersion,
    configurationHash: sha256Canonical({
      balanceLabConfigurationHash: batch.configurationHash,
      eventCatalogFingerprint,
    }),
    eventCatalogFingerprint,
    taxEvidence: {
      version: input.taxEvidence.version,
      fingerprint: taxFingerprint,
    },
    result,
    summary,
    acceptance,
    warnings: Object.freeze([
      ...(acceptance.some(({ status }) => status === "insufficient_sample")
        ? ["One or more acceptance checks have insufficient samples."]
        : []),
    ]),
    limitations: Object.freeze([
      ...(input.taxEvidence.limitation === null ? [] : [input.taxEvidence.limitation]),
      ...(catalog.some(
          ({ severityTier }) => severityTier === "large" || severityTier === "catastrophe",
        )
        ? []
        : ["The supplied event catalog contains no large or catastrophe templates."]),
      "Results compare the documented personas and bot policies; they are not population estimates.",
    ]),
    runtime: {
      elapsedMs,
      processedProductionMonths,
      productionMonthsPerSecond: elapsedMs === 0
        ? processedProductionMonths * 1_000
        : Math.floor((processedProductionMonths * 1_000) / elapsedMs),
    },
  });
  decodeBalanceLabReportV1(JSON.parse(renderBalanceLabJsonV1(report)));
  const prefix = input.size;
  const files = Object.freeze({
    [`${prefix}.report.json`]: renderBalanceLabJsonV1(report),
    [`${prefix}.runs.csv`]: renderBalanceLabRunsCsvV1(report),
    [`${prefix}.matched.csv`]: renderBalanceLabMatchedCsvV1(report),
    [`${prefix}.report.md`]: renderBalanceLabMarkdownV1(report),
    [`${prefix}.summary.json`]: `${canonicalJson({
      version: "balance-lab-summary-v1",
      size: input.size,
      deterministicResultFingerprint: report.result.deterministicResultFingerprint,
      reportFingerprint: report.reportFingerprint,
      runCount: summary.runCount,
      processedProductionMonths,
      acceptance: acceptance.map(({ id, status }) => ({ id, status })),
      artifacts: [
        `${prefix}.report.json`,
        `${prefix}.runs.csv`,
        `${prefix}.matched.csv`,
        `${prefix}.report.md`,
      ],
    })}\n`,
  });
  return Object.freeze({ report, files, observedElapsedMs: elapsedMs });
}
