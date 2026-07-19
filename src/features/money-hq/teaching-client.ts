import { z } from "zod";

/**
 * Narrow client for the teaching surfaces.
 *
 * These schemas cover only the fields Money HQ renders. They are deliberately
 * non-strict: the services return richer objects, and this client must not
 * break when the engine adds a field it does not display.
 */

const factValueSchema = z.union([
  z.object({
    kind: z.enum(["money_cents", "rate_ppm", "months_ppm", "integer", "years"]),
    value: z.number(),
  }),
  z.object({ kind: z.literal("enum"), value: z.string() }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
]);

const factSchema = z.object({
  factId: z.string(),
  labelId: z.string(),
  value: factValueSchema,
  source: z.object({
    kind: z.string(),
    sourceId: z.string(),
    field: z.string(),
    month: z.string(),
  }),
});

export type TeachingFact = z.infer<typeof factSchema>;

const checkpointResponseSchema = z.object({
  checkpoint: z.object({
    version: z.literal("teaching-checkpoint-v2"),
    evidenceVersion: z.string(),
    monthsAggregated: z.number(),
    facts: z.object({
      asOfMonth: z.string(),
      asOfRevision: z.number(),
      facts: z.array(factSchema),
    }),
    missingDimensions: z.array(
      z.object({ dimensionId: z.string(), reasonCode: z.string() }),
    ),
  }),
});

export type TeachingCheckpointResponse = z.infer<typeof checkpointResponseSchema>;

const decisionSchema = z.object({
  kind: z.enum(["strong_decision", "improvement"]),
  edgeId: z.string(),
  text: z.string(),
});

const debriefResponseSchema = z.object({
  debrief: z.object({
    version: z.literal("teaching-debrief-v2"),
    outcome: z.object({
      grade: z.string(),
      endReason: z.string(),
      reasonCode: z.string(),
      reachedMonth: z.string(),
    }),
    financialDiscipline: z.object({
      displayedNetWorthCents: z.number(),
    }),
    turningPoints: z.array(
      z.object({
        nodeId: z.string().optional(),
        kind: z.string().optional(),
        month: z.string().optional(),
        resultingRevision: z.number().optional(),
      }),
    ),
    turningPointStatus: z.enum([
      "verified_selection",
      "insufficient_verified_history",
    ]),
    causalExplanations: z.array(
      z.object({ edgeId: z.string(), role: z.string(), text: z.string() }),
    ),
    strongDecisions: z.array(decisionSchema),
    improvements: z.array(decisionSchema),
    counterfactuals: z.array(
      z.object({
        interventionPath: z.string(),
        comparedMonths: z.number(),
        difference: z.unknown(),
      }),
    ),
    counterfactualStatus: z.object({
      status: z.enum(["verified_results", "unavailable"]),
      reasonCode: z.string(),
    }),
    recommendations: z.array(z.object({ text: z.string() })),
  }),
});

export type TeachingDebriefResponse = z.infer<typeof debriefResponseSchema>;

export class TeachingUnavailableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TeachingUnavailableError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  let body: unknown = null;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new TeachingUnavailableError("INVALID_RESPONSE", "The response could not be read.");
  }

  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body
        ? (body.error as { code?: string; message?: string })
        : {};
    throw new TeachingUnavailableError(
      error.code ?? "REQUEST_FAILED",
      error.message ?? "The request could not be completed.",
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success || parsed.data === undefined) {
    throw new TeachingUnavailableError(
      "INVALID_RESPONSE",
      "The response did not match the expected shape.",
    );
  }
  return parsed.data;
}

export function fetchTeachingCheckpoint(
  runId: string,
  expectedRevision: number,
  fromRevision: number,
): Promise<TeachingCheckpointResponse> {
  const query = new URLSearchParams({
    expectedRevision: String(expectedRevision),
    fromRevision: String(fromRevision),
  });
  return request(
    `/api/runs/${encodeURIComponent(runId)}/teaching/checkpoint?${query}`,
    { method: "GET" },
    checkpointResponseSchema,
  );
}

export function fetchTeachingDebrief(
  runId: string,
  expectedRevision: number,
): Promise<TeachingDebriefResponse> {
  return request(
    `/api/runs/${encodeURIComponent(runId)}/teaching/debrief`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision }),
    },
    debriefResponseSchema,
  );
}

const FACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  gross_income: "Gross income",
  after_tax_income: "After-tax income",
  total_required_cash: "Total required cash",
  debt_payments: "Debt payments",
  debt_interest: "Debt interest",
  market_value_change: "Market movement",
  employee_contributions: "Your contributions",
  employer_match: "Employer match",
  net_worth_change: "Net-worth change",
  investable_assets_change: "Investable assets change",
  liabilities_change: "Liabilities change",
  closing_cash: "Closing cash",
  financial_independence_target: "FI target",
  financial_independence_progress: "FI progress",
  current_risk_score: "Current risk score",
  age: "Age",
});

export function factLabel(labelId: string): string {
  return (
    FACT_LABELS[labelId] ??
    labelId.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase())
  );
}
