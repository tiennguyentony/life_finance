import type { BalanceLabMetricSummaryV1 } from "./balance-lab-v1-metrics";
import type {
  BalanceLabAcceptanceRuleV1,
  BalanceLabBatchSizeV1,
  BalanceLabComparatorV1,
} from "./balance-lab-v1-config";

export type BalanceLabAcceptanceResultV1 = Readonly<{
  id: string;
  metric: BalanceLabAcceptanceRuleV1["metric"];
  status: "pass" | "fail" | "insufficient_sample";
  observed: number;
  comparator: BalanceLabComparatorV1;
  threshold: number;
  numerator: number;
  denominator: number;
  minimumSamples: number;
  tierIds?: readonly BalanceLabBatchSizeV1[];
  evidenceIds: readonly string[];
}>;

export function balanceLabGateDecisionV1(
  size: BalanceLabBatchSizeV1,
  results: readonly Pick<BalanceLabAcceptanceResultV1, "id" | "status">[],
): Readonly<{
  status: "pass" | "pass_with_insufficient_samples" | "fail";
  blockingRuleIds: readonly string[];
}> {
  const failed = results
    .filter(({ status }) => status === "fail")
    .map(({ id }) => id);
  const insufficient = results
    .filter(({ status }) => status === "insufficient_sample")
    .map(({ id }) => id);
  const blockingRuleIds = [
    ...failed,
    ...(size === "quick" || size === "beginner" ? [] : insufficient),
  ].toSorted();
  return Object.freeze({
    status: blockingRuleIds.length > 0
      ? "fail"
      : insufficient.length > 0
        ? "pass_with_insufficient_samples"
        : "pass",
    blockingRuleIds: Object.freeze(blockingRuleIds),
  });
}

function compare(
  observed: number,
  comparator: BalanceLabComparatorV1,
  threshold: number,
): boolean {
  if (comparator === "at_least") return observed >= threshold;
  if (comparator === "at_most") return observed <= threshold;
  return observed === threshold;
}

function observation(
  rule: BalanceLabAcceptanceRuleV1,
  summary: BalanceLabMetricSummaryV1,
  runtimeMs: number,
): Readonly<{ observed: number; numerator: number; denominator: number }> {
  if (rule.metric === "runtime_ms") {
    return { observed: runtimeMs, numerator: runtimeMs, denominator: 1 };
  }
  const evidence = summary.acceptanceEvidence[rule.metric];
  if (evidence === undefined) {
    throw new RangeError(`missing acceptance evidence for ${rule.metric}`);
  }
  return evidence;
}

export function evaluateBalanceLabAcceptanceV1(
  summary: BalanceLabMetricSummaryV1,
  rules: readonly BalanceLabAcceptanceRuleV1[],
  runtimeMs: number,
  size: BalanceLabBatchSizeV1,
): readonly BalanceLabAcceptanceResultV1[] {
  if (!Number.isSafeInteger(runtimeMs) || runtimeMs < 0) {
    throw new RangeError("balance lab runtime must be a non-negative safe integer");
  }
  return Object.freeze(
    rules.filter((rule) => rule.tierIds === undefined || rule.tierIds.includes(size)).map((rule) => {
      const observed = observation(rule, summary, runtimeMs);
      const status = observed.denominator < rule.minimumSamples
        ? "insufficient_sample"
        : compare(observed.observed, rule.comparator, rule.threshold)
          ? "pass"
          : "fail";
      return Object.freeze({
        id: rule.id,
        metric: rule.metric,
        comparator: rule.comparator,
        threshold: rule.threshold,
        minimumSamples: rule.minimumSamples,
        ...(rule.tierIds === undefined ? {} : { tierIds: rule.tierIds }),
        ...observed,
        status,
        evidenceIds: Object.freeze([
          `metric.${rule.metric}`,
          `acceptance.${rule.id}`,
        ]),
      });
    }),
  );
}
