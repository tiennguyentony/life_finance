import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import { canonicalJson } from "../src/core/canonical";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../src/data/personal-event-templates-v2";
import { validatePersonalEventCatalogV2, type PersonalEventTemplateV2 } from "../src/core/personal-event-v2";
import { balanceLabGateDecisionV1 } from "../src/lab/balance-lab-v1-acceptance";
import { OfflineBalanceLabV1Error } from "../src/lab/balance-lab-v1-contracts";
import {
  decodeBalanceLabConfigV1,
  resolveBalanceLabBatchV1,
  type BalanceLabBatchSizeV1,
} from "../src/lab/balance-lab-v1-config";
import { runOfflineBalanceLabShardsV1 } from "../src/lab/balance-lab-v1-parallel";
import {
  buildBalanceLabPipelineFromResultV1,
  runBalanceLabPipelineV1,
  type BalanceLabPipelineInputV1,
} from "../src/lab/balance-lab-v1-pipeline";
import type { OfflineBalanceLabResultV1 } from "../src/lab/balance-lab-v1-runner";
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
        "Usage: run-balance-lab.mjs --size beginner|quick|medium|large [--config file] [--output directory] [--event-catalog file]",
      );
    }
    if (values.has(key)) {
      throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", `duplicate option ${key}`);
    }
    values.set(key, value);
  }
  const size = values.get("--size");
  if (!(size === "beginner" || size === "quick" || size === "medium" || size === "large")) {
    throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", "size must be beginner, quick, medium, or large");
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

function runWorkerShard(
  spec: Parameters<typeof runOfflineBalanceLabShardsV1>[0],
  eventCatalog: readonly PersonalEventTemplateV2[],
): Promise<OfflineBalanceLabResultV1> {
  return new Promise((resolveResult, rejectResult) => {
    const worker = new Worker(new URL("./balance-lab-worker.mjs", import.meta.url), {
      workerData: { spec, eventCatalog },
    });
    let settled = false;
    worker.once("message", (result: OfflineBalanceLabResultV1) => {
      settled = true;
      resolveResult(result);
    });
    worker.once("error", (error) => {
      settled = true;
      rejectResult(error);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        rejectResult(new Error(`balance lab worker exited with code ${code}`));
      }
    });
  });
}

async function runBeginnerPipeline(
  input: BalanceLabPipelineInputV1,
  eventCatalog: readonly PersonalEventTemplateV2[],
) {
  const config = decodeBalanceLabConfigV1(input.unsafeConfig);
  const batch = resolveBalanceLabBatchV1(config, "beginner", input.experimentId);
  input.taxEvidence.preflight?.(batch.spec);
  const workerCount = Math.min(4, batch.spec.matchedSeeds.length);
  const runShards = () => runOfflineBalanceLabShardsV1(
    batch.spec,
    workerCount,
    (spec) => runWorkerShard(spec, eventCatalog),
  );
  const started = performance.now();
  const result = await runShards();
  const elapsedMs = Math.max(0, Math.round(performance.now() - started));
  const auditSeeds = batch.spec.matchedSeeds.slice(0, Math.min(8, batch.spec.matchedSeeds.length));
  const auditSpec = { ...batch.spec, matchedSeeds: auditSeeds };
  const audit = await runOfflineBalanceLabShardsV1(
    auditSpec,
    Math.min(workerCount, auditSeeds.length),
    (spec) => runWorkerShard(spec, eventCatalog),
  );
  const auditedSeedSet = new Set(auditSeeds);
  const fullAuditRuns = result.runs.filter(({ matchedSeed }) =>
    auditedSeedSet.has(matchedSeed));
  if (canonicalJson(audit.runs) !== canonicalJson(fullAuditRuns)) {
    throw new OfflineBalanceLabV1Error(
      "PRODUCTION_OWNER_VIOLATION",
      "parallel beginner cohort failed its exact repeatability audit",
    );
  }
  return buildBalanceLabPipelineFromResultV1(
    {
      ...input,
      verifyRepeatability: false,
      repeatabilityAuditMatchedSeeds: auditSeeds.length,
    },
    result,
    elapsedMs,
  );
}

async function main(): Promise<void> {
  const root = process.cwd();
  const options = parseOptions(process.argv.slice(2));
  const unsafeConfig = JSON.parse(readFileSync(options.configPath, "utf8"));
  const eventCatalog = options.eventCatalogPath === null
    ? PERSONAL_EVENT_TEMPLATES_V2
    : JSON.parse(readFileSync(options.eventCatalogPath, "utf8"));
  if (!Array.isArray(eventCatalog) || validatePersonalEventCatalogV2(eventCatalog).length > 0) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_EVENT_CONFIG",
      "event catalog failed strict preflight",
    );
  }
  const externalEvidencePath = process.env.BALANCE_LAB_TAX_EVIDENCE_PATH;
  const taxEvidence = options.size === "quick" || options.size === "beginner"
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
  const pipelineInput: BalanceLabPipelineInputV1 = {
    unsafeConfig,
    size: options.size,
    experimentId: `balance-${options.size}-v1`,
    codeVersion: balanceLabCodeVersionV1(root),
    taxEvidence,
    eventCatalog,
    verifyRepeatability: true,
  };
  const pipeline = options.size === "beginner"
    ? await runBeginnerPipeline(
        pipelineInput,
        eventCatalog as readonly PersonalEventTemplateV2[],
      )
    : runBalanceLabPipelineV1(pipelineInput);
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
  await main();
} catch (cause) {
  const code = cause instanceof OfflineBalanceLabV1Error ? cause.code : "UNEXPECTED_ERROR";
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 2;
}
