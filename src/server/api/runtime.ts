import { OnboardingAiServiceV1 } from "../ai/onboarding-service-v1";
import type { CommandRunner, RunReader } from "../../application/game/use-cases";
import { AiRoleClient } from "../ai/client";
import { aiTransportFromEnvironment, getAiRoleClient } from "../ai/runtime";
import {
  GameplayDirectorService,
  gameplayDirectorConfigFromEnvironment,
  type GameplayDirector,
} from "../ai/gameplay-director-service";
import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { RunRepository } from "../db/run-repository";
import { getDatabaseConnection } from "../db/runtime";
import { createTaxCalculatorFromEnvironment } from "../tax/runtime";
import { TaxSummaryService, type TaxSummaryReader } from "../tax/summary";
import { getLocalDemoRuntime } from "../demo/runtime";
import { OnboardingService } from "./onboarding-service";
import { RunService } from "./run-service";
import { createRunReader } from "./run-reader";

let runService: RunService | undefined;
let onboardingService: OnboardingService | undefined;
let onboardingAiService: OnboardingAiServiceV1 | undefined;
let runGateway: CommandRunner | undefined;
let runReaderGateway: RunReader | undefined;
let runRepository: RunRepository | undefined;
let gameplayDirector: GameplayDirector | null | undefined;
let taxSummaryReader: TaxSummaryReader | undefined;
let demoTaxSummaryReader: TaxSummaryReader | undefined;

function getGameplayDirector(): GameplayDirector | null {
  if (gameplayDirector !== undefined) return gameplayDirector;
  const config = gameplayDirectorConfigFromEnvironment();
  if (config.mode === "off") return (gameplayDirector = null);
  try {
    let localClient: AiRoleClient | undefined;
    gameplayDirector = new GameplayDirectorService((runId) => {
      let client: AiRoleClient;
      try {
        client = getAiRoleClient(runId);
      } catch (error) {
        if (process.env.NODE_ENV !== "development") throw error;
        localClient ??= new AiRoleClient(aiTransportFromEnvironment(), {
          record: async () => undefined,
        });
        client = localClient;
      }
      return {
        generate: (request) => client.generate<"scenario_director">(request),
        responseSource: () => client.responseSource(),
      };
    }, config);
  } catch {
    gameplayDirector = null;
  }
  return gameplayDirector;
}

export function getRunRepository(): RunRepository {
  if (!runRepository) {
    const connection = getDatabaseConnection();
    runRepository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
  }
  return runRepository;
}

export function getRunService(): RunService {
  if (!runService) {
    runService = new RunService(
      getRunRepository(),
      createTaxCalculatorFromEnvironment(),
      undefined,
      {},
      getGameplayDirector(),
    );
  }
  return runService;
}

export function getRunGateway(): CommandRunner {
  if (!runGateway) {
    const demo = getLocalDemoRuntime();
    demo.configureGameplayDirector(getGameplayDirector());
    runGateway = demo.createRunGateway(getRunService);
  }
  return runGateway;
}

export function getRunReaderGateway(): RunReader {
  if (!runReaderGateway) {
    const persistentReader = createRunReader(getRunRepository());
    runReaderGateway = getLocalDemoRuntime().createRunReaderGateway(
      () => persistentReader,
    );
  }
  return runReaderGateway;
}

export function isLocalDemoRun(runId: string): boolean {
  return getLocalDemoRuntime().hasRun(runId);
}

export function getTaxSummaryReader(): TaxSummaryReader {
  if (!taxSummaryReader) {
    taxSummaryReader = new TaxSummaryService(
      getRunRepository(),
      createTaxCalculatorFromEnvironment(),
    );
  }
  return taxSummaryReader;
}

export function getDemoTaxSummaryReader(): TaxSummaryReader {
  demoTaxSummaryReader ??= getLocalDemoRuntime().createTaxSummaryReader();
  return demoTaxSummaryReader;
}

export function getOnboardingService(): OnboardingService {
  if (!onboardingService) {
    onboardingService = new OnboardingService(getRunRepository());
  }
  return onboardingService;
}

export function getOnboardingAiService(): OnboardingAiServiceV1 {
  if (!onboardingAiService) {
    try {
      onboardingAiService = new OnboardingAiServiceV1(getAiRoleClient(null));
    } catch {
      onboardingAiService = new OnboardingAiServiceV1(null);
    }
  }
  return onboardingAiService;
}
