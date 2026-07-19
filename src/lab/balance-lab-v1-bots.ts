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
        byTemplateId: Readonly<Record<string, readonly string[]>>;
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
          byTemplateId: Object.freeze(Object.fromEntries(
            Object.entries(policy.eventResponses.byTemplateId).map(
              ([templateId, preferences]) => [
                templateId,
                Object.freeze([...preferences]),
              ],
            ),
          )),
        }),
  });
}

const PREPARED_EVENT_RESPONSES = Object.freeze({
  "personal.employer_wellness_credit": ["use_credit_for_recovery"],
  "personal.professional_development_stipend": ["take_lighter_program"],
  "personal.consumer_refund": ["keep_refund"],
  "personal.side_project_license": ["take_six_month_royalty"],
  "personal.medical_bill": ["use_insurance", "negotiate_bill"],
  "personal.lifestyle_upgrade": ["keep_current_lifestyle"],
  "personal.performance_bonus": ["save_bonus"],
  "personal.transport_repair": ["pay_now"],
  "personal.transport_repair_followup": ["complete_repair"],
  "personal.rent_renewal": ["move_to_cheaper_home"],
  "personal.family_care_request": ["split_cost_and_time"],
  "personal.work_device_replacement": ["buy_basic"],
  "personal.reduced_work_hours": ["trim_spending"],
  "personal.social_commitment": ["decline_commitment"],
  "personal.utility_rebate": ["improve_efficiency"],
  "personal.subscription_archaeology": ["cancel_all"],
  "personal.group_chat_gift": ["make_gift"],
  "personal.countertop_gadget_sale": ["skip_gadget"],
  "personal.double_grocery_delivery": ["return_duplicate"],
  "personal.mascot_side_hustle": ["work_one_shift"],
  "personal.laundry_final_spin": ["diy_repair"],
  "personal.raccoon_sanitation": ["build_trash_armor"],
  "personal.raccoon_management_followup": ["diy_management_cleanup"],
  "personal.rare_yard_sale_lamp": ["walk_away"],
  "personal.lamp_market_followup": ["sell_lamp"],
});

const AVERAGE_EVENT_RESPONSES = Object.freeze({
  "personal.employer_wellness_credit": ["claim_full_credit"],
  "personal.professional_development_stipend": ["take_lighter_program"],
  "personal.consumer_refund": ["share_refund"],
  "personal.side_project_license": ["take_upfront_payment"],
  "personal.medical_bill": ["medical_payment_plan"],
  "personal.lifestyle_upgrade": ["trial_upgrade"],
  "personal.performance_bonus": ["celebrate_some"],
  "personal.transport_repair": ["payment_plan"],
  "personal.transport_repair_followup": ["repair_payment_plan"],
  "personal.rent_renewal": ["accept_increase"],
  "personal.family_care_request": ["split_cost_and_time"],
  "personal.work_device_replacement": ["device_payment_plan"],
  "personal.reduced_work_hours": ["trim_spending"],
  "personal.social_commitment": ["spread_commitment_cost"],
  "personal.utility_rebate": ["claim_rebate"],
  "personal.subscription_archaeology": ["keep_favorite"],
  "personal.group_chat_gift": ["contribute_full"],
  "personal.countertop_gadget_sale": ["buy_basic"],
  "personal.double_grocery_delivery": ["share_duplicate"],
  "personal.mascot_side_hustle": ["work_one_shift"],
  "personal.laundry_final_spin": ["use_laundromat"],
  "personal.raccoon_sanitation": ["hire_cleanup"],
  "personal.raccoon_management_followup": ["cleanup_payment_plan"],
  "personal.rare_yard_sale_lamp": ["buy_and_keep"],
  "personal.lamp_market_followup": ["sell_lamp"],
});

const RECKLESS_EVENT_RESPONSES = Object.freeze({
  "personal.employer_wellness_credit": ["claim_full_credit"],
  "personal.professional_development_stipend": ["take_intensive_program"],
  "personal.consumer_refund": ["share_refund"],
  "personal.side_project_license": ["take_upfront_payment"],
  "personal.medical_bill": ["pay_uninsured"],
  "personal.lifestyle_upgrade": ["accept_upgrade"],
  "personal.performance_bonus": ["spend_most_bonus"],
  "personal.transport_repair": ["defer_repair"],
  "personal.transport_repair_followup": ["temporary_transport"],
  "personal.rent_renewal": ["accept_increase"],
  "personal.family_care_request": ["cover_full_cost"],
  "personal.work_device_replacement": ["device_payment_plan"],
  "personal.reduced_work_hours": ["spread_income_gap"],
  "personal.social_commitment": ["spread_commitment_cost"],
  "personal.utility_rebate": ["donate_rebate"],
  "personal.subscription_archaeology": ["keep_digital_fossils"],
  "personal.group_chat_gift": ["contribute_full"],
  "personal.countertop_gadget_sale": ["four_month_plan"],
  "personal.double_grocery_delivery": ["keep_duplicate"],
  "personal.mascot_side_hustle": ["work_weekend"],
  "personal.laundry_final_spin": ["hire_repairer"],
  "personal.raccoon_sanitation": ["ignore_inspector"],
  "personal.raccoon_management_followup": ["cleanup_payment_plan"],
  "personal.rare_yard_sale_lamp": ["buy_restore_and_list"],
  "personal.lamp_market_followup": ["sell_lamp"],
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
    eventResponses: { kind: "mapped", byTemplateId: AVERAGE_EVENT_RESPONSES },
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
  const preferences = input.policy.eventResponses.byTemplateId[input.templateId] ?? [];
  const mapped = preferences.find((choiceId) => choices.includes(choiceId));
  return Object.freeze({
    choiceId: mapped ?? choices[0]!,
    nextBotRandom: input.botRandom,
  });
}
