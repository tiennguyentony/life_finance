import { sha256Canonical } from "../core/canonical";
import {
  BALANCE_LAB_BOT_IDS_V1,
  decodeBalanceLabRunSpecV1,
  OfflineBalanceLabV1Error,
  type BalanceLabRunSpecV1,
} from "./balance-lab-v1-contracts";

export type BalanceLabBatchSizeV1 = "beginner" | "quick" | "medium" | "large";
export type BalanceLabComparatorV1 = "at_least" | "at_most" | "equals";

export type BalanceLabAcceptanceRuleV1 = Readonly<{
  id: string;
  metric:
    | "bankruptcy_rate_ppm"
    | "unavoidable_failure_rate_ppm"
    | "repeated_lesson_rate_ppm"
    | "forced_sale_frequency_ppm"
    | "prepared_vs_reckless_bankruptcy_delta_ppm"
    | "healthy_persona_unavoidable_failure_rate_ppm"
    | "impact_reduction_rate_ppm"
    | "major_event_pacing_ppm"
    | "matched_strategy_win_rate_ppm"
    | "maximum_strategy_objective_lead_share_ppm"
    | "beginner_chapter_completion_rate_ppm"
    | "beginner_bankruptcy_rate_ppm"
    | "average_beginner_bankruptcy_rate_ppm"
    | "reckless_bankruptcy_rate_ppm"
    | "stable_resilient_bankruptcy_rate_ppm"
    | "beginner_nonfatal_recovery_within_six_months_rate_ppm"
    | "beginner_meaningful_or_crisis_approved_rate_ppm"
    | "beginner_median_decision_event_count"
    | "runtime_ms";
  comparator: BalanceLabComparatorV1;
  threshold: number;
  minimumSamples: number;
  tierIds?: readonly BalanceLabBatchSizeV1[];
}>;

export type BalanceLabConfigV1 = Readonly<{
  version: "balance-lab-config-v1";
  seedNamespace: string;
  tiers: Readonly<Record<BalanceLabBatchSizeV1, Readonly<{
    personaIds: readonly string[];
    matchedSeedCount: number;
    horizonMonths: number;
    difficulty: "guided" | "normal" | "hard";
    runtimeBudgetMs: number;
  }>>>;
  acceptance: readonly BalanceLabAcceptanceRuleV1[];
  maximumReproductionBundles: number;
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const METRICS = new Set([
  "bankruptcy_rate_ppm",
  "unavoidable_failure_rate_ppm",
  "repeated_lesson_rate_ppm",
  "forced_sale_frequency_ppm",
  "prepared_vs_reckless_bankruptcy_delta_ppm",
  "healthy_persona_unavoidable_failure_rate_ppm",
  "impact_reduction_rate_ppm",
  "major_event_pacing_ppm",
  "matched_strategy_win_rate_ppm",
  "maximum_strategy_objective_lead_share_ppm",
  "beginner_chapter_completion_rate_ppm",
  "beginner_bankruptcy_rate_ppm",
  "average_beginner_bankruptcy_rate_ppm",
  "reckless_bankruptcy_rate_ppm",
  "stable_resilient_bankruptcy_rate_ppm",
  "beginner_nonfatal_recovery_within_six_months_rate_ppm",
  "beginner_meaningful_or_crisis_approved_rate_ppm",
  "beginner_median_decision_event_count",
  "runtime_ms",
]);
const BATCH_SIZES = ["beginner", "quick", "medium", "large"] as const;

function invalid(message: string): never {
  throw new OfflineBalanceLabV1Error("INVALID_RUN_SPEC", message);
}

export function decodeBalanceLabConfigV1(value: unknown): BalanceLabConfigV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid("balance lab config must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("|") !==
      "acceptance|maximumReproductionBundles|seedNamespace|tiers|version" ||
    record.version !== "balance-lab-config-v1" ||
    typeof record.seedNamespace !== "string" ||
    !IDENTIFIER.test(record.seedNamespace)
  ) {
    return invalid("balance lab config has unsupported fields or version");
  }
  const tiers = record.tiers as Record<string, unknown> | null;
  if (
    tiers === null ||
    typeof tiers !== "object" ||
    Object.keys(tiers).sort().join("|") !== "beginner|large|medium|quick"
  ) return invalid("config must define exact beginner, quick, medium, and large tiers");
  const decodedTiers = Object.fromEntries(
    (["beginner", "quick", "medium", "large"] as const).map((size) => {
      const tier = tiers[size] as Record<string, unknown> | null;
      if (
        tier === null ||
        typeof tier !== "object" ||
        Object.keys(tier).sort().join("|") !==
          "difficulty|horizonMonths|matchedSeedCount|personaIds|runtimeBudgetMs" ||
        !Array.isArray(tier.personaIds) ||
        tier.personaIds.length < 1 ||
        !tier.personaIds.every((id) => typeof id === "string" && IDENTIFIER.test(id)) ||
        !Number.isSafeInteger(tier.matchedSeedCount) ||
        (tier.matchedSeedCount as number) < 1 ||
        !Number.isSafeInteger(tier.horizonMonths) ||
        (tier.horizonMonths as number) < 1 ||
        (tier.horizonMonths as number) > 480 ||
        !["guided", "normal", "hard"].includes(tier.difficulty as string) ||
        !Number.isSafeInteger(tier.runtimeBudgetMs) ||
        (tier.runtimeBudgetMs as number) < 1
      ) return invalid(`invalid ${size} tier`);
      return [size, Object.freeze({
        personaIds: Object.freeze([...(tier.personaIds as string[])]),
        matchedSeedCount: tier.matchedSeedCount as number,
        horizonMonths: tier.horizonMonths as number,
        difficulty: tier.difficulty as "guided" | "normal" | "hard",
        runtimeBudgetMs: tier.runtimeBudgetMs as number,
      })];
    }),
  ) as BalanceLabConfigV1["tiers"];
  if (!Array.isArray(record.acceptance)) return invalid("acceptance must be an array");
  const ids = new Set<string>();
  const acceptance = record.acceptance.map((entry) => {
    const rule = entry as Record<string, unknown> | null;
    const ruleKeys = rule === null || typeof rule !== "object"
      ? ""
      : Object.keys(rule).sort().join("|");
    const tierIds = rule?.tierIds;
    if (
      rule === null ||
      typeof rule !== "object" ||
      ![
        "comparator|id|metric|minimumSamples|threshold",
        "comparator|id|metric|minimumSamples|threshold|tierIds",
      ].includes(ruleKeys) ||
      typeof rule.id !== "string" ||
      !IDENTIFIER.test(rule.id) ||
      ids.has(rule.id) ||
      !METRICS.has(rule.metric as string) ||
      !["at_least", "at_most", "equals"].includes(rule.comparator as string) ||
      !Number.isSafeInteger(rule.threshold) ||
      !Number.isSafeInteger(rule.minimumSamples) ||
      (rule.minimumSamples as number) < 1 ||
      (tierIds !== undefined && (
        !Array.isArray(tierIds) ||
        tierIds.length < 1 ||
        tierIds.length > BATCH_SIZES.length ||
        !tierIds.every((tierId) => BATCH_SIZES.includes(tierId as never)) ||
        new Set(tierIds).size !== tierIds.length
      ))
    ) return invalid("invalid acceptance rule");
    ids.add(rule.id);
    return Object.freeze({
      id: rule.id,
      metric: rule.metric,
      comparator: rule.comparator,
      threshold: rule.threshold,
      minimumSamples: rule.minimumSamples,
      ...(tierIds === undefined
        ? {}
        : { tierIds: Object.freeze([...(tierIds as BalanceLabBatchSizeV1[])]) }),
    }) as BalanceLabAcceptanceRuleV1;
  });
  if (
    !Number.isSafeInteger(record.maximumReproductionBundles) ||
    (record.maximumReproductionBundles as number) < 0 ||
    (record.maximumReproductionBundles as number) > 25
  ) return invalid("maximum reproduction bundles must be 0 through 25");
  return Object.freeze({
    version: "balance-lab-config-v1",
    seedNamespace: record.seedNamespace,
    tiers: Object.freeze(decodedTiers),
    acceptance: Object.freeze(acceptance),
    maximumReproductionBundles: record.maximumReproductionBundles as number,
  });
}

export function resolveBalanceLabBatchV1(
  config: BalanceLabConfigV1,
  size: BalanceLabBatchSizeV1,
  experimentId: string,
): Readonly<{
  spec: BalanceLabRunSpecV1;
  configurationHash: string;
  runtimeBudgetMs: number;
}> {
  const decoded = decodeBalanceLabConfigV1(config);
  const tier = decoded.tiers[size];
  const seedOffset = Number.parseInt(
    sha256Canonical({ namespace: decoded.seedNamespace, size }).slice(0, 8),
    16,
  );
  const spec = decodeBalanceLabRunSpecV1({
    version: "offline-balance-lab-v1",
    experimentId,
    personaIds: tier.personaIds,
    matchedSeeds: Array.from(
      { length: tier.matchedSeedCount },
      (_, index) => (seedOffset + index) >>> 0,
    ),
    botIds: BALANCE_LAB_BOT_IDS_V1,
    horizonMonths: tier.horizonMonths,
    difficulty: tier.difficulty,
  });
  return Object.freeze({
    spec,
    configurationHash: sha256Canonical(decoded),
    runtimeBudgetMs: tier.runtimeBudgetMs,
  });
}
