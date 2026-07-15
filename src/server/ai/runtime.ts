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
import { OllamaGptOssTransport } from "./ollama-transport";

type AiRuntimeDependencies = Readonly<{
  transport: AiResponsesTransport;
  cipher: AiAuditCipher;
  adminAuthorizer: AiAuditAdminAuthorizer;
}>;

let dependencies: AiRuntimeDependencies | undefined;

export function aiTransportFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiResponsesTransport {
  const provider = environment.AI_PROVIDER ?? "openai";
  if (provider === "openai") {
    return new OpenAiResponsesTransport({ apiKey: environment.OPENAI_API_KEY });
  }
  if (provider === "ollama") {
    if (environment.VERCEL_ENV === "production") {
      throw new Error("Ollama is restricted to local development");
    }
    return new OllamaGptOssTransport({ baseUrl: environment.OLLAMA_BASE_URL });
  }
  throw new Error("AI_PROVIDER must be openai or ollama");
}

function getAiRuntimeDependencies(): AiRuntimeDependencies {
  dependencies ??= Object.freeze({
    transport: aiTransportFromEnvironment(),
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
