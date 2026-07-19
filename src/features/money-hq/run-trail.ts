import type { RunViewWire } from "@/contracts/api/contracts";

/**
 * A per-run trail of the balances the server reported at each month.
 *
 * The engine records monthly cash flows but not per-month balances, and adding
 * them would mean changing a checksum-validated record schema. Every point here
 * is an authoritative figure the server returned for that month — it is a
 * recording of real responses, not a client-side simulation. It is scoped to
 * one browser, so the UI must describe it as the months played here rather than
 * implying a complete server-side history.
 */

const STORAGE_PREFIX = "life-finance.trail.";
/** Enough for a long run without letting one key grow without bound. */
const MAX_POINTS = 600;

export type TrailPoint = Readonly<{
  month: string;
  revision: number;
  netWorthCents: number;
  cashCents: number;
  debtCents: number;
  investableAssetsCents: number;
}>;

export function trailPointFromRun(run: RunViewWire): TrailPoint {
  return Object.freeze({
    month: run.currentMonth,
    revision: run.revision,
    netWorthCents: run.finances.netWorthCents,
    cashCents: run.finances.cashCents,
    debtCents:
      run.finances.nonCreditLiabilitiesCents + run.finances.creditUsedCents,
    investableAssetsCents: run.finances.investableAssetsCents,
  });
}

function isTrailPoint(value: unknown): value is TrailPoint {
  if (value === null || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.month === "string" &&
    typeof point.revision === "number" &&
    typeof point.netWorthCents === "number" &&
    typeof point.cashCents === "number" &&
    typeof point.debtCents === "number" &&
    typeof point.investableAssetsCents === "number"
  );
}

/**
 * Appends a point, keeping one entry per month and ordering by month. A month
 * seen again (a replay, or a corrected revision) replaces the earlier entry
 * rather than adding a duplicate.
 */
export function appendTrailPoint(
  trail: readonly TrailPoint[],
  point: TrailPoint,
): readonly TrailPoint[] {
  const withoutMonth = trail.filter((entry) => entry.month !== point.month);
  const next = [...withoutMonth, point].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  return Object.freeze(next.slice(Math.max(0, next.length - MAX_POINTS)));
}

/** The revision recorded `months` entries back, for a checkpoint window. */
export function revisionMonthsBack(
  trail: readonly TrailPoint[],
  months: number,
): number | null {
  if (trail.length === 0) return null;
  const index = Math.max(0, trail.length - 1 - months);
  return trail[index]?.revision ?? null;
}

function storageKey(runId: string): string {
  return `${STORAGE_PREFIX}${runId}`;
}

export function loadTrail(runId: string): readonly TrailPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(runId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Object.freeze(parsed.filter(isTrailPoint));
  } catch {
    // A corrupt or unavailable store must never break the screen.
    return [];
  }
}

export function saveTrail(runId: string, trail: readonly TrailPoint[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(runId), JSON.stringify(trail));
  } catch {
    // Private mode or a full quota is not worth interrupting play for.
  }
}
