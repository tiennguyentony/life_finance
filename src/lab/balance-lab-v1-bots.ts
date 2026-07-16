import { nextInt, randomState, type RandomDraw, type RandomState } from "../core/domain/rng";
import type { RatePpm } from "../core/domain/money";
import type { BalanceLabBotIdV1 } from "./balance-lab-v1-contracts";

export type BalanceLabBotPolicyV1 = Readonly<{
  id: BalanceLabBotIdV1;
  policyVersion: 1;
  retirementContributionPpm: RatePpm;
  afterTaxAllocationPpm: Readonly<{
    broadIndex: RatePpm;
    sector: RatePpm;
    speculative: RatePpm;
    extraDebt: RatePpm;
  }>;
  emergencyFundMonths: number;
  optionalInsurance: "all_available" | "first_available" | "none";
  monthlyAction:
    | "pay_highest_rate_debt"
    | "none"
    | "invest_discretionary"
    | "increase_lifestyle_and_borrow"
    | "random_valid_intent";
  monthlyIntent: Readonly<{
    id: string;
    command: BalanceLabBotPolicyV1["monthlyAction"];
    description: string;
  }>;
  eventResponses:
    | Readonly<{ kind: "random_valid_choice" }>
    | Readonly<{
        kind: "mapped";
        byTemplateId: Readonly<Record<string, string>>;
      }>;
  policySummary: string;
}>;

function freezePolicy(policy: BalanceLabBotPolicyV1): BalanceLabBotPolicyV1 {
  return Object.freeze({
    ...policy,
    afterTaxAllocationPpm: Object.freeze({ ...policy.afterTaxAllocationPpm }),
    monthlyIntent: Object.freeze({ ...policy.monthlyIntent }),
    eventResponses: policy.eventResponses.kind === "random_valid_choice"
      ? Object.freeze({ kind: "random_valid_choice" })
      : Object.freeze({
          kind: "mapped",
          byTemplateId: Object.freeze({ ...policy.eventResponses.byTemplateId }),
        }),
  });
}

const PREPARED_EVENT_RESPONSES = Object.freeze({
  "personal.medical_bill": "use_insurance",
  "personal.lifestyle_upgrade": "keep_current_lifestyle",
  "personal.performance_bonus": "accept_bonus",
  "personal.utility_rebate": "claim_rebate",
});

const RECKLESS_EVENT_RESPONSES = Object.freeze({
  "personal.medical_bill": "pay_uninsured",
  "personal.lifestyle_upgrade": "accept_upgrade",
  "personal.performance_bonus": "accept_bonus",
  "personal.utility_rebate": "claim_rebate",
});

function monthlyIntent(
  id: string,
  command: BalanceLabBotPolicyV1["monthlyAction"],
  description: string,
) {
  return Object.freeze({ id, command, description });
}

export const BALANCE_LAB_BOTS_V1: readonly BalanceLabBotPolicyV1[] = Object.freeze([
  freezePolicy({
    id: "disciplined-v1",
    policyVersion: 1,
    retirementContributionPpm: 100_000 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 350_000 as RatePpm,
      sector: 0 as RatePpm,
      speculative: 0 as RatePpm,
      extraDebt: 250_000 as RatePpm,
    },
    emergencyFundMonths: 6,
    optionalInsurance: "all_available",
    monthlyAction: "pay_highest_rate_debt",
    monthlyIntent: monthlyIntent(
      "intent.repay-highest-rate-debt",
      "pay_highest_rate_debt",
      "Make one bounded extra payment to the highest-rate outstanding term debt.",
    ),
    eventResponses: { kind: "mapped", byTemplateId: PREPARED_EVENT_RESPONSES },
    policySummary: "Build six months of cash, insure available risks, and pay expensive debt before extra investing.",
  }),
  freezePolicy({
    id: "average-beginner-v1",
    policyVersion: 1,
    retirementContributionPpm: 50_000 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 100_000 as RatePpm,
      sector: 50_000 as RatePpm,
      speculative: 50_000 as RatePpm,
      extraDebt: 50_000 as RatePpm,
    },
    emergencyFundMonths: 3,
    optionalInsurance: "first_available",
    monthlyAction: "none",
    monthlyIntent: monthlyIntent(
      "intent.hold-recurring-plan",
      "none",
      "Take no one-off action and retain the accepted recurring strategy.",
    ),
    eventResponses: { kind: "mapped", byTemplateId: PREPARED_EVENT_RESPONSES },
    policySummary: "Use a modest diversified policy, a three-month reserve, and one optional coverage.",
  }),
  freezePolicy({
    id: "aggressive-investor-v1",
    policyVersion: 1,
    retirementContributionPpm: 100_000 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 250_000 as RatePpm,
      sector: 250_000 as RatePpm,
      speculative: 350_000 as RatePpm,
      extraDebt: 0 as RatePpm,
    },
    emergencyFundMonths: 1,
    optionalInsurance: "first_available",
    monthlyAction: "invest_discretionary",
    monthlyIntent: monthlyIntent(
      "intent.invest-discretionary",
      "invest_discretionary",
      "Invest one bounded discretionary amount in the broad-index taxable bucket.",
    ),
    eventResponses: { kind: "mapped", byTemplateId: RECKLESS_EVENT_RESPONSES },
    policySummary: "Favor taxable growth and speculative exposure while retaining a one-month reserve.",
  }),
  freezePolicy({
    id: "debt-heavy-lifestyle-v1",
    policyVersion: 1,
    retirementContributionPpm: 0 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 0 as RatePpm,
      sector: 0 as RatePpm,
      speculative: 50_000 as RatePpm,
      extraDebt: 0 as RatePpm,
    },
    emergencyFundMonths: 0,
    optionalInsurance: "none",
    monthlyAction: "increase_lifestyle_and_borrow",
    monthlyIntent: monthlyIntent(
      "intent.increase-lifestyle",
      "increase_lifestyle_and_borrow",
      "Accept a bounded annual living-cost increase while retaining available credit.",
    ),
    eventResponses: { kind: "mapped", byTemplateId: RECKLESS_EVENT_RESPONSES },
    policySummary: "Increase lifestyle costs and use bounded available credit without reserve or optional insurance.",
  }),
  freezePolicy({
    id: "cash-hoarder-v1",
    policyVersion: 1,
    retirementContributionPpm: 0 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 0 as RatePpm,
      sector: 0 as RatePpm,
      speculative: 0 as RatePpm,
      extraDebt: 0 as RatePpm,
    },
    emergencyFundMonths: 12,
    optionalInsurance: "none",
    monthlyAction: "none",
    monthlyIntent: monthlyIntent(
      "intent.hold-cash",
      "none",
      "Take no one-off action and retain cash under the recurring reserve target.",
    ),
    eventResponses: { kind: "mapped", byTemplateId: PREPARED_EVENT_RESPONSES },
    policySummary: "Retain cash toward a twelve-month reserve and make no discretionary investment.",
  }),
  freezePolicy({
    id: "random-control-v1",
    policyVersion: 1,
    retirementContributionPpm: 0 as RatePpm,
    afterTaxAllocationPpm: {
      broadIndex: 0 as RatePpm,
      sector: 0 as RatePpm,
      speculative: 0 as RatePpm,
      extraDebt: 0 as RatePpm,
    },
    emergencyFundMonths: 0,
    optionalInsurance: "none",
    monthlyAction: "random_valid_intent",
    monthlyIntent: monthlyIntent(
      "intent.random-valid",
      "random_valid_intent",
      "Uniformly select one production-valid monthly intent using only the lab cursor.",
    ),
    eventResponses: { kind: "random_valid_choice" },
    policySummary: "Choose only from a frozen production-validated intent list using a separate lab-owned RNG.",
  }),
]);

export function balanceLabBotPolicyV1(id: BalanceLabBotIdV1): BalanceLabBotPolicyV1 {
  const policy = BALANCE_LAB_BOTS_V1.find((candidate) => candidate.id === id);
  if (policy === undefined) throw new RangeError(`unknown balance lab bot: ${id}`);
  return policy;
}

export function deriveBalanceLabBotRandomStateV1(input: Readonly<{
  experimentId: string;
  personaId: string;
  matchedSeed: number;
}>): RandomState {
  return randomState(
    [
      "offline-balance-lab-v1",
      input.experimentId,
      input.personaId,
      String(input.matchedSeed),
      "random-control-v1",
    ].join(" | "),
  );
}

export function chooseRandomControlOptionV1<T>(
  state: RandomState,
  options: readonly T[],
): RandomDraw<T> {
  if (options.length < 1) throw new RangeError("random control requires an option");
  const draw = nextInt(state, 0, options.length - 1);
  return Object.freeze({ value: options[draw.value]!, nextState: draw.nextState });
}

export function chooseBalanceLabEventResponseV1(input: Readonly<{
  policy: BalanceLabBotPolicyV1;
  templateId: string;
  validChoiceIds: readonly string[];
  botRandom: RandomState | undefined;
}>): Readonly<{ choiceId: string; nextBotRandom: RandomState | undefined }> {
  if (input.validChoiceIds.length < 1) {
    throw new RangeError("balance lab event response requires a valid choice");
  }
  const choices = [...input.validChoiceIds].toSorted();
  if (input.policy.eventResponses.kind === "random_valid_choice") {
    if (input.botRandom === undefined) {
      throw new RangeError("random event response requires the lab-only cursor");
    }
    const draw = chooseRandomControlOptionV1(input.botRandom, choices);
    return Object.freeze({ choiceId: draw.value, nextBotRandom: draw.nextState });
  }
  const mapped = input.policy.eventResponses.byTemplateId[input.templateId];
  return Object.freeze({
    choiceId: mapped !== undefined && choices.includes(mapped) ? mapped : choices[0]!,
    nextBotRandom: input.botRandom,
  });
}
