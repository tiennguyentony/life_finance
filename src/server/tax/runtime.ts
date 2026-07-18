import { OfflineDemoTaxCalculator } from "../demo/offline-tax-calculator";
import {
  createTaxClientFromEnvironment,
  TaxServiceError,
  type TaxCalculator,
} from "./client";

export const DETERMINISTIC_TAX_MODE = "deterministic" as const;

export function usesDeterministicTaxCalculator(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const mode = environment.TAX_CALCULATOR_MODE;
  if (mode === undefined || mode === "policyengine") return false;
  if (mode === DETERMINISTIC_TAX_MODE) return true;
  throw new TaxServiceError(
    "INVALID_CONFIGURATION",
    "TAX_CALCULATOR_MODE must be policyengine or deterministic",
    { retryable: false },
  );
}

export function createTaxCalculatorFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TaxCalculator {
  return usesDeterministicTaxCalculator(environment)
    ? new OfflineDemoTaxCalculator()
    : createTaxClientFromEnvironment(environment);
}
