export const OFFLINE_BALANCE_LAB_V1_VERSION = "offline-balance-lab-v1" as const;

export const BALANCE_LAB_BOT_IDS_V1 = [
  "disciplined-v1",
  "average-beginner-v1",
  "aggressive-investor-v1",
  "debt-heavy-lifestyle-v1",
  "cash-hoarder-v1",
  "random-control-v1",
] as const;

export type BalanceLabBotIdV1 = (typeof BALANCE_LAB_BOT_IDS_V1)[number];
export type BalanceLabDifficultyV1 = "guided" | "normal" | "hard";

export type BalanceLabRunSpecV1 = Readonly<{
  version: typeof OFFLINE_BALANCE_LAB_V1_VERSION;
  experimentId: string;
  personaIds: readonly string[];
  matchedSeeds: readonly number[];
  botIds: readonly BalanceLabBotIdV1[];
  horizonMonths: number;
  difficulty: BalanceLabDifficultyV1;
}>;

export class OfflineBalanceLabV1Error extends Error {
  constructor(
    readonly code:
      | "INVALID_RUN_SPEC"
      | "RUN_LIMIT_EXCEEDED"
      | "PRODUCTION_OWNER_VIOLATION"
      | "MATCHED_WORLD_DIVERGENCE"
      | "INVALID_EVENT_CONFIG"
      | "MISSING_TAX_EVIDENCE"
      | "TAX_SERVICE_UNAVAILABLE"
      | "INVALID_ACCEPTANCE_CONFIG"
      | "ACCEPTANCE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "OfflineBalanceLabV1Error";
  }
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MAX_PERSONAS = 10;
const MAX_MATCHED_SEEDS = 1_000;
const MAX_HORIZON_MONTHS = 480;
export const MAX_BALANCE_LAB_PRODUCTION_MONTHS_V1 = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function decodeUniqueIdentifiers(
  value: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximum ||
    !value.every((item) => typeof item === "string" && IDENTIFIER.test(item)) ||
    new Set(value).size !== value.length
  ) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      `${label} must contain unique canonical identifiers within its limit`,
    );
  }
  return Object.freeze([...value]);
}

export function decodeBalanceLabRunSpecV1(value: unknown): BalanceLabRunSpecV1 {
  const expectedKeys = [
    "version",
    "experimentId",
    "personaIds",
    "matchedSeeds",
    "botIds",
    "horizonMonths",
    "difficulty",
  ] as const;
  if (!isRecord(value) || !exactKeys(value, expectedKeys)) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      "balance lab run spec must contain only the documented fields",
    );
  }
  if (value.version !== OFFLINE_BALANCE_LAB_V1_VERSION) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      `version must be ${OFFLINE_BALANCE_LAB_V1_VERSION}`,
    );
  }
  if (typeof value.experimentId !== "string" || !IDENTIFIER.test(value.experimentId)) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      "experimentId must be a canonical identifier",
    );
  }
  const personaIds = decodeUniqueIdentifiers(value.personaIds, "personaIds", MAX_PERSONAS);
  const botIds = decodeUniqueIdentifiers(
    value.botIds,
    "botIds",
    BALANCE_LAB_BOT_IDS_V1.length,
  );
  if (!botIds.every((id) => (BALANCE_LAB_BOT_IDS_V1 as readonly string[]).includes(id))) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      "botIds contains an unsupported bot policy",
    );
  }
  if (
    !Array.isArray(value.matchedSeeds) ||
    value.matchedSeeds.length < 1 ||
    value.matchedSeeds.length > MAX_MATCHED_SEEDS ||
    !value.matchedSeeds.every(
      (seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffff_ffff,
    ) ||
    new Set(value.matchedSeeds).size !== value.matchedSeeds.length
  ) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      "matchedSeeds must contain unique uint32 values within its limit",
    );
  }
  const horizonMonths = value.horizonMonths;
  if (
    typeof horizonMonths !== "number" ||
    !Number.isSafeInteger(horizonMonths) ||
    horizonMonths < 1 ||
    horizonMonths > MAX_HORIZON_MONTHS
  ) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      `horizonMonths must be between 1 and ${MAX_HORIZON_MONTHS}`,
    );
  }
  if (!(value.difficulty === "guided" || value.difficulty === "normal" || value.difficulty === "hard")) {
    throw new OfflineBalanceLabV1Error(
      "INVALID_RUN_SPEC",
      "difficulty must be guided, normal, or hard",
    );
  }

  const productionMonths =
    personaIds.length * value.matchedSeeds.length * botIds.length * horizonMonths;
  if (productionMonths > MAX_BALANCE_LAB_PRODUCTION_MONTHS_V1) {
    throw new OfflineBalanceLabV1Error(
      "RUN_LIMIT_EXCEEDED",
      `planned production months exceed ${MAX_BALANCE_LAB_PRODUCTION_MONTHS_V1}`,
    );
  }

  return Object.freeze({
    version: OFFLINE_BALANCE_LAB_V1_VERSION,
    experimentId: value.experimentId,
    personaIds,
    matchedSeeds: Object.freeze([...(value.matchedSeeds as number[])]),
    botIds: Object.freeze(botIds as BalanceLabBotIdV1[]),
    horizonMonths,
    difficulty: value.difficulty,
  });
}
