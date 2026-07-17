/**
 * Fake numbers for the board HUD. This is the seam where real game state
 * plugs in later; nothing outside the board feature reads these.
 */

export const BOARD_PLAYER = {
  name: "Sprout",
  level: 5,
  xpPercent: 62,
  avatarSrc: "/assets/characters/sprout/reference/sprout-main.png",
  avatarAlt: "Sprout, a round green sprout chick wearing a gold dollar-sign chain",
} as const;

export type BoardStatTone = "lime" | "blue" | "coral";

export type BoardStat = Readonly<{
  id: string;
  label: string;
  amount: number;
  tone: BoardStatTone;
}>;

export const BOARD_STATS: readonly BoardStat[] = [
  { id: "cash", label: "Cash", amount: 12_450, tone: "lime" },
  { id: "net-worth", label: "Net Worth", amount: 68_230, tone: "blue" },
  { id: "debt", label: "Debt", amount: -8_120, tone: "coral" },
];

export type BoardSidePanel = Readonly<{ id: string; label: string; badge: number }>;

export const BOARD_SIDE_PANELS: readonly BoardSidePanel[] = [
  { id: "goals", label: "Goals", badge: 2 },
  { id: "events", label: "Events", badge: 1 },
  { id: "journal", label: "Journal", badge: 3 },
];

export const BOARD_CALENDAR = { day: 23, week: 4 } as const;

export const BOARD_GOAL = {
  label: "Pay off $2,000 of debt",
  current: 1_200,
  target: 2_000,
} as const;

export const BOARD_TROPHIES = 3;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Negative amounts render with an explicit leading minus: "-$8,120". */
export function formatBoardMoney(amount: number): string {
  return money.format(amount);
}
