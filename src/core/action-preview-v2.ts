import {
  ACTION_POLICY_V1_VERSION,
  actionPolicyForVersionV2,
  resolveDetailedActionPolicyV2,
  type ActionPolicyVersionV2,
} from "./action-policy-v2";
import { sha256Canonical } from "./canonical";
import type { DetailedFinanceCommand } from "./detailed-actions-v2";
import { moneyCents, subtractMoney, type MoneyCents } from "./domain/money";
import { safeBigIntToNumber } from "./domain/integer";
import type { SimulationMonth } from "./domain/month";
import type { GameStateV2, RecurringStrategy } from "./game-state-v2";
import type { JournalTransaction } from "./ledger";
import { assessV2Liquidity } from "./obligation-funding-v2";
import type { SetRecurringStrategyCommand } from "./recurring-strategy-v2";

export const ACTION_PREVIEW_V2_SCHEMA_VERSION = 1 as const;

export type PlayerPolicyCommandV2 =
  | DetailedFinanceCommand
  | SetRecurringStrategyCommand;

export type ActionPreviewPolicyChangeV2 =
  | Readonly<{
      kind: "annual_living_cost";
      effectiveMonth: SimulationMonth;
      previousAnnualLivingCostCents: MoneyCents;
      resultingAnnualLivingCostCents: MoneyCents;
    }>
  | Readonly<{
      kind: "recurring_strategy";
      effectiveMonth: SimulationMonth;
      previous: RecurringStrategy;
      resulting: RecurringStrategy;
    }>;

export type PlayerPolicyCommandPreviewV2 = Readonly<{
  schemaVersion: typeof ACTION_PREVIEW_V2_SCHEMA_VERSION;
  commandType: PlayerPolicyCommandV2["type"];
  actionPolicyVersion: ActionPolicyVersionV2 | null;
  commandChecksum: string;
  openingStateChecksum: string;
  resultingStateChecksum: string;
  openingRevision: number;
  resultingRevision: number;
  effects: Readonly<{
    cashChangeCents: MoneyCents;
    automaticLiquidityChangeCents: MoneyCents;
    termDebtPrincipalChangeCents: MoneyCents;
    revolvingCreditUsedChangeCents: MoneyCents;
    annualLivingCostChangeCents: MoneyCents;
    requiredObligationsChangeCents: MoneyCents;
  }>;
  policyChanges: readonly ActionPreviewPolicyChangeV2[];
  appendedLedgerTransactionIds: readonly string[];
  appendedLedgerTransactions: readonly JournalTransaction[];
}>;

export type DetailedActionPreviewV2 = PlayerPolicyCommandPreviewV2;

function termDebtPrincipal(state: GameStateV2): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      state.gameplay.debts.termDebts.reduce(
        (total, debt) => total + BigInt(debt.principalCents),
        BigInt(0),
      ),
      "action preview term debt principal",
    ),
  );
}

function liquidationRateForPreview(command: PlayerPolicyCommandV2) {
  if (command.type === "set_recurring_strategy") {
    return actionPolicyForVersionV2(ACTION_POLICY_V1_VERSION)
      .taxableLiquidationCostRatePpm;
  }
  const action = command.payload.action;
  return resolveDetailedActionPolicyV2(
    command.payload.actionPolicyVersion,
    action.type === "liquidate_taxable"
      ? action.liquidationCostRatePpm
      : undefined,
  ).taxableLiquidationCostRatePpm;
}

function automaticLiquidity(
  state: GameStateV2,
  command: PlayerPolicyCommandV2,
): MoneyCents {
  return assessV2Liquidity(
    state,
    moneyCents(0),
    liquidationRateForPreview(command),
  ).totalAutomaticLiquidityCents;
}

function policyChanges(
  opening: GameStateV2,
  resulting: GameStateV2,
  command: PlayerPolicyCommandV2,
): readonly ActionPreviewPolicyChangeV2[] {
  if (command.type === "set_recurring_strategy") {
    return Object.freeze([
      Object.freeze({
        kind: "recurring_strategy" as const,
        effectiveMonth: command.effectiveMonth,
        previous: opening.gameplay.recurringStrategy,
        resulting: resulting.gameplay.recurringStrategy,
      }),
    ]);
  }
  if (command.payload.action.type === "change_lifestyle") {
    return Object.freeze([
      Object.freeze({
        kind: "annual_living_cost" as const,
        effectiveMonth: command.effectiveMonth,
        previousAnnualLivingCostCents:
          opening.finances.annualLivingCostCents,
        resultingAnnualLivingCostCents:
          resulting.finances.annualLivingCostCents,
      }),
    ]);
  }
  return Object.freeze([]);
}

/**
 * Builds the serializable preview from an already-authoritative reduction.
 * Persistence adapters should pass the result of their full command reducer so
 * adapter-owned finalization (for example runtime-balance refresh) is included.
 */
export function buildPlayerPolicyCommandPreviewV2(
  state: GameStateV2,
  command: PlayerPolicyCommandV2,
  resulting: GameStateV2,
): DetailedActionPreviewV2 {
  const openingStateChecksum = sha256Canonical(state);
  const openingLiquidity = automaticLiquidity(state, command);
  const appendedLedgerTransactions = Object.freeze(
    resulting.ledger.transactions.slice(state.ledger.transactions.length),
  );

  return Object.freeze({
    schemaVersion: ACTION_PREVIEW_V2_SCHEMA_VERSION,
    commandType: command.type,
    actionPolicyVersion:
      command.type === "take_detailed_action"
        ? (command.payload.actionPolicyVersion ?? null)
        : null,
    commandChecksum: sha256Canonical(command),
    openingStateChecksum,
    resultingStateChecksum: sha256Canonical(resulting),
    openingRevision: state.revision,
    resultingRevision: resulting.revision,
    effects: Object.freeze({
      cashChangeCents: subtractMoney(
        resulting.finances.cashCents,
        state.finances.cashCents,
      ),
      automaticLiquidityChangeCents: subtractMoney(
        automaticLiquidity(resulting, command),
        openingLiquidity,
      ),
      termDebtPrincipalChangeCents: subtractMoney(
        termDebtPrincipal(resulting),
        termDebtPrincipal(state),
      ),
      revolvingCreditUsedChangeCents: subtractMoney(
        resulting.finances.creditUsedCents,
        state.finances.creditUsedCents,
      ),
      annualLivingCostChangeCents: subtractMoney(
        resulting.finances.annualLivingCostCents,
        state.finances.annualLivingCostCents,
      ),
      requiredObligationsChangeCents: subtractMoney(
        resulting.finances.requiredObligationsCents,
        state.finances.requiredObligationsCents,
      ),
    }),
    policyChanges: policyChanges(state, resulting, command),
    appendedLedgerTransactionIds: Object.freeze(
      appendedLedgerTransactions.map(({ id }) => id),
    ),
    appendedLedgerTransactions,
  });
}
