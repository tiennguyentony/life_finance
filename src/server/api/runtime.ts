import { OnboardingAiServiceV1 } from "../ai/onboarding-service-v1";
import type { CommandRunner } from "../../application/game/use-cases";
import { getAiRoleClient } from "../ai/runtime";
import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { RunRepository } from "../db/run-repository";
import { getDatabaseConnection } from "../db/runtime";
import { createTaxClientFromEnvironment } from "../tax/client";
import { getLocalDemoRuntime } from "../demo/runtime";
import { OnboardingService } from "./onboarding-service";
import { RunService } from "./run-service";

let runService: RunService | undefined;
let onboardingService: OnboardingService | undefined;
let onboardingAiService: OnboardingAiServiceV1 | undefined;
let runGateway: CommandRunner | undefined;
let runRepository: RunRepository | undefined;

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
      createTaxClientFromEnvironment(),
    );
  }
  return runService;
}

export function getRunGateway(): CommandRunner {
  if (!runGateway) {
    runGateway = getLocalDemoRuntime().createRunGateway(getRunService);
  }
  return runGateway;
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
