import { moneyCents, type MoneyCents } from "../core/domain/money";

export const UPSKILL_CATALOG_VERSION = "upskill-2026.1" as const;

export type UpskillProgram = Readonly<{
  id: "upskill.certificate" | "upskill.bootcamp" | "upskill.degree";
  version: typeof UPSKILL_CATALOG_VERSION;
  costCents: MoneyCents;
  durationMonths: number;
  annualSalaryIncreaseCents: MoneyCents;
}>;

export const UPSKILL_PROGRAMS: readonly UpskillProgram[] = Object.freeze([
  Object.freeze({
    id: "upskill.certificate",
    version: UPSKILL_CATALOG_VERSION,
    costCents: moneyCents(200_000),
    durationMonths: 3,
    annualSalaryIncreaseCents: moneyCents(300_000),
  }),
  Object.freeze({
    id: "upskill.bootcamp",
    version: UPSKILL_CATALOG_VERSION,
    costCents: moneyCents(800_000),
    durationMonths: 6,
    annualSalaryIncreaseCents: moneyCents(1_200_000),
  }),
  Object.freeze({
    id: "upskill.degree",
    version: UPSKILL_CATALOG_VERSION,
    costCents: moneyCents(3_000_000),
    durationMonths: 24,
    annualSalaryIncreaseCents: moneyCents(2_400_000),
  }),
]);

export function getUpskillProgram(id: string): UpskillProgram | null {
  return UPSKILL_PROGRAMS.find((program) => program.id === id) ?? null;
}
