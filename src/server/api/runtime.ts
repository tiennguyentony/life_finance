import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { databaseConnectionFromEnvironment } from "../db/client";
import { RunRepository } from "../db/run-repository";
import { RunApiService } from "./service";

let service: RunApiService | undefined;

export function getRunApiService(): RunApiService {
  if (!service) {
    const connection = databaseConnectionFromEnvironment();
    const repository = new RunRepository(
      connection.db,
      runSecretCodecFromEnvironment(),
    );
    service = new RunApiService(repository);
  }
  return service;
}
