import { sql } from "drizzle-orm";
import { z } from "zod";

import { auditCipherFromEnvironment } from "../ai/audit-crypto";
import { auditAdminAuthorizerFromEnvironment } from "../ai/audit-repository";
import { aiTransportFromEnvironment } from "../ai/runtime";
import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { getDatabaseConnection } from "../db/runtime";
import {
  createTaxCalculatorFromEnvironment,
  usesDeterministicTaxCalculator,
} from "../tax/runtime";

const TAX_HEALTH_TIMEOUT_MS = 45_000;
const MAX_HEALTH_RESPONSE_BYTES = 4_096;

export const readinessResponseSchema = z
  .object({
    status: z.enum(["ready", "unavailable"]),
    service: z.literal("life-finance"),
    apiVersion: z.literal("v1"),
    engineVersion: z.literal("4.0.0"),
    checks: z
      .object({
        configuration: z.enum(["ok", "failed"]),
        database: z.enum(["ok", "failed"]),
        taxPolicy: z.enum(["ok", "failed"]),
      })
      .strict(),
  })
  .strict();

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export type ReadinessProbes = Readonly<{
  configuration: () => void | Promise<void>;
  database: () => void | Promise<void>;
  taxPolicy: () => void | Promise<void>;
}>;

async function probe(probeFunction: () => void | Promise<void>): Promise<"ok" | "failed"> {
  try {
    await probeFunction();
    return "ok";
  } catch {
    return "failed";
  }
}

export async function checkReadiness(probes: ReadinessProbes): Promise<ReadinessResponse> {
  const [configuration, database, taxPolicy] = await Promise.all([
    probe(probes.configuration),
    probe(probes.database),
    probe(probes.taxPolicy),
  ]);
  const checks = { configuration, database, taxPolicy } as const;
  return readinessResponseSchema.parse({
    status: Object.values(checks).every((value) => value === "ok")
      ? "ready"
      : "unavailable",
    service: "life-finance",
    apiVersion: "v1",
    engineVersion: "4.0.0",
    checks,
  });
}

function assertDatabaseConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const value = environment.DATABASE_URL;
  if (!value) throw new Error("database URL is unavailable");
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("database URL must use PostgreSQL");
  }
}

export function assertProductionConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  assertDatabaseConfiguration(environment);
  runSecretCodecFromEnvironment(environment);
  createTaxCalculatorFromEnvironment(environment);
  auditCipherFromEnvironment(environment);
  auditAdminAuthorizerFromEnvironment(environment);
  aiTransportFromEnvironment(environment);
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function probePinnedTaxService(
  baseUrl: string,
  fetchFunction: FetchLike = globalThis.fetch,
): Promise<void> {
  const normalized = new URL(baseUrl);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  const endpoint = new URL("healthz", normalized);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAX_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetchFunction(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length"));
    if (!response.ok || (Number.isFinite(declaredLength) && declaredLength > MAX_HEALTH_RESPONSE_BYTES)) {
      throw new Error("tax readiness failed");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_HEALTH_RESPONSE_BYTES) {
      throw new Error("tax readiness failed");
    }
    const payload: unknown = JSON.parse(body);
    z.object({
      status: z.literal("ok"),
      policyYear: z.literal(2026),
      bundleVersion: z.literal("4.21.0"),
      rulesVersion: z.literal("1.764.6"),
    })
      .strict()
      .parse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export function checkRuntimeReadiness(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ReadinessResponse> {
  return checkReadiness({
    configuration: () => assertProductionConfiguration(environment),
    database: async () => {
      await getDatabaseConnection().db.execute(sql`select 1`);
    },
    taxPolicy: async () => {
      if (usesDeterministicTaxCalculator(environment)) return;
      const baseUrl = environment.TAX_SERVICE_URL;
      if (!baseUrl) throw new Error("tax service URL is unavailable");
      await probePinnedTaxService(baseUrl);
    },
  });
}
