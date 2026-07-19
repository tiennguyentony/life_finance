import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { balanceLabSourceHashV1 } from "../../../scripts/balance-lab-code-version";
import rawConfig from "../../../balance-lab.config.json";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import { decodeBalanceLabReportV1 } from "../balance-lab-v1-reports";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "life-finance-balance-lab-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("offline balance lab CLI pipeline", () => {
  it("changes the source hash when an imported production owner changes", () => {
    const root = temporaryDirectory();
    for (const directory of [
      join(root, "src", "core", "__tests__"),
      join(root, "src", "data"),
      join(root, "src", "lab"),
      join(root, "scripts"),
    ]) mkdirSync(directory, { recursive: true });
    const owner = join(root, "src", "core", "time-controller-v2.ts");
    writeFileSync(owner, "export const owner = 1;\n");
    writeFileSync(join(root, "src", "core", "__tests__", "ignored.test.ts"), "one\n");
    writeFileSync(join(root, "src", "data", "catalog.ts"), "export const data = 1;\n");
    writeFileSync(join(root, "src", "lab", "runner.ts"), "export const lab = 1;\n");
    writeFileSync(join(root, "scripts", "balance-lab-cli.ts"), "export {};\n");
    writeFileSync(join(root, "scripts", "balance-lab-code-version.ts"), "export {};\n");
    writeFileSync(join(root, "scripts", "typescript-loader.mjs"), "export {};\n");
    writeFileSync(join(root, "scripts", "run-balance-lab.mjs"), "export {};\n");

    const before = balanceLabSourceHashV1(root);
    writeFileSync(owner, "export const owner = 2;\n");
    expect(balanceLabSourceHashV1(root)).not.toBe(before);
  });

  it("runs a real production cohort and atomically emits every deterministic artifact", () => {
    const root = temporaryDirectory();
    const output = join(root, "artifacts");
    const configPath = join(root, "config.json");
    writeFileSync(configPath, JSON.stringify({
      ...rawConfig,
      acceptance: [],
      tiers: {
        ...rawConfig.tiers,
        quick: {
          ...rawConfig.tiers.quick,
          matchedSeedCount: 1,
          horizonMonths: 1,
          runtimeBudgetMs: 30_000,
        },
      },
    }));

    const stdout = execFileSync(
      process.execPath,
      [
        "scripts/run-balance-lab.mjs",
        "--size", "quick",
        "--config", configPath,
        "--output", output,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );

    const expected = [
      "quick.report.json",
      "quick.runs.csv",
      "quick.matched.csv",
      "quick.report.md",
      "quick.summary.json",
    ];
    for (const file of expected) {
      expect(readFileSync(join(output, file), "utf8").length).toBeGreaterThan(0);
    }
    const report = decodeBalanceLabReportV1(
      JSON.parse(readFileSync(join(output, "quick.report.json"), "utf8")),
    );
    expect(report.result.runs).toHaveLength(6);
    expect(report.result.runs.every(({ processedMonths }) => processedMonths === 1)).toBe(true);
    expect(report.codeVersion.commit.length).toBeGreaterThan(0);
    expect(report.codeVersion.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.configurationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stdout).toContain(report.result.deterministicResultFingerprint);
  }, 65_000);

  it("runs the guided beginner cohort through the CLI", () => {
    const root = temporaryDirectory();
    const output = join(root, "artifacts");
    const configPath = join(root, "config.json");
    writeFileSync(configPath, JSON.stringify({
      ...rawConfig,
      acceptance: [],
      tiers: {
        ...rawConfig.tiers,
        beginner: {
          ...rawConfig.tiers.quick,
          personaIds: ["healthy-v1"],
          matchedSeedCount: 1,
          horizonMonths: 1,
          difficulty: "guided",
          runtimeBudgetMs: 30_000,
        },
      },
    }));

    const stdout = execFileSync(
      process.execPath,
      [
        "scripts/run-balance-lab.mjs",
        "--size", "beginner",
        "--config", configPath,
        "--output", output,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );

    const report = decodeBalanceLabReportV1(
      JSON.parse(readFileSync(join(output, "beginner.report.json"), "utf8")),
    );
    expect(report.result.spec.difficulty).toBe("guided");
    expect(report.result.runs).toHaveLength(6);
    expect(stdout).toContain(report.result.deterministicResultFingerprint);
  }, 65_000);

  it("exits 2 on invalid event config and leaves no partial artifact directory", () => {
    const root = temporaryDirectory();
    const output = join(root, "artifacts");
    const invalidCatalog = join(root, "invalid-events.json");
    writeFileSync(invalidCatalog, JSON.stringify([]));

    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-balance-lab.mjs",
        "--size", "medium",
        "--event-catalog", invalidCatalog,
        "--output", output,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("INVALID_EVENT_CONFIG");
    expect(() => readFileSync(join(output, "medium.report.json"), "utf8")).toThrow();
  }, 35_000);

  it("writes diagnostic artifacts but exits 2 when a configured acceptance rule fails", () => {
    const root = temporaryDirectory();
    const output = join(root, "artifacts");
    const configPath = join(root, "config.json");
    writeFileSync(configPath, JSON.stringify({
      ...rawConfig,
      tiers: {
        ...rawConfig.tiers,
        quick: {
          ...rawConfig.tiers.quick,
          matchedSeedCount: 1,
          horizonMonths: 1,
        },
      },
      acceptance: [{
        id: "must-bankrupt",
        metric: "bankruptcy_rate_ppm",
        comparator: "equals",
        threshold: 1_000_000,
        minimumSamples: 1,
      }],
    }));

    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-balance-lab.mjs",
        "--size", "quick",
        "--config", configPath,
        "--output", output,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ACCEPTANCE_FAILED");
    const report = decodeBalanceLabReportV1(
      JSON.parse(readFileSync(join(output, "quick.report.json"), "utf8")),
    );
    expect(report.acceptance).toEqual([
      expect.objectContaining({ id: "must-bankrupt", status: "fail" }),
    ]);
  }, 65_000);

  it("runs the beginner cohort through bounded deterministic workers", () => {
    const root = temporaryDirectory();
    const configPath = join(root, "config.json");
    const output = join(root, "beginner");
    writeFileSync(configPath, JSON.stringify({
      ...rawConfig,
      acceptance: [],
      tiers: {
        ...rawConfig.tiers,
        beginner: {
          ...rawConfig.tiers.beginner,
          matchedSeedCount: 2,
        },
      },
    }));

    execFileSync(process.execPath, [
      "scripts/run-balance-lab.mjs", "--size", "beginner", "--config", configPath,
      "--output", output,
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });

    const report = decodeBalanceLabReportV1(JSON.parse(
      readFileSync(join(output, "beginner.report.json"), "utf8"),
    ));
    expect(report.summary.runCount).toBe(36);
    expect(report.result.deterministicResultFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report.runtime.elapsedMs).toBeLessThan(rawConfig.tiers.beginner.runtimeBudgetMs);
    expect(report.limitations).toContain(
      "Exact repeatability was re-executed for 2 matched seeds; the full cohort was executed once.",
    );
  }, 125_000);

  it("binds a validated CLI event catalog into configuration and result fingerprints", () => {
    const root = temporaryDirectory();
    const configPath = join(root, "config.json");
    const customCatalogPath = join(root, "events.json");
    writeFileSync(configPath, JSON.stringify({
      ...rawConfig,
      acceptance: [],
      tiers: {
        ...rawConfig.tiers,
        quick: {
          ...rawConfig.tiers.quick,
          matchedSeedCount: 1,
          horizonMonths: 1,
        },
      },
    }));
    writeFileSync(customCatalogPath, JSON.stringify(
      PERSONAL_EVENT_TEMPLATES_V2.map((template, index) =>
        index === 0
          ? {
              ...template,
              severityTier: "large",
              fallbackNarrative: {
                ...template.fallbackNarrative,
                headline: `${template.fallbackNarrative.headline} (custom)`,
              },
            }
          : template,
      ),
    ));
    const defaultOutput = join(root, "default");
    const customOutput = join(root, "custom");
    execFileSync(process.execPath, [
      "scripts/run-balance-lab.mjs", "--size", "quick", "--config", configPath,
      "--output", defaultOutput,
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
    execFileSync(process.execPath, [
      "scripts/run-balance-lab.mjs", "--size", "quick", "--config", configPath,
      "--event-catalog", customCatalogPath, "--output", customOutput,
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });

    const defaultReport = decodeBalanceLabReportV1(JSON.parse(
      readFileSync(join(defaultOutput, "quick.report.json"), "utf8"),
    ));
    const customReport = decodeBalanceLabReportV1(JSON.parse(
      readFileSync(join(customOutput, "quick.report.json"), "utf8"),
    ));
    expect((defaultReport as unknown as { eventCatalogFingerprint: string })
      .eventCatalogFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((customReport as unknown as { eventCatalogFingerprint: string })
      .eventCatalogFingerprint).not.toBe(
        (defaultReport as unknown as { eventCatalogFingerprint: string })
          .eventCatalogFingerprint,
      );
    expect(customReport.configurationHash).not.toBe(defaultReport.configurationHash);
    expect(customReport.result.configurationHash).not.toBe(
      defaultReport.result.configurationHash,
    );
    expect(customReport.result.deterministicResultFingerprint).not.toBe(
      defaultReport.result.deterministicResultFingerprint,
    );
    expect(defaultReport.limitations).not.toContain(
      "The supplied event catalog contains no large or catastrophe templates.",
    );
    expect(customReport.limitations).not.toContain(
      "The supplied event catalog contains no large or catastrophe templates.",
    );
  }, 65_000);
});
