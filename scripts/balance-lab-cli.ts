import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PERSONAL_EVENT_TEMPLATES_V2 } from "../src/data/personal-event-templates-v2";
import { balanceLabGateDecisionV1 } from "../src/lab/balance-lab-v1-acceptance";
import { OfflineBalanceLabV1Error } from "../src/lab/balance-lab-v1-contracts";
import type { BalanceLabBatchSizeV1 } from "../src/lab/balance-lab-v1-config";
import { runBalanceLabPipelineV1 } from "../src/lab/balance-lab-v1-pipeline";
import {
  createPinnedQuickTaxEvidenceSourceV1,
  createPreResolvedPolicyEngineTaxEvidenceSourceV1,
  unavailablePolicyEngineTaxSourceV1,
} from "../src/lab/balance-lab-v1-tax-evidence";
import { balanceLabCodeVersionV1 } from "./balance-lab-code-version";

type CliOptions = Readonly<{
  size: BalanceLabBatchSizeV1;
  configPath: string;
  outputPath: string;
  eventCatalogPath: string | null;
}>;

function parseOptions(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") ||
        !["--size", "--config", "--output", "--event-catalog"].includes(key)) {
      throw new OfflineBalanceLabV1Error(
        "INVALID_RUN_SPEC",
        "Usage: run-balance-lab.mjs --size quick|medium|large [--config file] [--output directory] [--event-catalog file]",
      );
    }
    if (values.has(key)) {
      throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", `duplicate option ${key}`);
    }
    values.set(key, value);
  }
  const size = values.get("--size");
  if (!(size === "quick" || size === "medium" || size === "large")) {
    throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", "size must be quick, medium, or large");
  }
  return Object.freeze({
    size,
    configPath: resolve(values.get("--config") ?? "balance-lab.config.json"),
    outputPath: resolve(values.get("--output") ?? join(".balance-lab-dist", size)),
    eventCatalogPath: values.has("--event-catalog")
      ? resolve(values.get("--event-catalog")!)
      : null,
  });
}

function atomicWriteDirectory(outputPath: string, files: Readonly<Record<string, string>>): void {
  const parent = dirname(outputPath);
  const staging = `${outputPath}.staging-${process.pid}`;
  const backup = `${outputPath}.backup-${process.pid}`;
  mkdirSync(parent, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(staging, name), content, "utf8");
    }
    if (existsSync(outputPath)) renameSync(outputPath, backup);
    renameSync(staging, outputPath);
    rmSync(backup, { recursive: true, force: true });
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(outputPath) && existsSync(backup)) renameSync(backup, outputPath);
    throw cause;
  }
}

function main(): void {
  const root = process.cwd();
  const options = parseOptions(process.argv.slice(2));
  const unsafeConfig = JSON.parse(readFileSync(options.configPath, "utf8"));
  const eventCatalog = options.eventCatalogPath === null
    ? PERSONAL_EVENT_TEMPLATES_V2
    : JSON.parse(readFileSync(options.eventCatalogPath, "utf8"));
  const externalEvidencePath = process.env.BALANCE_LAB_TAX_EVIDENCE_PATH;
  const taxEvidence = options.size === "quick"
    ? createPinnedQuickTaxEvidenceSourceV1(JSON.parse(readFileSync(
        join(root, "src", "lab", "fixtures", "quick-tax-evidence-v1.json"),
        "utf8",
      )))
    : externalEvidencePath === undefined
      ? unavailablePolicyEngineTaxSourceV1(
          `${options.size} requires BALANCE_LAB_TAX_EVIDENCE_PATH with pre-resolved pinned PolicyEngine evidence; live or estimated fallback is forbidden.`,
        )
      : createPreResolvedPolicyEngineTaxEvidenceSourceV1(
          JSON.parse(readFileSync(resolve(externalEvidencePath), "utf8")),
        );
  const pipeline = runBalanceLabPipelineV1({
    unsafeConfig,
    size: options.size,
    experimentId: `balance-${options.size}-v1`,
    codeVersion: balanceLabCodeVersionV1(root),
    taxEvidence,
    eventCatalog,
    verifyRepeatability: true,
  });
  atomicWriteDirectory(options.outputPath, pipeline.files);
  const gate = balanceLabGateDecisionV1(options.size, pipeline.report.acceptance);
  if (gate.status === "fail") {
    throw new OfflineBalanceLabV1Error(
      "ACCEPTANCE_FAILED",
      `configured acceptance rules blocked ${options.size}: ${gate.blockingRuleIds.join(",")}`,
    );
  }
  process.stdout.write(`${JSON.stringify({
    status: "complete",
    size: options.size,
    outputPath: options.outputPath,
    deterministicResultFingerprint:
      pipeline.report.result.deterministicResultFingerprint,
    reportFingerprint: pipeline.report.reportFingerprint,
    processedProductionMonths: pipeline.report.summary.processedMonths,
    observedElapsedMs: pipeline.observedElapsedMs,
  })}\n`);
}

try {
  main();
} catch (cause) {
  const code = cause instanceof OfflineBalanceLabV1Error ? cause.code : "UNEXPECTED_ERROR";
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 2;
}
