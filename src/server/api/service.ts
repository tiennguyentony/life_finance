import { randomUUID } from "node:crypto";

import { sha256Canonical } from "../../core/canonical";
import type { GameCommand } from "../../core/commands";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { createInitialGameState } from "../../core/game-state";
import type { RunRepository } from "../db/run-repository";
import type {
  CommandRequest,
  CommandResponse,
  CreateRunRequest,
  CreateRunResponse,
  GetRunResponse,
} from "./contracts";
import {
  commandResponseSchema,
  createRunResponseSchema,
  getRunResponseSchema,
} from "./contracts";

function brandedFinances(request: CreateRunRequest) {
  return {
    cashCents: moneyCents(request.finances.cashCents),
    taxableInvestmentsCents: moneyCents(request.finances.taxableInvestmentsCents),
    retirementCents: moneyCents(request.finances.retirementCents),
    homeValueCents: moneyCents(request.finances.homeValueCents),
    otherInvestableAssetsCents: moneyCents(
      request.finances.otherInvestableAssetsCents,
    ),
    otherAssetsCents: moneyCents(request.finances.otherAssetsCents),
    nonCreditLiabilitiesCents: moneyCents(
      request.finances.nonCreditLiabilitiesCents,
    ),
    creditLimitCents: moneyCents(request.finances.creditLimitCents),
    creditUsedCents: moneyCents(request.finances.creditUsedCents),
    annualLivingCostCents: moneyCents(request.finances.annualLivingCostCents),
    requiredObligationsCents: moneyCents(
      request.finances.requiredObligationsCents,
    ),
  };
}

export class RunApiService {
  readonly #repository: Pick<
    RunRepository,
    "createRun" | "loadAuthorizedRun" | "applyCommand"
  >;
  readonly #playerIdFactory: () => string;

  constructor(
    repository: Pick<
      RunRepository,
      "createRun" | "loadAuthorizedRun" | "applyCommand"
    >,
    playerIdFactory: () => string = () => `player_${randomUUID()}`,
  ) {
    this.#repository = repository;
    this.#playerIdFactory = playerIdFactory;
  }

  async createRun(request: CreateRunRequest): Promise<CreateRunResponse> {
    const created = await this.#repository.createRun((runId) =>
      createInitialGameState({
        runId,
        startMonth: request.startMonth,
        randomSeed: request.randomSeed,
        player: {
          ...request.player,
          playerId: this.#playerIdFactory(),
        },
        finances: brandedFinances(request),
        wellbeing: {
          burnoutPpm: ratePpm(request.wellbeing.burnoutPpm),
          happinessPpm: ratePpm(request.wellbeing.happinessPpm),
        },
        marketRegime: request.marketRegime,
      }),
    );
    return createRunResponseSchema.parse({
      runId: created.runId,
      accessSecret: created.accessSecret,
      state: created.state,
      stateChecksum: created.stateChecksum,
    });
  }

  async getRun(runId: string, accessSecret: string): Promise<GetRunResponse> {
    const state = await this.#repository.loadAuthorizedRun(runId, accessSecret);
    return getRunResponseSchema.parse({
      state,
      stateChecksum: sha256Canonical(state),
    });
  }

  async submitCommand(
    runId: string,
    accessSecret: string,
    command: CommandRequest,
  ): Promise<CommandResponse> {
    const result = await this.#repository.applyCommand(
      runId,
      accessSecret,
      command as GameCommand,
    );
    return commandResponseSchema.parse({
      state: result.state,
      stateChecksum: result.stateChecksum,
      idempotentReplay: result.idempotentReplay,
    });
  }
}
