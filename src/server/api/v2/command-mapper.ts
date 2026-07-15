import type {
  DetailedFinanceCommand,
  DetailedFinancialAction,
} from "../../../core/detailed-actions-v2";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type { ResolveEventChoiceV2Command } from "../../../core/event-lifecycle-v2";
import type { ManageLifeMilestoneV2Command } from "../../../core/life-milestones-v2";
import type { SetRecurringStrategyCommand } from "../../../core/recurring-strategy-v2";
import type { GameCommandV2Public } from "../contracts-v2";

type PlayerAuthoredCommand = Exclude<
  GameCommandV2Public,
  { type: "process_month" }
>;

export function mapPlayerCommand(
  command: PlayerAuthoredCommand,
): DetailedFinanceCommand | SetRecurringStrategyCommand | ResolveEventChoiceV2Command | ManageLifeMilestoneV2Command {
  if (command.type === "set_recurring_strategy") {
    const strategy = command.payload.strategy;
    return {
      ...command,
      effectiveMonth: simulationMonth(command.effectiveMonth),
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: ratePpm(strategy.preTax401kSalaryRatePpm),
          preTaxHsaSalaryRatePpm: ratePpm(strategy.preTaxHsaSalaryRatePpm),
          afterTaxBroadIndexRatePpm: ratePpm(
            strategy.afterTaxBroadIndexRatePpm,
          ),
          afterTaxSectorRatePpm: ratePpm(strategy.afterTaxSectorRatePpm),
          afterTaxSpeculativeRatePpm: ratePpm(
            strategy.afterTaxSpeculativeRatePpm,
          ),
          afterTaxIraRatePpm: ratePpm(strategy.afterTaxIraRatePpm),
          afterTaxExtraDebtRatePpm: ratePpm(
            strategy.afterTaxExtraDebtRatePpm,
          ),
        },
      },
    };
  }
  if (command.type === "resolve_event_choice") {
    return {
      ...command,
      effectiveMonth: simulationMonth(command.effectiveMonth),
    };
  }
  if (command.type === "manage_life_milestone") {
    return {
      ...command,
      effectiveMonth: simulationMonth(command.effectiveMonth),
      payload: command.payload.action === "schedule"
        ? {
            ...command.payload,
            targetMonth: simulationMonth(command.payload.targetMonth),
            estimatedCostCents: moneyCents(command.payload.estimatedCostCents),
          }
        : command.payload,
    };
  }
  const publicAction = command.payload.action;
  let action: DetailedFinancialAction;
  if (publicAction.type === "purchase_home") {
    action = {
      ...publicAction,
      purchasePriceCents: moneyCents(publicAction.purchasePriceCents),
      downPaymentCents: moneyCents(publicAction.downPaymentCents),
      mortgageAnnualInterestRatePpm: ratePpm(
        publicAction.mortgageAnnualInterestRatePpm,
      ),
    };
  } else if (publicAction.type === "refinance_home") {
    action = {
      ...publicAction,
      mortgageAnnualInterestRatePpm: ratePpm(
        publicAction.mortgageAnnualInterestRatePpm,
      ),
    };
  } else if (
    publicAction.type === "sell_home" ||
    publicAction.type === "start_upskill"
  ) {
    action = publicAction;
  } else if (publicAction.type === "change_lifestyle") {
    action = {
      ...publicAction,
      annualLivingCostDeltaCents: moneyCents(
        publicAction.annualLivingCostDeltaCents,
      ),
    };
  } else {
    action = {
      ...publicAction,
      amountCents: moneyCents(publicAction.amountCents),
      ...(publicAction.type === "liquidate_taxable"
        ? {
            liquidationCostRatePpm: ratePpm(
              publicAction.liquidationCostRatePpm,
            ),
          }
        : {}),
    } as DetailedFinancialAction;
  }
  return {
    ...command,
    effectiveMonth: simulationMonth(command.effectiveMonth),
    payload: { action },
  };
}
