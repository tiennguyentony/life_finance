import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type VercelConfig = Readonly<{
  buildCommand?: string;
  experimentalServices?: unknown;
  services?: Readonly<{
    web?: Readonly<{
      root?: string;
      framework?: string;
      buildCommand?: string;
      bindings?: readonly Readonly<{
        type?: string;
        service?: string;
        format?: string;
        env?: string;
      }>[];
    }>;
    tax_service?: Readonly<{
      root?: string;
      entrypoint?: string;
      framework?: string;
      functions?: Readonly<
        Record<string, Readonly<{ maxDuration?: number }>>
      >;
    }>;
  }>;
  rewrites?: readonly Readonly<{
    source?: string;
    destination?: Readonly<{ service?: string }>;
  }>[];
}>;

describe("production database deployment", () => {
  it("applies pending migrations before building the frontend service", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.buildCommand).toBeUndefined();
    expect(config.experimentalServices).toBeUndefined();
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

  it("binds the bearer-protected tax service privately to the frontend", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"),
    ) as VercelConfig;

    expect(config.services?.web).toMatchObject({
      root: ".",
      framework: "nextjs",
      bindings: [
        {
          type: "service",
          service: "tax_service",
          format: "url",
          env: "TAX_SERVICE_URL",
        },
      ],
    });
    expect(config.services?.tax_service).toMatchObject({
      root: "services/tax",
      entrypoint: "api/index.py",
      framework: "fastapi",
      functions: {
        "api/index.py": {
          maxDuration: 300,
        },
      },
    });
    expect(config.rewrites).toEqual([
      {
        source: "/(.*)",
        destination: { service: "web" },
      },
    ]);
  });
});
