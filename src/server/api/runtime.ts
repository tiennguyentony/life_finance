import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { RunRepository } from "../db/run-repository";
import { getDatabaseConnection } from "../db/runtime";
import { RunApiService } from "./service";

let service: RunApiService | undefined;

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
