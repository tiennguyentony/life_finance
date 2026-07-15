import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { canonicalJson } from "../../core/canonical";
import type { AiAuditAttempt, AiAuditRecord } from "./client";
import type { AiRole } from "./contracts";

const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_AUDIT_PLAINTEXT_BYTES = 2 * 1024 * 1024;

export type AiAuditMetadata = Readonly<{
  invocationId: string;
  runId: string | null;
  contractVersion: number;
  role: AiRole;
  model: string;
  outcome: AiAuditRecord["outcome"];
  attemptCount: number;
  createdAt: string;
}>;

export type AiAuditPlaintext = Readonly<{
  prompt: AiAuditRecord["prompt"];
  attempts: readonly AiAuditAttempt[];
}>;

export type EncryptedAiAudit = Readonly<{
  keyVersion: number;
  initializationVector: Buffer;
  authenticationTag: Buffer;
  ciphertext: Buffer;
}>;

export class AiAuditEncryptionError extends Error {
  readonly code:
    | "INVALID_CONFIGURATION"
    | "UNKNOWN_KEY_VERSION"
    | "PAYLOAD_TOO_LARGE"
    | "AUTHENTICATION_FAILED";

  constructor(code: AiAuditEncryptionError["code"], message: string) {
    super(message);
    this.name = "AiAuditEncryptionError";
    this.code = code;
  }
}

function assertKeyVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 32_767) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "audit key versions must be positive 16-bit integers",
    );
  }
}

function decodeKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "audit encryption keys must be canonical base64-encoded 256-bit values",
    );
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== AES_KEY_BYTES || key.toString("base64") !== value) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "audit encryption keys must decode to exactly 256 bits",
    );
  }
  return key;
}

function authenticatedData(metadata: AiAuditMetadata, keyVersion: number): Buffer {
  return Buffer.from(
    canonicalJson({
      purpose: "life_finance_ai_audit",
      envelopeVersion: 1,
      keyVersion,
      ...metadata,
    }),
    "utf8",
  );
}

function encodePlaintext(value: AiAuditPlaintext): Buffer {
  const plaintext = Buffer.from(canonicalJson(value), "utf8");
  if (plaintext.length > MAX_AUDIT_PLAINTEXT_BYTES) {
    throw new AiAuditEncryptionError(
      "PAYLOAD_TOO_LARGE",
      "AI audit payload exceeds the encrypted storage limit",
    );
  }
  return plaintext;
}

function parsePlaintext(value: Buffer): AiAuditPlaintext {
  try {
    return JSON.parse(value.toString("utf8")) as AiAuditPlaintext;
  } catch {
    throw new AiAuditEncryptionError(
      "AUTHENTICATION_FAILED",
      "AI audit ciphertext could not be authenticated",
    );
  }
}

export class AiAuditCipher {
  readonly #keys: ReadonlyMap<number, Buffer>;
  readonly #activeKeyVersion: number;
  readonly #randomBytes: (size: number) => Buffer;

  constructor(
    keys: ReadonlyMap<number, Uint8Array>,
    activeKeyVersion: number,
    dependencies: Readonly<{ randomBytes?: (size: number) => Buffer }> = {},
  ) {
    assertKeyVersion(activeKeyVersion);
    const copiedKeys = new Map<number, Buffer>();
    for (const [version, keyBytes] of keys) {
      assertKeyVersion(version);
      const key = Buffer.from(keyBytes);
      if (key.length !== AES_KEY_BYTES) {
        throw new AiAuditEncryptionError(
          "INVALID_CONFIGURATION",
          "every audit encryption key must contain exactly 256 bits",
        );
      }
      copiedKeys.set(version, key);
    }
    if (!copiedKeys.has(activeKeyVersion)) {
      throw new AiAuditEncryptionError(
        "INVALID_CONFIGURATION",
        "active audit key version is not present in the keyring",
      );
    }
    this.#keys = copiedKeys;
    this.#activeKeyVersion = activeKeyVersion;
    this.#randomBytes = dependencies.randomBytes ?? randomBytes;
  }

  encrypt(metadata: AiAuditMetadata, value: AiAuditPlaintext): EncryptedAiAudit {
    const key = this.#keys.get(this.#activeKeyVersion);
    if (!key) {
      throw new AiAuditEncryptionError(
        "UNKNOWN_KEY_VERSION",
        "active AI audit encryption key is unavailable",
      );
    }
    const initializationVector = this.#randomBytes(GCM_IV_BYTES);
    if (initializationVector.length !== GCM_IV_BYTES) {
      throw new AiAuditEncryptionError(
        "INVALID_CONFIGURATION",
        "audit IV source must return exactly the requested byte count",
      );
    }
    const plaintext = encodePlaintext(value);
    const cipher = createCipheriv("aes-256-gcm", key, initializationVector, {
      authTagLength: GCM_TAG_BYTES,
    });
    cipher.setAAD(authenticatedData(metadata, this.#activeKeyVersion));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Object.freeze({
      keyVersion: this.#activeKeyVersion,
      initializationVector: Buffer.from(initializationVector),
      authenticationTag: Buffer.from(cipher.getAuthTag()),
      ciphertext,
    });
  }

  decrypt(metadata: AiAuditMetadata, envelope: EncryptedAiAudit): AiAuditPlaintext {
    const key = this.#keys.get(envelope.keyVersion);
    if (!key) {
      throw new AiAuditEncryptionError(
        "UNKNOWN_KEY_VERSION",
        "AI audit encryption key version is unavailable",
      );
    }
    if (
      envelope.initializationVector.length !== GCM_IV_BYTES ||
      envelope.authenticationTag.length !== GCM_TAG_BYTES ||
      envelope.ciphertext.length > MAX_AUDIT_PLAINTEXT_BYTES + GCM_TAG_BYTES
    ) {
      throw new AiAuditEncryptionError(
        "AUTHENTICATION_FAILED",
        "AI audit ciphertext could not be authenticated",
      );
    }
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        envelope.initializationVector,
        { authTagLength: GCM_TAG_BYTES },
      );
      decipher.setAAD(authenticatedData(metadata, envelope.keyVersion));
      decipher.setAuthTag(envelope.authenticationTag);
      return parsePlaintext(
        Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]),
      );
    } catch (error) {
      if (error instanceof AiAuditEncryptionError) throw error;
      throw new AiAuditEncryptionError(
        "AUTHENTICATION_FAILED",
        "AI audit ciphertext could not be authenticated",
      );
    }
  }
}

export function auditCipherFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiAuditCipher {
  const encodedKeyring = environment.AI_AUDIT_ENCRYPTION_KEYS;
  const encodedActiveVersion = environment.AI_AUDIT_ACTIVE_KEY_VERSION;
  if (!encodedKeyring || !encodedActiveVersion) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "AI_AUDIT_ENCRYPTION_KEYS and AI_AUDIT_ACTIVE_KEY_VERSION are required",
    );
  }

  let rawKeyring: unknown;
  try {
    rawKeyring = JSON.parse(encodedKeyring);
  } catch {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "AI_AUDIT_ENCRYPTION_KEYS must be a JSON object",
    );
  }
  if (
    typeof rawKeyring !== "object" ||
    rawKeyring === null ||
    Array.isArray(rawKeyring) ||
    Object.keys(rawKeyring).length === 0
  ) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "AI_AUDIT_ENCRYPTION_KEYS must contain at least one versioned key",
    );
  }

  const keys = new Map<number, Buffer>();
  for (const [encodedVersion, encodedKey] of Object.entries(rawKeyring)) {
    if (!/^[1-9][0-9]{0,4}$/.test(encodedVersion) || typeof encodedKey !== "string") {
      throw new AiAuditEncryptionError(
        "INVALID_CONFIGURATION",
        "audit keyring entries must map integer versions to base64 keys",
      );
    }
    const version = Number(encodedVersion);
    assertKeyVersion(version);
    keys.set(version, decodeKey(encodedKey));
  }
  if (!/^[1-9][0-9]{0,4}$/.test(encodedActiveVersion)) {
    throw new AiAuditEncryptionError(
      "INVALID_CONFIGURATION",
      "AI_AUDIT_ACTIVE_KEY_VERSION must be a positive integer",
    );
  }
  return new AiAuditCipher(keys, Number(encodedActiveVersion));
}
