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

let service: RunApiService | undefined;
let serviceV2: RunApiServiceV2 | undefined;
let aiEducationService: AiEducationService | undefined;
let aiWorldDirectorService: AiWorldDirectorService | undefined;
let aiDebriefService: AiDebriefService | undefined;

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
