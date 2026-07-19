import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type VercelConfig = Readonly<{
  buildCommand?: string;
  services?: Readonly<{
    web?: Readonly<{
      buildCommand?: string;
      bindings?: readonly Readonly<{
        type?: string;
        service?: string;
        format?: string;
        env?: string;
      }>[];
    }>;
    tax?: Readonly<{
      root?: string;
      framework?: string;
      entrypoint?: string;
      functions?: Readonly<Record<string, Readonly<{ maxDuration?: number }>>>;
      rewrites?: readonly Readonly<{ source?: string; destination?: string }>[];
    }>;
  }>;
}>;

describe("production database deployment", () => {
  it("applies pending migrations before building the frontend service", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.buildCommand).toBeUndefined();
    expect(config.services?.web?.buildCommand).toBe(
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

  it("binds the frontend to the private tax service", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.services?.web?.bindings).toContainEqual({
      type: "service",
      service: "tax",
      format: "url",
      env: "TAX_SERVICE_URL",
    });
    expect(config.services?.tax).toMatchObject({
      root: "services/tax/",
      framework: "fastapi",
      entrypoint: "tax_service.app:app",
      functions: {
        "tax_service/app.py": { maxDuration: 300 },
      },
    });
    expect(config.services?.tax?.rewrites).toBeUndefined();
  });
});
