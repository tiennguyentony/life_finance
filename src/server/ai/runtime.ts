import { getDatabaseConnection } from "../db/runtime";
import { auditCipherFromEnvironment, type AiAuditCipher } from "./audit-crypto";
import {
  AiAuditAdminAuthorizer,
  AiAuditRepository,
  auditAdminAuthorizerFromEnvironment,
} from "./audit-repository";
import {
  AiRoleClient,
  OpenAiResponsesTransport,
  type AiResponsesTransport,
} from "./client";

type AiRuntimeDependencies = Readonly<{
  transport: AiResponsesTransport;
  cipher: AiAuditCipher;
  adminAuthorizer: AiAuditAdminAuthorizer;
}>;

let dependencies: AiRuntimeDependencies | undefined;

function getAiRuntimeDependencies(): AiRuntimeDependencies {
  dependencies ??= Object.freeze({
    transport: new OpenAiResponsesTransport(),
    cipher: auditCipherFromEnvironment(),
    adminAuthorizer: auditAdminAuthorizerFromEnvironment(),
  });
  return dependencies;
}

export function getAiAuditRepository(runId: string | null = null): AiAuditRepository {
  const runtime = getAiRuntimeDependencies();
  return new AiAuditRepository(
    getDatabaseConnection().db,
    runtime.cipher,
    runtime.adminAuthorizer,
    { runId },
  );
}

export function getAiRoleClient(runId: string | null = null): AiRoleClient {
  const runtime = getAiRuntimeDependencies();
  return new AiRoleClient(runtime.transport, getAiAuditRepository(runId));
}
