import { compareMonths, simulationMonth, type SimulationMonth } from "./domain/month";

export const TEACHING_FACTS_V2_VERSION = "teaching-facts-v2" as const;

export type TeachingFactValueV2 =
  | Readonly<{ kind: "money_cents" | "rate_ppm" | "months_ppm" | "integer" | "years"; value: number }>
  | Readonly<{ kind: "enum"; value: string }>
  | Readonly<{ kind: "boolean"; value: boolean }>;

export type TeachingFactSourceV2 = Readonly<{
  kind:
    | "game_state"
    | "goal_result"
    | "risk_snapshot"
    | "exposure_snapshot"
    | "checkpoint"
    | "monthly_record"
    | "outcome_result"
    | "causal_record"
    | "counterfactual";
  sourceId: string;
  supportingSourceIds: readonly string[];
  field: string;
  revision: number;
  month: SimulationMonth;
}>;

export type TeachingFactV2 = Readonly<{
  factId: string;
  labelId: string;
  value: TeachingFactValueV2;
  source: TeachingFactSourceV2;
}>;

export type TeachingFactPacketV2 = Readonly<{
  version: typeof TEACHING_FACTS_V2_VERSION;
  asOfRevision: number;
  asOfMonth: SimulationMonth;
  facts: readonly TeachingFactV2[];
}>;

export type TeachingFactPacketInputV2 = Readonly<{
  asOfRevision: number;
  asOfMonth: SimulationMonth;
  facts: readonly TeachingFactV2[];
}>;

export class TeachingFactsV2Error extends Error {
  constructor(readonly code: "INVALID_PACKET" | "INVALID_FACT" | "DUPLICATE_FACT") {
    super(code);
    this.name = "TeachingFactsV2Error";
  }
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;
const SOURCE_ID = /^[a-z][a-z0-9_-]*:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const FIELD_PATH = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)*$/;
const NUMERIC_KINDS = new Set([
  "money_cents",
  "rate_ppm",
  "months_ppm",
  "integer",
  "years",
]);
const SOURCE_PREFIXES: Readonly<Record<TeachingFactSourceV2["kind"], readonly string[]>> = Object.freeze({
  game_state: ["state:"],
  goal_result: ["goal:"],
  risk_snapshot: ["risk:"],
  exposure_snapshot: ["exposure:"],
  checkpoint: ["checkpoint:"],
  monthly_record: ["monthly:"],
  outcome_result: ["outcome:"],
  causal_record: ["causal:", "command:", "ledger:", "risk:", "outcome:", "state:"],
  counterfactual: ["counterfactual:"],
});

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateValue(value: TeachingFactValueV2): void {
  if (
    NUMERIC_KINDS.has(value.kind) &&
    (typeof value.value !== "number" || !Number.isSafeInteger(value.value))
  ) {
    throw new TeachingFactsV2Error("INVALID_FACT");
  }
  if (
    value.kind === "enum" &&
    (typeof value.value !== "string" || !IDENTIFIER.test(value.value))
  ) {
    throw new TeachingFactsV2Error("INVALID_FACT");
  }
  if (value.kind === "boolean" && typeof value.value !== "boolean") {
    throw new TeachingFactsV2Error("INVALID_FACT");
  }
  if (!NUMERIC_KINDS.has(value.kind) && value.kind !== "enum" && value.kind !== "boolean") {
    throw new TeachingFactsV2Error("INVALID_FACT");
  }
}

export function createTeachingFactPacketV2(
  input: TeachingFactPacketInputV2,
): TeachingFactPacketV2 {
  try {
    simulationMonth(input.asOfMonth);
  } catch {
    throw new TeachingFactsV2Error("INVALID_PACKET");
  }
  if (
    !Number.isSafeInteger(input.asOfRevision) ||
    input.asOfRevision < 0 ||
    input.facts.length > 64
  ) {
    throw new TeachingFactsV2Error("INVALID_PACKET");
  }
  const seen = new Set<string>();
  const facts = input.facts.map((fact) => {
    if (seen.has(fact.factId)) throw new TeachingFactsV2Error("DUPLICATE_FACT");
    seen.add(fact.factId);
    try {
      simulationMonth(fact.source.month);
    } catch {
      throw new TeachingFactsV2Error("INVALID_FACT");
    }
    if (
      !IDENTIFIER.test(fact.factId) ||
      !IDENTIFIER.test(fact.labelId) ||
      !SOURCE_ID.test(fact.source.sourceId) ||
      !Array.isArray(fact.source.supportingSourceIds) ||
      fact.source.supportingSourceIds.length === 0 ||
      fact.source.supportingSourceIds.length > 24 ||
      new Set(fact.source.supportingSourceIds).size !==
        fact.source.supportingSourceIds.length ||
      !fact.source.supportingSourceIds.includes(fact.source.sourceId) ||
      fact.source.supportingSourceIds.some((id) => !SOURCE_ID.test(id)) ||
      !SOURCE_PREFIXES[fact.source.kind]?.some((prefix) =>
        fact.source.sourceId.startsWith(prefix)
      ) ||
      !FIELD_PATH.test(fact.source.field) ||
      !Number.isSafeInteger(fact.source.revision) ||
      fact.source.revision < 0 ||
      fact.source.revision > input.asOfRevision ||
      compareMonths(fact.source.month, input.asOfMonth) > 0
    ) {
      throw new TeachingFactsV2Error("INVALID_FACT");
    }
    validateValue(fact.value);
    return {
      ...fact,
      value: { ...fact.value },
      source: {
        ...fact.source,
        supportingSourceIds: [...fact.source.supportingSourceIds],
      },
    } as TeachingFactV2;
  }).sort((left, right) => compareText(left.factId, right.factId));
  return deepFreeze({
    version: TEACHING_FACTS_V2_VERSION,
    asOfRevision: input.asOfRevision,
    asOfMonth: input.asOfMonth,
    facts,
  }) as TeachingFactPacketV2;
}
