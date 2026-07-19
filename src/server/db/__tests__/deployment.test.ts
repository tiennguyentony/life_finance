import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type VercelConfig = Readonly<{
  buildCommand?: string;
  services?: unknown;
  experimentalServices?: Readonly<{
    web?: Readonly<{
      entrypoint?: string;
      routePrefix?: string;
      framework?: string;
      buildCommand?: string;
    }>;
    tax_service?: Readonly<{
      entrypoint?: string;
      routePrefix?: string;
      framework?: string;
      maxDuration?: number;
    }>;
  }>;
}>;

describe("production database deployment", () => {
  it("applies pending migrations before building the frontend service", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.buildCommand).toBeUndefined();
    expect(config.services).toBeUndefined();
    expect(config.experimentalServices?.web?.buildCommand).toBe(
      "node scripts/vercel-build.mjs",
    );
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

  it("mounts the bearer-protected tax service with its generated environment name", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.experimentalServices?.web).toMatchObject({
      entrypoint: ".",
      routePrefix: "/",
      framework: "nextjs",
    });
    expect(config.experimentalServices?.tax_service).toMatchObject({
      entrypoint: "services/tax/api/index.py",
      routePrefix: "/svc/tax",
      framework: "fastapi",
      maxDuration: 300,
    });
  });
});
