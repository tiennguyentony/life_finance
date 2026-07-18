import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type VercelConfig = Readonly<{
  buildCommand?: string;
  services?: unknown;
}>;

describe("production database deployment", () => {
  it("applies pending migrations before building the frontend service", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.buildCommand).toBe("node scripts/vercel-build.mjs");
    expect(config.services).toBeUndefined();
    const buildScript = readFileSync(
      new URL("../../../../scripts/vercel-build.mjs", import.meta.url),
      "utf8",
    );
    expect(buildScript).toContain('VERCEL_ENV === "production"');
    expect(buildScript).toContain("DATABASE_URL");
    expect(buildScript).toContain("migrate-production.mjs");

    const migrationScript = readFileSync(
      new URL("../../../../scripts/migrate-production.mjs", import.meta.url),
      "utf8",
    );
    expect(migrationScript).toContain("max: 1");
    expect(migrationScript).toContain("pg_advisory_lock");
    expect(migrationScript).toContain("pg_advisory_unlock");
  });
});
