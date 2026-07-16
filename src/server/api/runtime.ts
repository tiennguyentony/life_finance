import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { RunRepository } from "../db/run-repository";
import { getDatabaseConnection } from "../db/runtime";
import { RunApiService } from "./service";
import { createTaxClientFromEnvironment } from "../tax/client";
import { RunApiServiceV2 } from "./service-v2";
import { AiEducationService } from "../ai/education-service";
import { getAiRoleClient } from "../ai/runtime";
import { AiWorldDirectorService } from "../ai/world-director-service";
import { AiDebriefService } from "../ai/debrief-service";
import { OnboardingApiServiceV1 } from "./onboarding-service-v1";
import { OnboardingAiServiceV1 } from "../ai/onboarding-service-v1";

let service: RunApiService | undefined;
let serviceV2: RunApiServiceV2 | undefined;
let aiEducationService: AiEducationService | undefined;
let aiWorldDirectorService: AiWorldDirectorService | undefined;
let aiDebriefService: AiDebriefService | undefined;
let onboardingApiServiceV1: OnboardingApiServiceV1 | undefined;
let onboardingAiServiceV1: OnboardingAiServiceV1 | undefined;

export function getRunApiService(): RunApiService {
  if (!service) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    service = new RunApiService(repository);
  }
  return service;
}

export function getAiEducationService(): AiEducationService {
  if (!aiEducationService) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    aiEducationService = new AiEducationService(
      repository,
      (runId) => getAiRoleClient(runId),
    );
  }
  return aiEducationService;
}

export function getAiWorldDirectorService(): AiWorldDirectorService {
  if (!aiWorldDirectorService) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    aiWorldDirectorService = new AiWorldDirectorService(
      repository,
      (runId) => getAiRoleClient(runId),
    );
  }
  return aiWorldDirectorService;
}

export function getAiDebriefService(): AiDebriefService {
  if (!aiDebriefService) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(connection.db, runSecretCodecFromEnvironment());
    aiDebriefService = new AiDebriefService(repository, (runId) => getAiRoleClient(runId));
  }
  return aiDebriefService;
}

export function getRunApiServiceV2(): RunApiServiceV2 {
  if (!serviceV2) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    serviceV2 = new RunApiServiceV2(
      repository,
      createTaxClientFromEnvironment(),
    );
  }
  return serviceV2;
}

export function getOnboardingApiServiceV1(): OnboardingApiServiceV1 {
  if (!onboardingApiServiceV1) {
    const connection = getDatabaseConnection();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    onboardingApiServiceV1 = new OnboardingApiServiceV1(repository);
  }
  return onboardingApiServiceV1;
}

export function getOnboardingAiServiceV1(): OnboardingAiServiceV1 {
  if (!onboardingAiServiceV1) {
    try {
      onboardingAiServiceV1 = new OnboardingAiServiceV1(getAiRoleClient(null));
    } catch {
      onboardingAiServiceV1 = new OnboardingAiServiceV1(null);
    }
  }
  return onboardingAiServiceV1;
}
