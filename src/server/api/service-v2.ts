import { randomUUID } from "node:crypto";

import { sha256Canonical } from "../../core/canonical";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import type { ProcessMonthV2Command } from "../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import type { TaxCalculator } from "../tax/client";
import {
  commandV2ResponseSchema,
  createRunV2ResponseSchema,
  getRunV2ResponseSchema,
  migrateRunV2ResponseSchema,
  type CommandV2Response,
  type CreateRunV2Request,
  type CreateRunV2Response,
  type GameCommandV2Public,
  type GetRunV2Response,
  type MigrateRunV2Response,
} from "./contracts-v2";
import { mapPlayerCommand } from "./v2/command-mapper";
import { RunApiV2Error } from "./v2/errors";
import { summarizeMonthlyRecord } from "./v2/monthly-record";
import type { V2Repository } from "./v2/repository-port";
import { resolveMonthlyTaxEvidence } from "./v2/tax-orchestrator";

const AUTOMATIC_LIQUIDATION_COST_RATE_PPM = ratePpm(10_000);

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
        ...(request.financialGoal
          ? {
              financialGoal: {
                ...request.financialGoal,
                desiredAnnualSpendingCents: moneyCents(
                  request.financialGoal.desiredAnnualSpendingCents,
                ),
                safeWithdrawalRatePpm: ratePpm(
                  request.financialGoal.safeWithdrawalRatePpm,
                ),
              },
            }
          : {}),
        finances: {
          ...request.finances,
          cashCents: moneyCents(request.finances.cashCents),
          taxableBroadIndexCents: moneyCents(
            request.finances.taxableBroadIndexCents,
          ),
          taxableSectorCents: moneyCents(
            request.finances.taxableSectorCents,
          ),
          taxableSpeculativeCents: moneyCents(
            request.finances.taxableSpeculativeCents,
          ),
          retirement401kCents: moneyCents(
            request.finances.retirement401kCents,
          ),
          retirementIraCents: moneyCents(
            request.finances.retirementIraCents,
          ),
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

  async migrateRun(
    runId: string,
    accessSecret: string,
  ): Promise<MigrateRunV2Response> {
    return migrateRunV2ResponseSchema.parse(
      await this.#repository.migrateRunStateToV2(runId, accessSecret),
    );
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
        mapPlayerCommand(command),
      );
      return commandV2ResponseSchema.parse({ ...result, monthlyRecord: null });
    }

    const current = await this.#repository.loadAuthorizedRunV2(
      runId,
      accessSecret,
    );
    const replayEvidence = current.acceptedCommandIds.includes(command.id)
      ? await this.#repository.loadMonthlyTaxEvidenceForCommand(
          runId,
          accessSecret,
          command.id,
        )
      : null;
    this.#validateMonthlyCommand(current, command, replayEvidence !== null);
    const evidence =
      replayEvidence ??
      (await resolveMonthlyTaxEvidence({
        state: current,
        runId,
        accessSecret,
        commandId: command.id,
        repository: this.#repository,
        taxCalculator: this.#taxCalculator,
      }));
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
        ? summarizeMonthlyRecord(applied.monthlyRecord)
        : null,
    });
  }

  #validateMonthlyCommand(
    current: Awaited<ReturnType<V2Repository["loadAuthorizedRunV2"]>>,
    command: Extract<GameCommandV2Public, { type: "process_month" }>,
    isReplay: boolean,
  ): void {
    if (isReplay) return;
    if (current.outcome) {
      throw new RunApiV2Error(
        "RUN_TERMINAL",
        "terminal runs reject monthly commands",
      );
    }
    if (current.gameplay.eventLifecycle.pending) {
      throw new RunApiV2Error(
        "PENDING_EVENT",
        "pending event choice must be resolved before monthly progression",
      );
    }
    if (command.expectedRevision !== current.revision) {
      throw new RunApiV2Error(
        "STALE_REVISION",
        "monthly command revision is stale",
      );
    }
    if (command.effectiveMonth !== current.currentMonth) {
      throw new RunApiV2Error(
        "INVALID_EFFECTIVE_MONTH",
        "monthly command month does not match the run",
      );
    }
  }
}
