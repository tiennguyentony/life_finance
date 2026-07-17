import { runSecretCodecFromEnvironment } from "../auth/run-secret";
import { getDatabaseConnection } from "../db/runtime";
import { RunRepository } from "../db/run-repository";
import { TeachingServiceV2 } from "./service-v2";
import { requestTeachingRewriteFromEnvironmentV2 } from "./rewrite-provider-v2";
import { TeachingRewriteServiceV2 } from "./rewrite-service-v2";

let service: TeachingServiceV2 | undefined;
let rewriteService: TeachingRewriteServiceV2 | undefined;

export function getTeachingServiceV2(): TeachingServiceV2 {
  if (!service) {
    const connection = getDatabaseConnection();
    service = new TeachingServiceV2(
      new RunRepository(connection.db, runSecretCodecFromEnvironment()),
    );
  }
  return service;
}

export function getTeachingRewriteServiceV2(): TeachingRewriteServiceV2 {
  if (!rewriteService) {
    const connection = getDatabaseConnection();
    rewriteService = new TeachingRewriteServiceV2(
      new RunRepository(connection.db, runSecretCodecFromEnvironment()),
      requestTeachingRewriteFromEnvironmentV2,
    );
  }
  return rewriteService;
}
