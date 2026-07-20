import { OnboardingAiServiceV1 } from "../ai/onboarding-service-v1";
import { InteractiveEventService } from "../ai/interactive-event-service";
import { CharacterBanterService } from "../ai/character-banter-service";
import type { CommandRunner, RunReader } from "../../application/game/use-cases";
import { AiRoleClient } from "../ai/client";
import {
  aiTransportFromEnvironment,
  getAiAuditRepository,
  getAiRoleClient,
} from "../ai/runtime";
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
let interactiveEventService: InteractiveEventService | undefined;
let characterBanterService: CharacterBanterService | undefined;

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
    // Lazy: demo runs must stay readable without a database configured.
    let persistentReader: RunReader | undefined;
    runReaderGateway = getLocalDemoRuntime().createRunReaderGateway(
      () => (persistentReader ??= createRunReader(getRunRepository())),
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

export function getInteractiveEventService(): InteractiveEventService {
  if (!interactiveEventService) {
    try {
      const interactiveTimeoutMs = process.env.AI_PROVIDER === "ollama"
        ? 2_500
        : 1_500;
      const recommendationTimeoutMs = process.env.AI_PROVIDER === "ollama"
        ? 8_000
        : 3_000;
      const client = new AiRoleClient(
        aiTransportFromEnvironment(process.env, {
          // The service keeps ordinary interpretation on its shorter outer
          // deadline. The transport must remain alive long enough for the
          // explicitly requested, richer recommendation path.
          timeoutMs: recommendationTimeoutMs,
          ollamaModel:
            process.env.AI_INTERACTIVE_OLLAMA_MODEL ??
            "qwen2.5:7b-instruct",
        }),
        process.env.NODE_ENV === "development"
          ? { record: async () => undefined }
          : getAiAuditRepository(null),
        { maxTransportRetries: 0, maxSchemaRetries: 0 },
      );
      interactiveEventService = new InteractiveEventService(
        {
          generate: (request) => client.generate<"event_interpreter">(request),
          responseSource: () => client.responseSource(),
        },
        interactiveTimeoutMs,
        recommendationTimeoutMs,
      );
    } catch {
      interactiveEventService = new InteractiveEventService(null);
    }
  }
  return interactiveEventService;
}

export function getCharacterBanterService(): CharacterBanterService {
  if (!characterBanterService) {
    try {
      // The 7B local writer is usually warm in about a second, but needs a
      // wider first-call window while Ollama loads it into memory. This work is
      // asynchronous and never blocks the monthly command.
      const timeoutMs = process.env.AI_PROVIDER === "ollama" ? 8_000 : 2_000;
      const transport = aiTransportFromEnvironment(process.env, {
        timeoutMs,
        ollamaModel:
          process.env.AI_BANTER_OLLAMA_MODEL ??
          "qwen2.5:7b-instruct",
      });
      let developmentClient: AiRoleClient | undefined;
      characterBanterService = new CharacterBanterService((runId) => {
        if (process.env.NODE_ENV === "development") {
          developmentClient ??= new AiRoleClient(
            transport,
            { record: async () => undefined },
            { maxTransportRetries: 0, maxSchemaRetries: 1 },
          );
          return {
            generate: (request) =>
              developmentClient!.generate<"banter_writer">(request),
            responseSource: () => developmentClient!.responseSource(),
          };
        }
        const client = new AiRoleClient(
          transport,
          getAiAuditRepository(runId),
          { maxTransportRetries: 0, maxSchemaRetries: 1 },
        );
        return {
          generate: (request) => client.generate<"banter_writer">(request),
          responseSource: () => client.responseSource(),
        };
      });
    } catch {
      characterBanterService = new CharacterBanterService(() => null);
    }
  }
  return characterBanterService;
}
