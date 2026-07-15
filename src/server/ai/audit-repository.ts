import { createHash, timingSafeEqual } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import type { LifeFinanceDatabase } from "../db/client";
import { aiAuditRecords } from "../db/schema";
import {
  AiAuditCipher,
  type AiAuditMetadata,
  type AiAuditPlaintext,
} from "./audit-crypto";
import type { AiAuditRecord, AiAuditRecorder } from "./client";
import type { AiRole } from "./contracts";

const ADMIN_TOKEN_PATTERN = /^Bearer (lf_audit_[A-Za-z0-9_-]{43})$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AiAuditAccessError extends Error {
  readonly code: "INVALID_CONFIGURATION" | "UNAUTHORIZED";

  constructor(code: AiAuditAccessError["code"], message: string) {
    super(message);
    this.name = "AiAuditAccessError";
    this.code = code;
  }
}

export class AiAuditRepositoryError extends Error {
  readonly code: "INVALID_RECORD" | "PERSISTENCE_FAILURE" | "CORRUPT_RECORD";

  constructor(
    code: AiAuditRepositoryError["code"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiAuditRepositoryError";
    this.code = code;
  }
}

function digestToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export class AiAuditAdminAuthorizer {
  readonly #expectedDigest: Buffer;

  constructor(token: string) {
    if (!/^lf_audit_[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new AiAuditAccessError(
        "INVALID_CONFIGURATION",
        "AI audit administrator token must contain 256 bits of base64url entropy",
      );
    }
    this.#expectedDigest = digestToken(token);
  }

  assertAuthorized(authorizationHeader: string | null): void {
    const candidate = authorizationHeader?.match(ADMIN_TOKEN_PATTERN)?.[1] ?? "";
    const candidateDigest = digestToken(candidate);
    const matches = timingSafeEqual(candidateDigest, this.#expectedDigest);
    if (!matches || candidate.length === 0) {
      throw new AiAuditAccessError(
        "UNAUTHORIZED",
        "valid AI audit administrator authorization is required",
      );
    }
  }
}

export function auditAdminAuthorizerFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiAuditAdminAuthorizer {
  const token = environment.AI_AUDIT_ADMIN_TOKEN;
  if (!token) {
    throw new AiAuditAccessError(
      "INVALID_CONFIGURATION",
      "AI_AUDIT_ADMIN_TOKEN is required",
    );
  }
  return new AiAuditAdminAuthorizer(token);
}

export type DecryptedAiAuditRecord = Readonly<{
  metadata: AiAuditMetadata;
  content: AiAuditPlaintext;
}>;

function rowMetadata(row: typeof aiAuditRecords.$inferSelect): AiAuditMetadata {
  return Object.freeze({
    invocationId: row.invocationId,
    runId: row.runId,
    contractVersion: row.contractVersion,
    role: row.role as AiRole,
    model: row.model,
    outcome: row.outcome as AiAuditRecord["outcome"],
    attemptCount: row.attemptCount,
    createdAt: row.createdAt.toISOString(),
  });
}

export class AiAuditRepository implements AiAuditRecorder {
  constructor(
    private readonly db: LifeFinanceDatabase,
    private readonly cipher: AiAuditCipher,
    private readonly adminAuthorizer: AiAuditAdminAuthorizer,
    private readonly context: Readonly<{
      runId?: string | null;
      clock?: () => Date;
    }> = {},
  ) {}

  async record(record: AiAuditRecord): Promise<void> {
    const runId = this.context.runId ?? null;
    if (
      !UUID_V4_PATTERN.test(record.invocationId) ||
      (runId !== null && !UUID_V4_PATTERN.test(runId)) ||
      record.attempts.length < 1 ||
      record.attempts.length > 8
    ) {
      throw new AiAuditRepositoryError(
        "INVALID_RECORD",
        "AI audit record has invalid identifiers or attempt count",
      );
    }
    const createdAt = this.context.clock?.() ?? new Date();
    if (Number.isNaN(createdAt.getTime())) {
      throw new AiAuditRepositoryError("INVALID_RECORD", "AI audit timestamp is invalid");
    }
    const metadata: AiAuditMetadata = {
      invocationId: record.invocationId,
      runId,
      contractVersion: record.contractVersion,
      role: record.role,
      model: record.model,
      outcome: record.outcome,
      attemptCount: record.attempts.length,
      createdAt: createdAt.toISOString(),
    };
    const envelope = this.cipher.encrypt(metadata, {
      prompt: record.prompt,
      attempts: record.attempts,
    });

    try {
      await this.db.insert(aiAuditRecords).values({
        invocationId: metadata.invocationId,
        runId: metadata.runId,
        contractVersion: metadata.contractVersion,
        role: metadata.role,
        model: metadata.model,
        outcome: metadata.outcome,
        attemptCount: metadata.attemptCount,
        keyVersion: envelope.keyVersion,
        initializationVector: envelope.initializationVector,
        authenticationTag: envelope.authenticationTag,
        ciphertext: envelope.ciphertext,
        createdAt,
      });
    } catch (cause) {
      throw new AiAuditRepositoryError(
        "PERSISTENCE_FAILURE",
        "AI audit record could not be persisted",
        { cause },
      );
    }
  }

  async list(
    authorizationHeader: string | null,
    filters: Readonly<{
      runId?: string;
      role?: AiRole;
      limit?: number;
    }> = {},
  ): Promise<readonly DecryptedAiAuditRecord[]> {
    this.adminAuthorizer.assertAuthorized(authorizationHeader);
    const limit = filters.limit ?? 50;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (filters.runId !== undefined && !UUID_V4_PATTERN.test(filters.runId))
    ) {
      throw new AiAuditRepositoryError("INVALID_RECORD", "AI audit query is invalid");
    }
    const conditions = [];
    if (filters.runId !== undefined) conditions.push(eq(aiAuditRecords.runId, filters.runId));
    if (filters.role !== undefined) conditions.push(eq(aiAuditRecords.role, filters.role));

    const rows = await this.db
      .select()
      .from(aiAuditRecords)
      .where(and(...conditions))
      .orderBy(desc(aiAuditRecords.createdAt), desc(aiAuditRecords.invocationId))
      .limit(limit);

    try {
      return Object.freeze(
        rows.map((row) => {
          const metadata = rowMetadata(row);
          return Object.freeze({
            metadata,
            content: this.cipher.decrypt(metadata, {
              keyVersion: row.keyVersion,
              initializationVector: row.initializationVector,
              authenticationTag: row.authenticationTag,
              ciphertext: row.ciphertext,
            }),
          });
        }),
      );
    } catch (cause) {
      throw new AiAuditRepositoryError(
        "CORRUPT_RECORD",
        "AI audit record could not be authenticated",
        { cause },
      );
    }
  }
}
