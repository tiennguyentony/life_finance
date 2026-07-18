import type { RunReader } from "@/application/game/use-cases";
import { sha256Canonical } from "@/core/canonical";
import type { RunRepository } from "@/server/db/run-repository";

import { getRunV2ResponseSchema } from "./contracts-v2";

type ReadRepository = Pick<RunRepository, "loadAuthorizedRunV2">;

/** Read-only run access that deliberately does not initialize tax services. */
export function createRunReader(repository: ReadRepository): RunReader {
  return Object.freeze({
    async getRun(runId: string, accessSecret: string) {
      const state = await repository.loadAuthorizedRunV2(runId, accessSecret);
      return getRunV2ResponseSchema.parse({
        state,
        stateChecksum: sha256Canonical(state),
      });
    },
  });
}
