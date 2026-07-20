import type { RunView } from "../../application/game/run-view";

export const EVENT_RECOMMENDATION_PRIORITIES = [
  "protect_cash",
  "minimize_total_cost",
  "avoid_ongoing_cost",
  "protect_wellbeing",
  "balanced",
] as const;

export type EventRecommendationPriority =
  (typeof EVENT_RECOMMENDATION_PRIORITIES)[number];

type PendingEvent = Extract<RunView["pendingInteraction"], { kind: "event" }>;
type EventChoice = PendingEvent["choices"][number];

export type EventRecommendationPolicy = Readonly<{
  choiceId: string;
  priority: EventRecommendationPriority;
  rationale: string;
  tradeoff: string;
  requiredEvidenceIds: readonly string[];
  evidence: readonly Readonly<{
    id: string;
    label: string;
    value: string;
  }>[];
}>;

type ChoiceMetrics = Readonly<{
  choice: EventChoice;
  firstMonthCashChangeCents: number;
  firstYearCashChangeCents: number;
  modeledCashChangeCents: number;
  ongoingExpenseCents: number;
  wellbeingScorePpm: number;
}>;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${USD.format(Math.abs(cents) / 100)}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function playerPriority(
  conversation: readonly Readonly<{ role: "player" | "sprout"; content: string }>[],
): EventRecommendationPriority | null {
  const playerMessages = conversation
    .filter(({ role }) => role === "player")
    .map(({ content }) => normalize(content))
    .reverse();

  for (const content of playerMessages) {
    const wrappedConcern = content.match(
      /\bmy priority or concern is\s+(.+?)(?:\bwhat would you recommend\b|$)/u,
    )?.[1]?.trim();
    const priorityTexts = wrappedConcern === undefined
      ? [content]
      : [wrappedConcern, content];
    const priorities: EventRecommendationPriority[] = [];
    for (const priorityText of priorityTexts) {
      if (
        /^(?:my\s+)?cash$/u.test(priorityText) ||
        /\b(?:liquidity|cash runway|emergency fund|savings|money available|preserve money)\b/u.test(priorityText) ||
        /\b(?:protects?|preserves?|keeps?|saves?)\b.{0,24}\bcash\b/u.test(priorityText)
      ) priorities.push("protect_cash");
      if (/\b(?:cheapest|lowest cost|least expensive|minimize cost|total cost|spend least)\b/u.test(priorityText)) {
        priorities.push("minimize_total_cost");
      }
      if (
        /\b(?:no debt|do not finance|don t finance)\b/u.test(priorityText) ||
        /\bavoid\b.{0,24}\b(?:debt|finance|financing|monthly payment|payment plan|recurring cost|ongoing cost)\b/u.test(priorityText)
      ) priorities.push("avoid_ongoing_cost");
      if (
        /\b(?:happiness|wellbeing|well being|burnout|free time|support them|help them)\b/u.test(priorityText) ||
        /\b(?:protects?|preserves?|prioritizes?)\b.{0,24}\b(?:family|relationship)\b/u.test(priorityText)
      ) priorities.push("protect_wellbeing");
    }
    if (new Set(priorities).size > 1) return "balanced";
    if (priorities[0] !== undefined) return priorities[0];
  }
  return null;
}

function metrics(choice: EventChoice): ChoiceMetrics {
  const financing = choice.preview.financing ?? [];
  const financedFirstMonthPayment = financing.reduce(
    (total, debt) => total + debt.monthlyPaymentCents,
    0,
  );
  const financedFirstYearPayments = financing.reduce(
    (total, debt) => total +
      debt.monthlyPaymentCents * Math.min(12, debt.termMonths),
    0,
  );
  const financedPrincipal = financing.reduce(
    (total, debt) => total + debt.principalCents,
    0,
  );
  const recurringMonthChange = choice.preview.recurringCashFlows.reduce(
    (total, flow) => total + (flow.direction === "income" ? flow.monthlyCents : -flow.monthlyCents),
    0,
  );
  const recurringFirstYearChange = choice.preview.recurringCashFlows.reduce(
    (total, flow) => {
      const firstYearCents = flow.monthlyCents * Math.min(12, flow.durationMonths);
      return total + (flow.direction === "income" ? firstYearCents : -firstYearCents);
    },
    0,
  );
  const recurringModeledChange = choice.preview.recurringCashFlows.reduce(
    (total, flow) => total +
      (flow.direction === "income" ? flow.totalCents : -flow.totalCents),
    0,
  );
  const ongoingExpenseCents = choice.preview.recurringCashFlows.reduce(
    (total, flow) => total + (flow.direction === "expense" ? flow.totalCents : 0),
    financedPrincipal,
  ) + Math.max(0, choice.preview.annualLivingCostChangeCents);

  return Object.freeze({
    choice,
    firstMonthCashChangeCents:
      choice.preview.immediateCashChangeCents +
      recurringMonthChange -
      financedFirstMonthPayment -
      Math.round(choice.preview.annualLivingCostChangeCents / 12),
    firstYearCashChangeCents:
      choice.preview.immediateCashChangeCents +
      recurringFirstYearChange -
      financedFirstYearPayments -
      choice.preview.annualLivingCostChangeCents,
    modeledCashChangeCents:
      choice.preview.immediateCashChangeCents +
      recurringModeledChange -
      financedPrincipal -
      choice.preview.annualLivingCostChangeCents,
    ongoingExpenseCents,
    wellbeingScorePpm:
      choice.preview.wellbeingChangesPpm.happiness -
      choice.preview.wellbeingChangesPpm.burnout,
  });
}

function descending(left: number, right: number): number {
  return right - left;
}

function ascending(left: number, right: number): number {
  return left - right;
}

function compareByPriority(
  priority: EventRecommendationPriority,
  left: ChoiceMetrics,
  right: ChoiceMetrics,
): number {
  const stable = () => left.choice.id.localeCompare(right.choice.id);
  if (priority === "protect_cash") {
    return descending(left.firstMonthCashChangeCents, right.firstMonthCashChangeCents) ||
      descending(left.firstYearCashChangeCents, right.firstYearCashChangeCents) ||
      descending(left.wellbeingScorePpm, right.wellbeingScorePpm) ||
      stable();
  }
  if (priority === "minimize_total_cost") {
    return descending(left.modeledCashChangeCents, right.modeledCashChangeCents) ||
      descending(left.firstMonthCashChangeCents, right.firstMonthCashChangeCents) ||
      descending(left.wellbeingScorePpm, right.wellbeingScorePpm) ||
      stable();
  }
  if (priority === "avoid_ongoing_cost") {
    return ascending(left.ongoingExpenseCents, right.ongoingExpenseCents) ||
      descending(left.firstYearCashChangeCents, right.firstYearCashChangeCents) ||
      descending(left.firstMonthCashChangeCents, right.firstMonthCashChangeCents) ||
      stable();
  }
  if (priority === "protect_wellbeing") {
    return descending(left.wellbeingScorePpm, right.wellbeingScorePpm) ||
      descending(left.firstYearCashChangeCents, right.firstYearCashChangeCents) ||
      descending(left.firstMonthCashChangeCents, right.firstMonthCashChangeCents) ||
      stable();
  }
  return 0;
}

function cashRunwayTenths(run: RunView): number {
  const required = run.finances.monthlyObligations.totalRequiredCashCents;
  return required <= 0
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor((run.finances.cashCents * 10) / required));
}

function balancedChoice(
  run: RunView,
  candidates: readonly ChoiceMetrics[],
): Readonly<{ choice: ChoiceMetrics; preservesReserve: boolean }> {
  const affordableOutflowCents = Math.max(
    0,
    run.finances.cashCents -
      run.finances.monthlyObligations.totalRequiredCashCents * 3,
  );
  const affordable = candidates.filter(
    ({ firstMonthCashChangeCents }) =>
      Math.max(0, -firstMonthCashChangeCents) <= affordableOutflowCents,
  );
  if (affordable.length === 0) {
    return Object.freeze({
      choice: [...candidates].sort((left, right) =>
        compareByPriority("protect_cash", left, right)
      )[0]!,
      preservesReserve: false,
    });
  }
  return Object.freeze({
    choice: [...affordable].sort((left, right) =>
    descending(left.wellbeingScorePpm, right.wellbeingScorePpm) ||
    descending(left.firstYearCashChangeCents, right.firstYearCashChangeCents) ||
    descending(left.firstMonthCashChangeCents, right.firstMonthCashChangeCents) ||
    left.choice.id.localeCompare(right.choice.id)
    )[0]!,
    preservesReserve: true,
  });
}

function priorityLabel(priority: EventRecommendationPriority): string {
  switch (priority) {
    case "protect_cash": return "Protect available cash";
    case "minimize_total_cost": return "Minimize the modeled financial cost";
    case "avoid_ongoing_cost": return "Avoid new ongoing costs";
    case "protect_wellbeing": return "Protect wellbeing and relationships";
    case "balanced": return "Balance financial resilience and wellbeing";
  }
}

function formatPercentDelta(ppm: number): string {
  const percent = Math.abs(ppm) / 10_000;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function wellbeingOutcome(choice: ChoiceMetrics): string {
  const { happiness, burnout } = choice.choice.preview.wellbeingChangesPpm;
  const happinessText = happiness === 0
    ? "happiness does not change"
    : `happiness ${happiness > 0 ? "improves" : "declines"} by ${formatPercentDelta(happiness)}`;
  const burnoutText = burnout === 0
    ? "burnout does not change"
    : `burnout ${burnout > 0 ? "increases" : "decreases"} by ${formatPercentDelta(burnout)}`;
  return `${happinessText}; ${burnoutText}`;
}

function outcomeFor(
  priority: EventRecommendationPriority,
  choice: ChoiceMetrics,
  preservesReserve: boolean,
): string {
  if (priority === "protect_cash") {
    return `It has the strongest first-month cash effect among the available choices (${formatMoney(choice.firstMonthCashChangeCents)}), with ${formatMoney(choice.modeledCashChangeCents)} over the modeled horizon.`;
  }
  if (priority === "minimize_total_cost") {
    return `It has the strongest modeled-horizon cash effect among the available choices (${formatMoney(choice.modeledCashChangeCents)}), with ${formatMoney(choice.firstMonthCashChangeCents)} in the first month.`;
  }
  if (priority === "avoid_ongoing_cost") {
    return `It adds ${formatMoney(-choice.ongoingExpenseCents).replace("−", "")} of modeled ongoing expense, the lowest available result; its modeled-horizon cash effect is ${formatMoney(choice.modeledCashChangeCents)}.`;
  }
  if (priority === "protect_wellbeing") {
    return `It has the strongest modeled wellbeing result among the available choices: ${wellbeingOutcome(choice)}.`;
  }
  if (!preservesReserve) {
    return `No available choice preserves the three-month cash reserve, so this choice has the strongest first-month cash effect (${formatMoney(choice.firstMonthCashChangeCents)}).`;
  }
  return `It preserves the three-month cash reserve and then ranks highest on wellbeing (${wellbeingOutcome(choice)}); its first-month cash effect is ${formatMoney(choice.firstMonthCashChangeCents)}.`;
}

function tradeoffFor(
  choice: ChoiceMetrics,
  priority: EventRecommendationPriority,
): string {
  const { preview } = choice.choice;
  const wellbeingTradeoff = preview.wellbeingChangesPpm.happiness < 0
    ? "The deterministic preview shows that happiness declines."
    : preview.wellbeingChangesPpm.burnout > 0
      ? "The deterministic preview shows that burnout increases."
      : null;
  const financialTradeoff = choice.modeledCashChangeCents < 0
    ? `The deterministic preview reduces cash by ${formatMoney(-choice.modeledCashChangeCents).replace("+", "")} over the modeled horizon.`
    : choice.ongoingExpenseCents > 0
      ? `The deterministic preview adds ${formatMoney(-choice.ongoingExpenseCents).replace("−", "")} of modeled ongoing expense.`
      : null;
  if (priority === "protect_wellbeing") {
    return financialTradeoff ?? wellbeingTradeoff ??
      "The deterministic preview shows no quantified downside for this choice.";
  }
  return wellbeingTradeoff ?? financialTradeoff ??
    "The deterministic preview shows no quantified downside for this choice.";
}

export function buildEventRecommendationPolicy(
  run: RunView,
  event: PendingEvent,
  conversation: readonly Readonly<{ role: "player" | "sprout"; content: string }>[],
): EventRecommendationPolicy {
  const candidates = event.choices
    .filter(({ enabled, preview }) => enabled && preview.status === "available")
    .map(metrics);
  if (candidates.length === 0) {
    throw new RangeError("event recommendation requires an available engine choice");
  }

  const statedPriority = playerPriority(conversation);
  const priority = statedPriority ?? (
    cashRunwayTenths(run) < 30 ||
    run.preparedness.band === "critical" ||
    run.preparedness.band === "exposed"
      ? "protect_cash"
      : "balanced"
  );
  const balanced = priority === "balanced"
    ? balancedChoice(run, candidates)
    : null;
  const selected = balanced?.choice ??
    [...candidates].sort((left, right) => compareByPriority(priority, left, right))[0]!;
  const runwayTenths = cashRunwayTenths(run);
  const runwayDescription = run.finances.monthlyObligations.totalRequiredCashCents <= 0
    ? "no required monthly cash"
    : `a ${Math.floor(runwayTenths / 10)}.${runwayTenths % 10}-month cash runway`;
  const source = statedPriority !== null
    ? `Your latest stated priority is “${priorityLabel(priority)}.”`
    : priority === "protect_cash"
      ? `Current ${runwayDescription} and ${run.preparedness.band} preparedness make “${priorityLabel(priority)}” the recommendation criterion.`
      : `The current game state makes “${priorityLabel(priority)}” the recommendation criterion.`;
  const outcome = outcomeFor(
    priority,
    selected,
    balanced?.preservesReserve ?? true,
  );
  const rationale = `${source} The engine recommends “${selected.choice.label}.” ${outcome}`;
  const tradeoff = tradeoffFor(selected, priority);
  const evidence = Object.freeze([
    Object.freeze({
      id: "recommendation_priority",
      label: "Recommendation priority",
      value: priorityLabel(priority),
    }),
    Object.freeze({
      id: "recommended_choice_outcome",
      label: "Recommended choice modeled outcome",
      value: outcome,
    }),
  ]);

  return Object.freeze({
    choiceId: selected.choice.id,
    priority,
    rationale,
    tradeoff,
    requiredEvidenceIds: Object.freeze(evidence.map(({ id }) => id)),
    evidence,
  });
}
