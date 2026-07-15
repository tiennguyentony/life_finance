import { randomUUID } from "node:crypto";

import { sha256Canonical } from "../../core/canonical";
import type {
  DetailedFinanceCommand,
  DetailedFinancialAction,
} from "../../core/detailed-actions-v2";
import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "../../core/domain/integer";
import {
  addMoney,
  allocateMoney,
  moneyCents,
  ratePpm,
} from "../../core/domain/money";
import { monthsBetween, simulationMonth } from "../../core/domain/month";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import type { ResolveEventChoiceV2Command } from "../../core/event-lifecycle-v2";
import type {
  MonthlyTurnV2Record,
  ProcessMonthV2Command,
} from "../../core/monthly-turn-v2";
import {
  planRecurringAllocations,
  type SetRecurringStrategyCommand,
} from "../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import type { RunRepository } from "../db/run-repository";
import type { TaxCalculator } from "../tax/client";
import {
  FROZEN_POLICY_YEAR,
  taxCalculationRequestSchema,
} from "../tax/contracts";
import {
  commandV2ResponseSchema,
  createRunV2ResponseSchema,
  getRunV2ResponseSchema,
  type CommandV2Response,
  type CreateRunV2Request,
  type CreateRunV2Response,
  type GameCommandV2Public,
  type GetRunV2Response,
} from "./contracts-v2";

const AUTOMATIC_LIQUIDATION_COST_RATE_PPM = ratePpm(10_000);

export class RunApiV2Error extends Error {
  readonly code:
    | "STALE_REVISION"
    | "INVALID_EFFECTIVE_MONTH"
    | "RUN_TERMINAL"
    | "PENDING_EVENT"
    | "TAX_CONTEXT_MISMATCH"
    | "TAX_RESULT_UNUSABLE";

  constructor(code: RunApiV2Error["code"], message: string) {
    super(message);
    this.name = "RunApiV2Error";
    this.code = code;
  }
}

type V2Repository = Pick<
  RunRepository,
  | "createRunV2"
  | "loadAuthorizedRunV2"
  | "applyCommandV2"
  | "loadMonthlyTaxEvidenceForCommand"
  | "loadCheckpointEvidenceV2"
>;

function annualCpiPpm(state: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>) {
  const initialLivingCost = state.gameplay.catalogSnapshot?.derived.annualLivingCostCents;
  if (!initialLivingCost || initialLivingCost <= 0) return 1_000_000;
  return Math.max(
    1,
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(state.finances.annualLivingCostCents) * BigInt(1_000_000),
        BigInt(initialLivingCost),
      ),
      "cumulative price index",
    ),
  );
}

function emptyIncome() {
  return {
    w2Jobs: [],
    selfEmploymentNetProfitCents: 0,
    contractorNetProfitCents: 0,
    taxableInterestCents: 0,
    taxExemptInterestCents: 0,
    ordinaryDividendsCents: 0,
    qualifiedDividendsCents: 0,
    shortTermCapitalGainsCents: 0,
    longTermCapitalGainsCents: 0,
    rentalNetIncomeCents: 0,
    pensionIncomeCents: 0,
    iraDistributionsCents: 0,
    socialSecurityBenefitsCents: 0,
    unemploymentCompensationCents: 0,
    otherTaxableIncomeCents: 0,
  };
}

function buildTaxRequest(
  state: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>,
  commandId: string,
) {
  const snapshot = state.gameplay.catalogSnapshot;
  const employment = state.gameplay.employment;
  if (!snapshot || employment.status !== "employed") {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "monthly processing requires a native employed v2 run",
    );
  }
  const annualPlan = planRecurringAllocations(
    state,
    employment.annualGrossSalaryCents,
    moneyCents(0),
  );
  const ageYears = Math.max(
    0,
    Math.floor(monthsBetween(state.player.birthMonth, state.currentMonth) / 12),
  );
  const household = snapshot.selected.household;
  const people: unknown[] = [
    {
      id: "tax.primary",
      role: "primary" as const,
      ageYears,
      isBlind: false,
      isFullTimeStudent: false,
      income: {
        ...emptyIncome(),
        w2Jobs: [
          {
            id: "job.primary",
            wagesCents: employment.annualGrossSalaryCents,
            pretaxRetirementContributionsCents: addMoney(
              state.gameplay.contributions.employee401kCents,
              annualPlan.preTax.employee401kCents,
            ),
            pretaxHealthContributionsCents: addMoney(
              state.gameplay.contributions.hsaCents,
              annualPlan.preTax.hsaCents,
            ),
          },
        ],
      },
    },
  ];
  if (household.adultCount > 1) {
    people.push({
      id: "tax.spouse",
      role: "spouse" as const,
      ageYears,
      isBlind: false,
      isFullTimeStudent: false,
      income: emptyIncome(),
    });
  }
  for (let dependent = 0; dependent < household.dependentCount; dependent += 1) {
    people.push({
      id: `tax.dependent.${dependent + 1}`,
      role: "dependent" as const,
      ageYears: 10,
      isBlind: false,
      isFullTimeStudent: true,
      income: emptyIncome(),
    });
  }
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: `tax.${commandId}`,
    economicYear: Number(state.currentMonth.slice(0, 4)),
    policyYear: FROZEN_POLICY_YEAR,
    cumulativePriceIndexPpm: annualCpiPpm(state),
    stateCode: snapshot.derived.stateCode,
    filingStatus: snapshot.derived.filingStatus,
    people,
    deductions: {},
  });
}

function monthlyRecordSummary(record: MonthlyTurnV2Record) {
  return {
    processedMonth: record.processedMonth,
    nextMonth: record.nextMonth,
    taxTraceId: record.taxTraceId,
    grossIncomeCents: record.grossIncomeCents,
    totalTaxCents: record.totalTaxCents,
    afterTaxCashIncomeCents: record.afterTaxCashIncomeCents,
    market: record.market,
    marketValueChangeCents: record.marketValueChangeCents,
    annualInflationIncreaseCents: record.annualInflationIncreaseCents,
    insurancePlayerCostCents: record.insurancePlayerCostCents,
    requiredCashCents: record.requiredCashCents,
    nonDebtObligationsPaidCents: record.nonDebtObligationsPaidCents,
    debtService: record.debtService,
    funding: record.funding,
    recurringAllocations: record.recurringAllocations,
    outcome: record.outcome,
  };
}

function internalPlayerCommand(
  command: Exclude<GameCommandV2Public, { type: "process_month" }>,
): DetailedFinanceCommand | SetRecurringStrategyCommand | ResolveEventChoiceV2Command {
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

export class RunApiServiceV2 {
  readonly #repository: V2Repository;
  readonly #taxCalculator: TaxCalculator;
  readonly #playerIdFactory: () => string;

  constructor(
    repository: V2Repository,
    taxCalculator: TaxCalculator,
    playerIdFactory: () => string = () => `player_${randomUUID()}`,
  ) {
    this.#repository = repository;
    this.#taxCalculator = taxCalculator;
    this.#playerIdFactory = playerIdFactory;
  }

  async createRun(request: CreateRunV2Request): Promise<CreateRunV2Response> {
    if (request.catalogVersion !== US_2026_SCENARIO_CATALOG_VERSION) {
      throw new TypeError("unsupported scenario catalog version");
    }
    const resolvedScenario = resolveScenarioCatalogSelection(
      US_2026_SCENARIO_CATALOG,
      {
        catalogVersion: request.catalogVersion,
        locationId: request.locationId,
        careerId: request.careerId,
        householdId: request.householdId,
        benefitsPackageId: request.benefitsPackageId,
        healthPlanId: request.healthPlanId,
        retirementPlanId: request.retirementPlanId,
        insuranceCoverageIds: request.insuranceCoverageIds,
        scenarioId: request.scenarioId,
      },
    );
    const created = await this.#repository.createRunV2((runId) =>
      createNativeGameStateV2({
        runId,
        playerId: this.#playerIdFactory(),
        birthMonth: simulationMonth(request.birthMonth),
        startMonth: simulationMonth(request.startMonth),
        randomSeed: String(request.randomSeed),
        resolvedScenario,
        annualGrossSalaryCents: moneyCents(request.annualGrossSalaryCents),
        finances: {
          ...request.finances,
          cashCents: moneyCents(request.finances.cashCents),
          taxableBroadIndexCents: moneyCents(
            request.finances.taxableBroadIndexCents,
          ),
          taxableSectorCents: moneyCents(request.finances.taxableSectorCents),
          taxableSpeculativeCents: moneyCents(
            request.finances.taxableSpeculativeCents,
          ),
          retirement401kCents: moneyCents(request.finances.retirement401kCents),
          retirementIraCents: moneyCents(request.finances.retirementIraCents),
          hsaCents: moneyCents(request.finances.hsaCents),
          homeValueCents: moneyCents(request.finances.homeValueCents),
          otherAssetsCents: moneyCents(request.finances.otherAssetsCents),
          termDebts: request.finances.termDebts.map((debt) => ({
            ...debt,
            principalCents: moneyCents(debt.principalCents),
            annualInterestRatePpm: ratePpm(debt.annualInterestRatePpm),
            minimumPaymentCents: moneyCents(debt.minimumPaymentCents),
          })),
          revolvingCreditLimitCents: moneyCents(
            request.finances.revolvingCreditLimitCents,
          ),
          revolvingCreditUsedCents: moneyCents(
            request.finances.revolvingCreditUsedCents,
          ),
        },
        wellbeing: {
          burnoutPpm: ratePpm(request.wellbeing.burnoutPpm),
          happinessPpm: ratePpm(request.wellbeing.happinessPpm),
        },
        marketRegime: request.marketRegime,
      }),
    );
    return createRunV2ResponseSchema.parse({
      runId: created.runId,
      accessSecret: created.accessSecret,
      state: created.state,
      stateChecksum: created.stateChecksum,
    });
  }

  async getRun(runId: string, accessSecret: string): Promise<GetRunV2Response> {
    const state = await this.#repository.loadAuthorizedRunV2(runId, accessSecret);
    return getRunV2ResponseSchema.parse({
      state,
      stateChecksum: sha256Canonical(state),
    });
  }

  async getCheckpoint(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ) {
    return {
      evidence: await this.#repository.loadCheckpointEvidenceV2(
        runId,
        accessSecret,
        fromRevision,
      ),
    };
  }

  async submitCommand(
    runId: string,
    accessSecret: string,
    command: GameCommandV2Public,
  ): Promise<CommandV2Response> {
    if (command.type !== "process_month") {
      const result = await this.#repository.applyCommandV2(
        runId,
        accessSecret,
        internalPlayerCommand(command),
      );
      return commandV2ResponseSchema.parse({ ...result, monthlyRecord: null });
    }

    const current = await this.#repository.loadAuthorizedRunV2(runId, accessSecret);
    const replayEvidence = current.acceptedCommandIds.includes(command.id)
      ? await this.#repository.loadMonthlyTaxEvidenceForCommand(
          runId,
          accessSecret,
          command.id,
        )
      : null;
    if (current.outcome && !replayEvidence) {
      throw new RunApiV2Error("RUN_TERMINAL", "terminal runs reject monthly commands");
    }
    if (current.gameplay.eventLifecycle.pending && !replayEvidence) {
      throw new RunApiV2Error(
        "PENDING_EVENT",
        "pending event choice must be resolved before monthly progression",
      );
    }
    if (!replayEvidence && command.expectedRevision !== current.revision) {
      throw new RunApiV2Error("STALE_REVISION", "monthly command revision is stale");
    }
    if (!replayEvidence && command.effectiveMonth !== current.currentMonth) {
      throw new RunApiV2Error(
        "INVALID_EFFECTIVE_MONTH",
        "monthly command month does not match the run",
      );
    }

    let evidence = replayEvidence;
    if (!evidence) {
      const request = buildTaxRequest(current, command.id);
      const result = await this.#taxCalculator.calculate(request);
      if (
        result.traceId !== request.traceId ||
        result.economicYear !== request.economicYear ||
        result.policyYear !== request.policyYear ||
        result.stateCode !== request.stateCode ||
        result.filingStatus !== request.filingStatus ||
        result.annualGrossIncomeCents !==
          current.gameplay.employment.annualGrossSalaryCents
      ) {
        throw new RunApiV2Error(
          "TAX_CONTEXT_MISMATCH",
          "tax result does not match the authoritative run context",
        );
      }
      const monthlyGross = allocateMoney(
        current.gameplay.employment.annualGrossSalaryCents,
        1,
        12,
      );
      const monthlyPlan = planRecurringAllocations(
        current,
        monthlyGross,
        moneyCents(0),
      );
      const monthlyTax = allocateMoney(moneyCents(result.totalTaxCents), 1, 12);
      const afterTaxCash = safeBigIntToNumber(
        BigInt(monthlyGross) -
          BigInt(monthlyPlan.preTax.employee401kCents) -
          BigInt(monthlyPlan.preTax.hsaCents) -
          BigInt(monthlyTax),
        "monthly after-tax cash",
      );
      if (afterTaxCash < 0) {
        throw new RunApiV2Error(
          "TAX_RESULT_UNUSABLE",
          "tax result leaves negative monthly payroll cash",
        );
      }
      evidence = {
        schemaVersion: 1,
        traceId: result.traceId,
        economicYear: result.economicYear,
        policyYear: result.policyYear,
        stateCode: result.stateCode,
        filingStatus: result.filingStatus,
        provider: result.model.provider,
        bundleVersion: result.model.bundleVersion,
        rulesVersion: result.model.rulesVersion,
        projectedFromFrozenPolicy: result.model.projectedFromFrozenPolicy,
        grossIncomeCents: monthlyGross,
        employee401kContributionCents:
          monthlyPlan.preTax.employee401kCents,
        employeeHsaContributionCents: monthlyPlan.preTax.hsaCents,
        totalTaxCents: monthlyTax,
        afterTaxCashIncomeCents: moneyCents(afterTaxCash),
      };
    }
    const internal: ProcessMonthV2Command = {
      schemaVersion: 2,
      id: command.id,
      type: "process_month_v2",
      expectedRevision: command.expectedRevision,
      effectiveMonth: simulationMonth(command.effectiveMonth),
      payload: {
        taxEvidence: evidence,
        taxableLiquidationCostRatePpm: AUTOMATIC_LIQUIDATION_COST_RATE_PPM,
      },
    };
    const applied = await this.#repository.applyCommandV2(
      runId,
      accessSecret,
      internal,
    );
    return commandV2ResponseSchema.parse({
      ...applied,
      monthlyRecord: applied.monthlyRecord
        ? monthlyRecordSummary(applied.monthlyRecord)
        : null,
    });
  }
}
