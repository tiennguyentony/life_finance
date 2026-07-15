import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TAX_MAX_ATTEMPTS,
  DEFAULT_TAX_TIMEOUT_MS,
  PolicyEngineTaxClient,
  TaxServiceError,
  createTaxClientFromEnvironment,
} from "./client";
import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  taxCalculationRequestSchema,
  taxCalculationResultSchema,
  type TaxCalculationRequest,
} from "./contracts";

const TOKEN = "a".repeat(48);

function request(): TaxCalculationRequest {
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: "tax.client.1",
    economicYear: 2036,
    policyYear: 2026,
    cumulativePriceIndexPpm: 1_250_000,
    stateCode: "CA",
    filingStatus: "single",
    people: [
      {
        id: "person.primary",
        role: "primary",
        ageYears: 40,
        income: {
          w2Jobs: [{ id: "job.main", wagesCents: 12_500_000 }],
        },
      },
    ],
    deductions: {},
  });
}

function frozenResponse(): Response {
  const result = taxCalculationResultSchema.parse({
    schemaVersion: 1,
    traceId: "tax.client.1",
    economicYear: 2026,
    policyYear: 2026,
    stateCode: "CA",
    filingStatus: "single",
    annualGrossIncomeCents: 10_000_000,
    federalIncomeTaxCents: 1_500_000,
    stateIncomeTaxCents: 500_000,
    employeePayrollTaxCents: 765_000,
    selfEmploymentTaxCents: 0,
    totalTaxCents: 2_765_000,
    afterTaxIncomeCents: 7_235_000,
    effectiveTaxRatePpm: 276_500,
    componentsCents: { adjusted_gross_income: 10_000_000 },
    model: {
      provider: "PolicyEngine US",
      bundleVersion: POLICYENGINE_BUNDLE_VERSION,
      rulesVersion: POLICYENGINE_US_VERSION,
      projectedFromFrozenPolicy: false,
    },
    disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
  });
  return Response.json(result);
}

describe("PolicyEngineTaxClient", () => {
  it("deflates requests, authenticates server-to-server, and inflates results", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return frozenResponse();
      },
    );
    const client = new PolicyEngineTaxClient({
      baseUrl: "https://tax.example.test/base/",
      serviceToken: TOKEN,
      fetch,
    });

    const result = await client.calculate(request());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://tax.example.test/base/v1/calculate");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    const sent = JSON.parse(String(init?.body));
    expect(sent.economicYear).toBe(2026);
    expect(sent.cumulativePriceIndexPpm).toBe(1_000_000);
    expect(sent.people[0].income.w2Jobs[0].wagesCents).toBe(10_000_000);
    expect(result.economicYear).toBe(2036);
    expect(result.totalTaxCents).toBe(3_456_250);
    expect(result.model.projectedFromFrozenPolicy).toBe(true);
  });

  it("retries only transient failures with exponential delays", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(frozenResponse());
    const sleep = vi.fn(async () => undefined);
    const client = new PolicyEngineTaxClient({
      baseUrl: "https://tax.example.test",
      serviceToken: TOKEN,
      fetch,
      sleep,
      retryDelayMs: 10,
      maxAttempts: 3,
    });

    await expect(client.calculate(request())).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it("does not retry rejected households or invalid responses", async () => {
    const rejectedFetch = vi.fn(async () => new Response(null, { status: 422 }));
    const rejected = new PolicyEngineTaxClient({
      baseUrl: "https://tax.example.test",
      serviceToken: TOKEN,
      fetch: rejectedFetch,
    });
    await expect(rejected.calculate(request())).rejects.toMatchObject({
      code: "HOUSEHOLD_REJECTED",
      retryable: false,
    });
    expect(rejectedFetch).toHaveBeenCalledTimes(1);

    const invalid = new PolicyEngineTaxClient({
      baseUrl: "https://tax.example.test",
      serviceToken: TOKEN,
      fetch: async () => Response.json({ traceId: "tax.client.1" }),
    });
    await expect(invalid.calculate(request())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("fails closed when environment configuration is missing", () => {
    expect(DEFAULT_TAX_TIMEOUT_MS).toBe(120_000);
    expect(DEFAULT_TAX_MAX_ATTEMPTS).toBe(2);
    expect(() => createTaxClientFromEnvironment({})).toThrow(TaxServiceError);
    expect(
      () =>
        new PolicyEngineTaxClient({
          baseUrl: "https://tax.example.test",
          serviceToken: "short",
        }),
    ).toThrow(/at least 32/);
  });
});
