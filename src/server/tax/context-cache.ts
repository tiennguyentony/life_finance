import { sha256Canonical } from "../../core/canonical";

import {
  taxCalculationRequestSchema,
  type TaxCalculationRequest,
} from "./contracts";

export const TAX_CONTEXT_CACHE_VERSION = "annual-tax-context-v1";

/**
 * Fingerprint annual tax inputs that can change the calculated liability.
 * Trace IDs are command-specific. The price index is intentionally fixed by
 * the first calculation for a matching annual context rather than drifting
 * every simulated month.
 */
export function fingerprintAnnualTaxContext(
  input: TaxCalculationRequest,
): string {
  const request = taxCalculationRequestSchema.parse(input);
  const annualContext = Object.fromEntries(
    Object.entries(request).filter(
      ([key]) => key !== "traceId" && key !== "cumulativePriceIndexPpm",
    ),
  );
  return sha256Canonical({
    cacheVersion: TAX_CONTEXT_CACHE_VERSION,
    annualContext,
  });
}
