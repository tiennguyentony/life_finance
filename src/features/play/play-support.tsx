import { getEducationConcept } from "@/data/education-content";

import { formatMoney } from "./play-model";
import { useAnimatedNumber } from "./use-animated-number";

export const SESSION_KEY = "life-finance.developer-run.v1";
export const RECAP_SESSION_KEY = "life-finance.developer-recaps.v1";

export const ACTION_GUIDANCE: Record<
  string,
  { summary: string; conceptId: string }
> = {
  invest_taxable: {
    summary: "Move liquid cash into a diversified but volatile market asset.",
    conceptId: "broad_index",
  },
  invest_sector: {
    summary: "Concentrate in one sector for higher upside and higher correlated risk.",
    conceptId: "sector_investing",
  },
  invest_speculative: {
    summary: "Take a high-volatility position that can amplify gains or losses.",
    conceptId: "speculation",
  },
  liquidate_taxable: {
    summary: "Restore liquidity by selling investments and paying a modeled 1% cost.",
    conceptId: "liquidity",
  },
  contribute_ira: {
    summary: "Move cash into an individually owned retirement account.",
    conceptId: "ira",
  },
  contribute_hsa: {
    summary: "Move cash into the selected plan's tax-advantaged medical account.",
    conceptId: "hsa",
  },
  pay_term_debt: {
    summary: "Reduce principal and future interest, at the cost of cash today.",
    conceptId: "dti",
  },
  pay_revolving_credit: {
    summary: "Lower credit utilization and financial exposure.",
    conceptId: "exposure",
  },
  draw_revolving_credit: {
    summary: "Add cash now by increasing high-risk revolving debt.",
    conceptId: "liquidity",
  },
  withdraw_401k: {
    summary: "Access retirement value early with 20% withholding and a 10% penalty.",
    conceptId: "401k",
  },
  withdraw_ira: {
    summary: "Access IRA value early with 20% withholding and a 10% penalty.",
    conceptId: "ira",
  },
  purchase_home: {
    summary: "Use cash for down payment and 3% closing costs, then add mortgage debt.",
    conceptId: "liquidity",
  },
  sell_home: {
    summary: "Liquidate the home, repay its mortgage, and pay a modeled 6% sale cost.",
    conceptId: "liquidity",
  },
  refinance_home: {
    summary: "Replace the mortgage rate and term while paying a modeled 2% cost.",
    conceptId: "dti",
  },
  reduce_lifestyle: {
    summary: "Lower recurring annual burn and bring the FI finish line closer.",
    conceptId: "lifestyle_creep",
  },
  increase_lifestyle: {
    summary: "Spend more each year now while moving the FI finish line farther away.",
    conceptId: "lifestyle_creep",
  },
  start_upskill: {
    summary: "Pay an education cost now for a delayed, cataloged salary increase.",
    conceptId: "compounding",
  },
};

export function commandId(kind: string): string {
  return `ui.${kind}.${crypto.randomUUID()}`;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as {
      error?: { code?: string; message?: string };
    } | null;
    throw new Error(
      `${apiError?.error?.code ?? `HTTP_${response.status}`}: ${apiError?.error?.message ?? "Request failed"}`,
    );
  }
  return body as T;
}

export function authHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export function formatRate(ppm: number | null): string {
  return ppm === null ? "Unknown" : `${(ppm / 10_000).toFixed(1)}%`;
}

export function formatRunway(ppm: number): string {
  return `${(ppm / 1_000_000).toFixed(1)} months`;
}

export function formatOutflow(cents: number): string {
  if (cents === 0) return formatMoney(0);
  return cents > 0 ? `-${formatMoney(cents)}` : `+${formatMoney(-cents)}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Humanizes engine months ("2027-03") for players ("Mar 2027"). */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const name = monthNumber ? MONTH_NAMES[monthNumber - 1] : undefined;
  if (!year || !name) return month;
  return `${name} ${year}`;
}

export type MoneyTone = "positive" | "negative" | "neutral";

export function signedMoney(cents: number): Readonly<{
  tone: MoneyTone;
  label: string;
}> {
  if (cents > 0) return { tone: "positive", label: `+${formatMoney(cents)}` };
  if (cents < 0) return { tone: "negative", label: `-${formatMoney(-cents)}` };
  return { tone: "neutral", label: formatMoney(0) };
}

/** Roving-focus keyboard order for the ARIA tabs pattern. */
export function cycleTab<T extends string>(
  tabs: readonly T[],
  current: T,
  key: string,
): T {
  const index = tabs.indexOf(current);
  if (index === -1) return current;
  if (key === "Home") return tabs[0]!;
  if (key === "End") return tabs.at(-1)!;
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return current;
  return tabs[(index + step + tabs.length) % tabs.length]!;
}

export function titleFromId(id: string): string {
  return id.split(".").at(-1)!.replaceAll("_", " ");
}

/** Live balances count toward their new value; printed records never do. */
export function AnimatedMoney({ cents }: Readonly<{ cents: number }>) {
  const animated = useAnimatedNumber(cents);
  return <>{formatMoney(animated)}</>;
}

export function ConceptButton({
  conceptId,
  onSelect,
}: Readonly<{ conceptId: string; onSelect: (id: string) => void }>) {
  const concept = getEducationConcept(conceptId);
  if (!concept) return null;
  return (
    <button
      aria-label={`Learn about ${concept.title}`}
      className="concept-button"
      onClick={() => onSelect(conceptId)}
      title={`Learn about ${concept.title}`}
      type="button"
    >
      ?
    </button>
  );
}
