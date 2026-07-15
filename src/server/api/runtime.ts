import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { RunRepository } from "../db/run-repository";
import { getDatabaseConnection } from "../db/runtime";
import { RunApiService } from "./service";
import { createTaxClientFromEnvironment } from "../tax/client";
import { RunApiServiceV2 } from "./service-v2";

let service: RunApiService | undefined;
let serviceV2: RunApiServiceV2 | undefined;

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
