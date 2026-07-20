import type { RunView } from "../../application/game/run-view";
import type { InterpretEventResponse } from "../../contracts/api/contracts";
import type { AiContentSource } from "../../core/ai-source";
import { redactSensitiveText } from "./privacy";
import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";
import {
  AI_CONTRACT_VERSION,
  eventInterpreterResponseSchema,
  type EventInterpreterRequest,
  type EventInterpreterResponse,
} from "./contracts";

export const INTERACTIVE_EVENT_INTERPRETER_VERSION =
  "interactive-event-interpretation-v1" as const;

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_LATENCY_MS = 30_000;
const MAXIMUM_PLAYER_TURNS = 3;
const NEUTRAL_FOLLOW_UP = Object.freeze([
  "What single action would you take first, and what financial priority are you protecting?",
  "Be specific: what will you do now to handle this situation?",
] as const);

type PendingEvent = Extract<RunView["pendingInteraction"], { kind: "event" }>;

export type InteractiveEventAiClient = Readonly<{
  generate(request: EventInterpreterRequest): Promise<EventInterpreterResponse>;
  responseSource?(): Exclude<AiContentSource, "deterministic_fallback">;
}>;

export class InteractiveEventError extends Error {
  readonly code: "STALE_REVISION" | "EVENT_MISMATCH" | "NO_PENDING_EVENT";

  constructor(code: InteractiveEventError["code"], message: string) {
    super(message);
    this.name = "InteractiveEventError";
    this.code = code;
  }
}

const CHOICE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  keep_refund: ["keep the refund", "save the refund", "put the refund in savings"],
  share_refund: ["share the refund", "split the refund", "give away half the refund"],
  skip_gadget: ["skip the gadget", "do not buy it", "buy nothing", "walk away from the gadget"],
  buy_deluxe: ["buy deluxe", "buy the deluxe one", "get the premium gadget"],
  four_month_plan: ["four month plan", "pay over four months", "finance the gadget"],
  return_duplicate: ["return the duplicate", "send the duplicate back", "get a refund for the duplicate"],
  keep_duplicate: ["keep the duplicate", "keep both deliveries"],
  share_duplicate: ["share the duplicate", "give away the extra groceries", "donate the extra groceries"],
  resell_surplus: ["resell the surplus", "sell the extra groceries", "sell the duplicate"],
  claim_full_credit: ["claim the full credit", "take the wellness credit", "keep the wellness credit"],
  use_credit_for_recovery: ["use the credit for recovery", "spend the credit on recovery", "use it to recover"],
  cover_full_cost: ["cover the full cost", "pay all the care cost", "pay for all the care", "pay everything", "cover all costs"],
  split_cost_and_time: ["split the cost", "share the care cost", "contribute time", "help with time"],
  decline_request: ["decline the request", "say no to the request", "set a boundary"],
  contribute_full: ["contribute the full amount", "pay the full gift amount", "chip in the full amount", "pay everything", "pay the full amount"],
  make_gift: ["make a cheaper gift", "make my own gift", "give a lower cost gift"],
  decline_gift: ["decline the gift", "skip the group gift", "politely say no"],
  sell_lamp: ["sell the lamp", "cash out the lamp", "list the lamp for sale"],
  use_laundromat: ["use a laundromat", "go to the laundromat", "wash clothes elsewhere"],
  hire_repairer: ["hire a repairer", "call a repair technician", "pay someone to fix it"],
  diy_repair: ["repair it myself", "fix it myself", "do it myself", "diy repair"],
  repair_now: ["repair it", "fix it", "approve the repair", "pay for the repair"],
  negotiate_repair: ["negotiate", "shop around", "get another quote", "find a cheaper repair"],
  pay_uninsured: ["pay the bill", "pay without insurance", "pay out of pocket", "pay everything", "cover the whole bill"],
  use_insurance: ["use insurance", "file a claim", "use my coverage"],
  maintain_lifestyle: ["keep spending", "maintain my lifestyle", "change nothing"],
  emergency_budget: ["emergency budget", "cut spending", "lower expenses", "reduce expenses"],
  trim_spending: ["trim spending", "cut spending", "lower expenses", "reduce expenses"],
  spread_income_gap: ["spread the gap", "pay over time", "spread it over six months"],
  protect_current_routine: ["keep my routine", "protect my routine", "change nothing"],
  restore_uninsured: ["pay for restoration", "restore it", "pay without coverage"],
  file_covered_claim: ["file a claim", "use coverage", "use insurance"],
  accept_upgrade: ["upgrade", "spend more", "accept the upgrade"],
  keep_current_lifestyle: ["keep my lifestyle", "say no", "do not upgrade", "skip the upgrade"],
  trial_upgrade: ["try the upgrade", "test the upgrade", "try it temporarily", "try it for a few months"],
  decline_shift: ["decline the shift", "skip the shift", "say no to the shift"],
  work_one_shift: ["work one shift", "take one shift", "try a single shift"],
  work_weekend: ["work the weekend", "take the weekend job", "buy the costume and work"],
  negotiate_bill: ["negotiate the bill", "ask for a lower bill", "call the provider to reduce the bill"],
  medical_payment_plan: ["medical payment plan", "pay the medical bill over time", "finance the medical bill"],
  save_bonus: ["save the bonus", "save all the bonus", "keep the bonus as cash", "put the bonus in savings"],
  celebrate_some: ["celebrate a little", "spend some of the bonus", "save most of the bonus"],
  spend_most_bonus: ["spend most of the bonus", "use most of the bonus", "splurge with the bonus"],
  take_intensive_program: ["take the intensive program", "choose the intensive course", "study intensively"],
  take_lighter_program: ["take the lighter program", "choose the lighter schedule", "study over six months"],
  pay_cleanup_now: ["pay for cleanup now", "pay the cleanup immediately", "pay everything", "cover all cleanup costs"],
  cleanup_payment_plan: ["cleanup payment plan", "pay for cleanup over time", "finance the cleanup"],
  diy_management_cleanup: ["clean it myself", "handle the cleanup myself", "diy cleanup"],
  hire_cleanup: ["hire cleanup", "pay a cleanup service", "call professional cleaners", "pay everything", "cover all cleanup costs"],
  build_trash_armor: ["build trash armor", "secure the trash myself", "raccoon proof the trash"],
  ignore_inspector: ["ignore the inspector", "do nothing about the raccoon", "ignore the raccoon"],
  walk_away: ["walk away", "do not buy the lamp", "leave the lamp"],
  buy_and_keep: ["buy and keep it", "keep the lamp", "buy the lamp for myself"],
  buy_restore_and_list: ["restore and sell it", "buy restore and list", "flip the lamp"],
  restore_reliable_transport: ["repair my car", "fix transportation", "replace the car", "restore transport"],
  use_temporary_transport: ["temporary transport", "take the bus", "use public transit", "rent temporarily"],
  renew_lease: ["renew", "stay here", "accept the rent"],
  move_to_lower_cost_home: ["move", "find cheaper housing", "lower rent"],
  accept_increase: ["accept the rent increase", "renew at the higher rent", "pay the higher rent"],
  move_to_cheaper_home: ["move to a cheaper home", "find a cheaper apartment", "move somewhere cheaper"],
  share_housing: ["share housing", "find a roommate", "split the rent", "live with roommates"],
  replace_failed_system: ["replace it", "full repair", "fix it properly"],
  stabilize_then_save: ["temporary fix", "stabilize it", "save first"],
  attend_full_trip: ["attend", "go to the wedding", "full trip"],
  attend_on_a_budget: ["attend on a budget", "cheap trip", "set a wedding budget"],
  decline_invitation: ["decline", "skip the wedding", "do not attend"],
  fund_the_request: ["pay all of it", "fund it", "cover the full cost", "pay everything", "cover all costs"],
  share_cost_and_time: ["share the cost", "help with time", "split the cost"],
  set_a_financial_boundary: ["set a boundary", "say no", "limit my help"],
  take_upfront_payment: ["take the upfront payment", "get paid upfront", "take all the money now"],
  take_six_month_royalty: ["take the royalty", "monthly royalty", "get paid over six months"],
  pay_commitment_now: ["pay the commitment now", "pay for it now", "cover the commitment immediately", "pay everything", "pay the full amount"],
  spread_commitment_cost: ["spread the commitment cost", "pay over three months", "split the cost over time"],
  decline_commitment: ["decline the commitment", "skip the commitment", "say no to the commitment"],
  cancel_all: ["cancel all subscriptions", "cancel every subscription", "stop all subscriptions"],
  keep_favorite: ["keep one favorite", "keep my favorite subscription", "cancel all but one"],
  keep_digital_fossils: ["keep the subscriptions", "keep all subscriptions", "change nothing"],
  pay_now: ["pay for the repair now", "pay cash for the repair", "fix it immediately", "pay everything", "cover the full repair"],
  payment_plan: ["use a payment plan", "pay over three months", "finance the repair"],
  defer_repair: ["defer the repair", "delay the repair", "wait before repairing"],
  complete_repair: ["complete the repair", "finish the repair", "pay for the full repair"],
  repair_payment_plan: ["repair payment plan", "pay the repair over four months", "finance the bigger repair"],
  temporary_transport: ["use temporary transportation", "take public transit", "use the bus for now"],
  claim_rebate: ["claim the rebate", "keep the rebate", "take the rebate as cash"],
  improve_efficiency: ["improve efficiency", "make the home efficient", "spend the rebate on efficiency"],
  donate_rebate: ["donate the rebate", "give the rebate to charity", "donate the money"],
  buy_basic: ["buy basic", "basic replacement", "cheapest reliable option"],
  device_payment_plan: ["payment plan", "pay over four months", "finance it"],
  buy_premium: ["buy premium", "best model", "premium replacement"],
});

const UNSAFE_PATTERNS = [
  /\brob(?:bing)?\b.*\bbank\b/u,
  /\bsteal(?:ing)?\b/u,
  /\bfraud\b/u,
  /\bscam(?:ming)?\b/u,
  /\bkill\b/u,
  /\bhurt\b.*\b(?:myself|someone)\b/u,
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9$]+/gu, " ")
    .trim();
}

function tokens(value: string): ReadonlySet<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 2),
  );
}

function overlapScore(playerText: string, candidateText: string): number {
  const playerTokens = tokens(playerText);
  const candidateTokens = tokens(candidateText);
  if (candidateTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of candidateTokens) {
    if (playerTokens.has(token)) overlap += 1;
  }
  const score = Math.round((overlap / candidateTokens.size) * 1_000_000);
  return candidateTokens.size === 1 ? Math.min(score, 700_000) : score;
}

function fastChoiceMatch(
  event: PendingEvent,
  playerText: string,
): Readonly<{ choiceId: string; confidencePpm: number }> | null {
  const normalized = normalize(playerText);
  const scored = event.choices
    .filter(({ enabled }) => enabled)
    .map((choice) => {
      const aliases = [
        choice.id.replaceAll("_", " "),
        choice.label,
        ...(CHOICE_ALIASES[choice.id] ?? []),
      ];
      const phraseScore = Math.max(...aliases.map((alias) => {
        const phrase = normalize(alias);
        if (phrase.length < 4 || !normalized.includes(phrase)) return 0;
        const wordCount = phrase.split(" ").length;
        return Math.min(990_000, 760_000 + wordCount * 80_000);
      }));
      const score = Math.max(
        phraseScore,
        ...aliases.map((alias) => overlapScore(playerText, alias)),
      );
      return { choiceId: choice.id, confidencePpm: score };
    })
    .sort((left, right) => right.confidencePpm - left.confidencePpm);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.confidencePpm < 760_000) return null;
  if (second && best.confidencePpm - second.confidencePpm < 120_000) return null;
  return best;
}

function fixedResponse(
  input: Omit<InterpretEventResponse, "version" | "latencyMs">,
  startedAt: number,
): InterpretEventResponse {
  return Object.freeze({
    version: INTERACTIVE_EVENT_INTERPRETER_VERSION,
    ...input,
    latencyMs: Math.min(MAX_LATENCY_MS, Math.max(0, Date.now() - startedAt)),
  });
}

function turnEvidence(playerTurn: number) {
  return {
    playerTurn,
    remainingPlayerTurns: MAXIMUM_PLAYER_TURNS - playerTurn,
  } as const;
}

function unsafeResponse(
  playerTurn: number,
  startedAt: number,
): InterpretEventResponse {
  return fixedResponse({
    status: "rejected",
    source: "deterministic_fast_path",
    choiceId: null,
    confidencePpm: 1_000_000,
    systemMessage: "Rejected. Illegal actions are outside this financial simulation.",
    sproutReaction: "Prison housing is not an emergency fund.",
    education: "A resilient plan must be legal, repeatable, and under your control.",
    ...turnEvidence(playerTurn),
  }, startedAt);
}

function questionResponse(
  playerTurn: number,
  question: string,
  confidencePpm: number,
  source: InterpretEventResponse["source"],
  startedAt: number,
): InterpretEventResponse {
  return fixedResponse({
    status: "question",
    source,
    choiceId: null,
    confidencePpm,
    systemMessage: question,
    sproutReaction: "I need one more detail before this becomes a real decision.",
    education: "No financial consequence has been revealed or applied while Sprout is still clarifying your intent.",
    ...turnEvidence(playerTurn),
  }, startedAt);
}

function rejectedResponse(
  playerTurn: number,
  source: InterpretEventResponse["source"],
  startedAt: number,
): InterpretEventResponse {
  return fixedResponse({
    status: "rejected",
    source,
    choiceId: null,
    confidencePpm: 0,
    systemMessage: "No supported financial decision was identified after three answers.",
    sproutReaction: "The idea is still a cloud. The ledger needs something with edges.",
    education: "Start again with one concrete action involving the expense, your coverage, or your spending plan.",
    ...turnEvidence(playerTurn),
  }, startedAt);
}

function neutralFollowUp(playerTurn: number): string {
  return NEUTRAL_FOLLOW_UP[Math.min(playerTurn - 1, NEUTRAL_FOLLOW_UP.length - 1)]!;
}

function contextualFollowUp(playerTurn: number, latestPlayerText: string): string {
  const latest = normalize(latestPlayerText);
  if (/\b(?:pay|spend|cover|fund)\b/u.test(latest)) {
    return "What exactly would you pay for, and what outcome are you trying to secure?";
  }
  if (/\b(?:help|support|contribute)\b/u.test(latest)) {
    return "What concrete support would you provide, and what boundary would you keep?";
  }
  if (/\b(?:save|protect|avoid|reduce|cut)\b/u.test(latest)) {
    return "What specific change would you make to protect that priority?";
  }
  if (/\b(?:fix|repair|clean|replace)\b/u.test(latest)) {
    return "How exactly would you handle the repair or cleanup?";
  }
  return neutralFollowUp(playerTurn);
}

const QUESTION_STOP_WORDS = new Set([
  "a", "an", "and", "are", "for", "how", "is", "of", "or", "the", "to",
  "what", "will", "would", "you", "your",
]);

function questionTokens(value: string): ReadonlySet<string> {
  return new Set(normalize(value).split(" ")
    .map((token) => token
      .replace(/ing$/u, "")
      .replace(/ed$/u, "")
      .replace(/s$/u, ""))
    .filter((token) => token.length >= 3 && !QUESTION_STOP_WORDS.has(token)));
}

function mentionsChoiceDirection(event: PendingEvent, question: string): boolean {
  const supplied = questionTokens(question);
  return event.choices.some((choice) => {
    const hidden = questionTokens(`${choice.id.replaceAll("_", " ")} ${choice.label}`);
    let overlap = 0;
    for (const token of hidden) {
      if (supplied.has(token)) overlap += 1;
    }
    return overlap >= 2;
  });
}

function safeFollowUpQuestion(
  candidate: string | null,
  playerTurn: number,
  event: PendingEvent,
  latestPlayerText: string,
): string {
  const fallback = contextualFollowUp(playerTurn, latestPlayerText);
  if (candidate === null) return fallback;
  const normalized = normalize(candidate);
  const presentsMenu = /\b(?:or|versus|vs)\b/u.test(normalized);
  const exposesAmount = /[$%0-9]/u.test(candidate);
  const resemblesList = /[,;:].*[,;]/u.test(candidate);
  const isQuestion = candidate.trim().endsWith("?");
  const isOpenQuestion = /^(?:what|how)\b/u.test(normalized);
  return presentsMenu ||
      exposesAmount ||
      resemblesList ||
      !isQuestion ||
      !isOpenQuestion ||
      mentionsChoiceDirection(event, candidate)
    ? fallback
    : candidate;
}

function mappedResponse(
  event: PendingEvent,
  choiceId: string,
  confidencePpm: number,
  source: InterpretEventResponse["source"],
  playerTurn: number,
  startedAt: number,
): InterpretEventResponse {
  const choice = event.choices.find(({ id }) => id === choiceId);
  if (!choice || !choice.enabled) {
    return fixedResponse({
      status: "rejected",
      source: "deterministic_fallback",
      choiceId: null,
      confidencePpm: 0,
      systemMessage: "That option is not currently available. Try a different approach.",
      sproutReaction: "The plan needs one more draft.",
      education: "Available decisions depend on your current coverage, cash, debt, and event state.",
      ...turnEvidence(playerTurn),
    }, startedAt);
  }
  const prudent = /budget|trim|negotiate|insurance|coverage|basic|boundary|decline|lower_cost|temporary/u
    .test(choice.id);
  return fixedResponse({
    status: "mapped",
    source,
    choiceId,
    confidencePpm,
    systemMessage: `Valid financial action detected: ${choice.label}.`,
    sproutReaction: prudent
      ? "Boring. Beautifully, financially boring."
      : "Bold choice. Your cash balance has requested a private meeting.",
    education: choice.description ||
      "The simulation will apply the engine-owned consequence if you commit this decision.",
    ...turnEvidence(playerTurn),
  }, startedAt);
}

function minimumModelConfidence(
  source: InterpretEventResponse["source"],
): number {
  return source === "local_oss" ? 900_000 : 650_000;
}

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("event interpreter timed out")), milliseconds);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export class InteractiveEventService {
  constructor(
    private readonly client: InteractiveEventAiClient | null,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async interpret(
    run: RunView,
    request: Readonly<{
      eventId: string;
      expectedRevision: number;
      selectedChoiceId?: string;
      conversation: readonly Readonly<{
        role: "player" | "sprout";
        content: string;
      }>[];
    }>,
  ): Promise<InterpretEventResponse> {
    const startedAt = Date.now();
    if (run.revision !== request.expectedRevision) {
      throw new InteractiveEventError("STALE_REVISION", "the game changed before the answer was interpreted");
    }
    if (run.pendingInteraction.kind !== "event") {
      throw new InteractiveEventError("NO_PENDING_EVENT", "the game has no decision waiting for an answer");
    }
    const event = run.pendingInteraction;
    if (event.eventId !== request.eventId) {
      throw new InteractiveEventError("EVENT_MISMATCH", "the answer belongs to a different event");
    }
    const conversation = request.conversation.map(({ role, content }) => ({
      role,
      content: redactSensitiveText(content).text.trim(),
    }));
    const playerTurn = conversation.filter(({ role }) => role === "player").length;
    const playerText = conversation
      .filter(({ role }) => role === "player")
      .map(({ content }) => content)
      .join(" ");
    const latestPlayerText = conversation.at(-1)?.content ?? "";
    if (
      playerTurn < 1 ||
      playerTurn > MAXIMUM_PLAYER_TURNS ||
      conversation.length > MAXIMUM_PLAYER_TURNS * 2 - 1 ||
      conversation.at(-1)?.role !== "player" ||
      conversation.some(({ role }, index) =>
        role !== (index % 2 === 0 ? "player" : "sprout")
      ) ||
      conversation.some(({ content }) => content.length === 0)
    ) {
      throw new InteractiveEventError("EVENT_MISMATCH", "the event conversation is invalid");
    }
    // The hint menu exposes only IDs already projected by the authoritative
    // pending event. Validate and map the selected ID here so a hint click
    // never needs an LLM and can never invent an engine action.
    if (request.selectedChoiceId !== undefined) {
      return mappedResponse(
        event,
        request.selectedChoiceId,
        1_000_000,
        "deterministic_fast_path",
        playerTurn,
        startedAt,
      );
    }
    if (UNSAFE_PATTERNS.some((pattern) => pattern.test(normalize(playerText)))) {
      return unsafeResponse(playerTurn, startedAt);
    }
    const fast = fastChoiceMatch(event, playerText);
    if (fast) {
      return mappedResponse(
        event,
        fast.choiceId,
        fast.confidencePpm,
        "deterministic_fast_path",
        playerTurn,
        startedAt,
      );
    }
    if (this.client === null) {
      return this.fallback(playerTurn, latestPlayerText, startedAt);
    }

    try {
      const generated = await timeout(this.client.generate({
        contractVersion: AI_CONTRACT_VERSION,
        privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
        dataUseAccepted: true,
        role: "event_interpreter",
        event: {
          templateId: event.templateId,
          headline: event.headline ?? "A financial decision is waiting",
          situation: event.body ?? "Choose a response to the current financial event.",
          choices: event.choices
            .filter(({ enabled }) => enabled)
            .map(({ id, label, description }) => ({
              id,
              label,
              consequence: description || "Engine-owned event response",
            })),
        },
        conversation,
        playerTurn,
        maximumPlayerTurns: MAXIMUM_PLAYER_TURNS,
      }), this.timeoutMs);
      const interpreted = eventInterpreterResponseSchema.parse(generated);
      const source = this.client.responseSource?.() ?? "openai";
      if (
        interpreted.status === "mapped" &&
        interpreted.choiceId !== null &&
        interpreted.confidencePpm >= minimumModelConfidence(source)
      ) {
        return mappedResponse(
          event,
          interpreted.choiceId,
          interpreted.confidencePpm,
          source,
          playerTurn,
          startedAt,
        );
      }
      if (interpreted.status === "unsafe") {
        return unsafeResponse(playerTurn, startedAt);
      }
      if (playerTurn < MAXIMUM_PLAYER_TURNS) {
        return questionResponse(
          playerTurn,
          safeFollowUpQuestion(
            interpreted.followUpQuestion,
            playerTurn,
            event,
            latestPlayerText,
          ),
          interpreted.confidencePpm,
          source,
          startedAt,
        );
      }
      return rejectedResponse(playerTurn, source, startedAt);
    } catch {
      return this.fallback(playerTurn, latestPlayerText, startedAt);
    }
  }

  private fallback(
    playerTurn: number,
    latestPlayerText: string,
    startedAt: number,
  ): InterpretEventResponse {
    if (playerTurn < MAXIMUM_PLAYER_TURNS) {
      return questionResponse(
        playerTurn,
        contextualFollowUp(playerTurn, latestPlayerText),
        0,
        "deterministic_fallback",
        startedAt,
      );
    }
    return rejectedResponse(playerTurn, "deterministic_fallback", startedAt);
  }
}
