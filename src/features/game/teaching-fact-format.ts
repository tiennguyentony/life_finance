import type { TeachingFactV2 } from "../../core/teaching-facts-v2";
import { formatTeachingCents } from "./teaching-format";

export function formatTeachingFactValueV2(fact: TeachingFactV2): string {
  const { value } = fact;
  if (value.kind === "money_cents") return formatTeachingCents(value.value);
  if (value.kind === "rate_ppm") return `${(value.value / 10_000).toFixed(1)}%`;
  if (value.kind === "months_ppm") {
    return `${(value.value / 1_000_000).toFixed(1)} months`;
  }
  if (value.kind === "years") return `${value.value} years`;
  if (value.kind === "boolean") return value.value ? "Yes" : "No";
  return String(value.value).replaceAll("_", " ");
}
