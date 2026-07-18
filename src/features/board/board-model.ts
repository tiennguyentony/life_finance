export type BoardStatTone = "lime" | "blue" | "coral";

export type BoardStat = Readonly<{
  id: string;
  label: string;
  amount: number;
  tone: BoardStatTone;
}>;

export type BoardEvent = Readonly<{
  eventId: string;
  headline: string;
  body: string;
  parameters: Readonly<Record<string, number>>;
  choices: readonly Readonly<{
    id: string;
    label: string;
    description: string;
  }>[];
}>;

export type BoardView = Readonly<{
  player: Readonly<{
    name: string;
    level: number;
    xpPercent: number;
    avatarSrc: string;
    avatarAlt: string;
  }>;
  stats: readonly BoardStat[];
  sidePanels: readonly Readonly<{
    id: "goals" | "events" | "journal";
    label: string;
    badge: number;
  }>[];
  calendar: Readonly<{ label: string; detail: string }>;
  goal: Readonly<{ label: string; current: number; target: number }>;
  trophies: number;
  pendingEvent: BoardEvent | null;
}>;

export type BoardRunSource = Readonly<{
  revision: number;
  currentMonth: string;
  status: "active" | "completed";
  finances: Readonly<{
    cashCents: number;
    netWorthCents: number;
    nonCreditLiabilitiesCents: number;
    creditUsedCents: number;
    investableAssetsCents: number;
  }>;
  goal: Readonly<{ targetCents: number; progressPpm: number }>;
  pendingInteraction:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "event";
        eventId: string;
        choiceIds: readonly string[];
        choices: readonly Readonly<{
          id: string;
          label: string;
          description: string;
        }>[];
        parameters: Readonly<Record<string, number>>;
        headline: string | null;
        body: string | null;
      }>;
}>;

function dollars(cents: number): number {
  return Math.round(cents / 100);
}

export function boardViewFromRun(run: BoardRunSource): BoardView {
  const [year = "", month = ""] = run.currentMonth.split("-");
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${run.currentMonth}-01T00:00:00Z`));
  const event = run.pendingInteraction.kind === "event"
    ? {
        eventId: run.pendingInteraction.eventId,
        headline: run.pendingInteraction.headline ?? "A decision is waiting",
        body:
          run.pendingInteraction.body ??
          "Choose how Sprout should respond before moving again.",
        parameters: Object.freeze({ ...run.pendingInteraction.parameters }),
        choices: Object.freeze(
          run.pendingInteraction.choices.map((choice) => Object.freeze({ ...choice })),
        ),
      }
    : null;
  const debtCents =
    run.finances.nonCreditLiabilitiesCents + run.finances.creditUsedCents;

  return {
    player: {
      name: "Sprout",
      level: Math.floor(run.revision / 12) + 1,
      xpPercent: Math.min(100, Math.max(0, Math.round(run.goal.progressPpm / 10_000))),
      avatarSrc: "/assets/characters/sprout/reference/sprout-main.png",
      avatarAlt:
        "Sprout, a round green sprout chick wearing a gold dollar-sign chain",
    },
    stats: [
      { id: "cash", label: "Cash", amount: dollars(run.finances.cashCents), tone: "lime" },
      {
        id: "net-worth",
        label: "Net Worth",
        amount: dollars(run.finances.netWorthCents),
        tone: "blue",
      },
      { id: "debt", label: "Debt", amount: -dollars(debtCents), tone: "coral" },
    ],
    sidePanels: [
      { id: "goals", label: "Goals", badge: run.status === "active" ? 1 : 0 },
      { id: "events", label: "Events", badge: event ? 1 : 0 },
      { id: "journal", label: "Journal", badge: Math.min(run.revision, 9) },
    ],
    calendar: { label: monthLabel || month, detail: year },
    goal: {
      label: "Reach financial independence",
      current: dollars(run.finances.investableAssetsCents),
      target: dollars(run.goal.targetCents),
    },
    trophies: run.status === "completed" ? 1 : 0,
    pendingEvent: event,
  };
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatBoardMoney(amount: number): string {
  return money.format(amount);
}

export type BoardMonthResult = Readonly<{
  fromMonth: string;
  toMonth: string;
  planLabel: string;
  cashChangeCents: number;
  netWorthChangeCents: number;
  debtChangeCents: number;
  goalProgressChangePpm: number;
  hasPendingEvent: boolean;
}>;

export function boardMonthResult(
  opening: BoardRunSource,
  ending: BoardRunSource,
  planLabel: string,
): BoardMonthResult {
  const openingDebt =
    opening.finances.nonCreditLiabilitiesCents + opening.finances.creditUsedCents;
  const endingDebt =
    ending.finances.nonCreditLiabilitiesCents + ending.finances.creditUsedCents;

  return Object.freeze({
    fromMonth: opening.currentMonth,
    toMonth: ending.currentMonth,
    planLabel,
    cashChangeCents: ending.finances.cashCents - opening.finances.cashCents,
    netWorthChangeCents: ending.finances.netWorthCents - opening.finances.netWorthCents,
    debtChangeCents: endingDebt - openingDebt,
    goalProgressChangePpm: ending.goal.progressPpm - opening.goal.progressPpm,
    hasPendingEvent: ending.pendingInteraction.kind === "event",
  });
}
