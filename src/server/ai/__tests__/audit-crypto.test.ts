import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AiAuditCipher,
  AiAuditEncryptionError,
  auditCipherFromEnvironment,
  type AiAuditMetadata,
  type AiAuditPlaintext,
} from "../audit-crypto";

const metadata: AiAuditMetadata = {
  invocationId: "85e82428-2f9f-4d27-93e0-cbe0e612dd70",
  runId: "6351ac8b-de91-4b93-9d0f-452b7678cc78",
  contractVersion: 1,
  role: "hostile_fed",
  model: "gpt-5.6-sol",
  outcome: "success",
  attemptCount: 1,
  createdAt: "2026-07-14T20:00:00.000Z",
};

const plaintext: AiAuditPlaintext = {
  prompt: {
    instructions: "Choose only an engine-owned event.",
    input: { role: "hostile_fed", evidence: ["cash buffer: 0.8 months"] },
  },
  attempts: [
    {
      attempt: 1,
      kind: "success",
      responseId: "resp_1",
      output: [{ type: "output_text", text: "structured result" }],
      errorCode: null,
    },
  ],
};

const key1 = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const key2 = Buffer.from(Array.from({ length: 32 }, (_, index) => 255 - index));
const fixedIv = Buffer.from("000102030405060708090a0b", "hex");

describe("AiAuditCipher", () => {
  it("encrypts deterministically under a fixed IV and decrypts the complete audit", () => {
    const cipher = new AiAuditCipher(new Map([[1, key1]]), 1, {
      randomBytes: () => fixedIv,
    });
    const envelope = cipher.encrypt(metadata, plaintext);

    expect(envelope.keyVersion).toBe(1);
    expect(envelope.initializationVector.toString("hex")).toBe("000102030405060708090a0b");
    expect(envelope.authenticationTag).toHaveLength(16);
    expect(envelope.ciphertext.toString("utf8")).not.toContain("cash buffer");
    expect(createHash("sha256").update(envelope.ciphertext).digest("hex")).toBe(
      "115d217db29dca6b4b303d71ea69c04db8ee085442ed343c7b4cad263c0f5cdf",
    );
    expect(cipher.decrypt(metadata, envelope)).toEqual(plaintext);
  });

  it("authenticates metadata so ciphertext cannot be moved to another run or role", () => {
    const cipher = new AiAuditCipher(new Map([[1, key1]]), 1, {
      randomBytes: () => fixedIv,
    });
    const envelope = cipher.encrypt(metadata, plaintext);
    expect(() => cipher.decrypt({ ...metadata, runId: null }, envelope)).toThrow(
      AiAuditEncryptionError,
    );
    expect(() => cipher.decrypt({ ...metadata, role: "teacher" }, envelope)).toThrow(
      "could not be authenticated",
    );
  });

  it("detects ciphertext, tag, and IV tampering", () => {
    const cipher = new AiAuditCipher(new Map([[1, key1]]), 1, {
      randomBytes: () => fixedIv,
    });
    const envelope = cipher.encrypt(metadata, plaintext);
    const ciphertext = Buffer.from(envelope.ciphertext);
    ciphertext[0] ^= 1;
    expect(() => cipher.decrypt(metadata, { ...envelope, ciphertext })).toThrow(
      "could not be authenticated",
    );
    const tag = Buffer.from(envelope.authenticationTag);
    tag[0] ^= 1;
    expect(() => cipher.decrypt(metadata, { ...envelope, authenticationTag: tag })).toThrow(
      "could not be authenticated",
    );
    expect(() =>
      cipher.decrypt(metadata, { ...envelope, initializationVector: Buffer.alloc(11) }),
    ).toThrow("could not be authenticated");
  });

  it("decrypts old records after rotating the active key", () => {
    const oldCipher = new AiAuditCipher(new Map([[1, key1]]), 1, {
      randomBytes: () => fixedIv,
    });
    const oldEnvelope = oldCipher.encrypt(metadata, plaintext);
    const rotatedCipher = new AiAuditCipher(new Map([[1, key1], [2, key2]]), 2, {
      randomBytes: () => fixedIv,
    });
    expect(rotatedCipher.decrypt(metadata, oldEnvelope)).toEqual(plaintext);
    expect(rotatedCipher.encrypt(metadata, plaintext).keyVersion).toBe(2);
  });

  it("rejects missing key versions without exposing cryptographic details", () => {
    const cipher = new AiAuditCipher(new Map([[2, key2]]), 2, {
      randomBytes: () => fixedIv,
    });
    expect(() =>
      cipher.decrypt(metadata, {
        keyVersion: 1,
        initializationVector: fixedIv,
        authenticationTag: Buffer.alloc(16),
        ciphertext: Buffer.alloc(1),
      }),
    ).toThrow("key version is unavailable");
  });

  it("loads a strict versioned keyring from environment", () => {
    const cipher = auditCipherFromEnvironment({
      AI_AUDIT_ENCRYPTION_KEYS: JSON.stringify({
        1: key1.toString("base64"),
        2: key2.toString("base64"),
      }),
      AI_AUDIT_ACTIVE_KEY_VERSION: "2",
    });
    expect(cipher.encrypt(metadata, plaintext).keyVersion).toBe(2);
  });

  it("rejects malformed, short, missing, and inactive environment keys", () => {
    const invalidEnvironments = [
      {},
      { AI_AUDIT_ENCRYPTION_KEYS: "not json", AI_AUDIT_ACTIVE_KEY_VERSION: "1" },
      { AI_AUDIT_ENCRYPTION_KEYS: "{}", AI_AUDIT_ACTIVE_KEY_VERSION: "1" },
      {
        AI_AUDIT_ENCRYPTION_KEYS: JSON.stringify({ 1: Buffer.alloc(16).toString("base64") }),
        AI_AUDIT_ACTIVE_KEY_VERSION: "1",
      },
      {
        AI_AUDIT_ENCRYPTION_KEYS: JSON.stringify({ 1: key1.toString("base64") }),
        AI_AUDIT_ACTIVE_KEY_VERSION: "2",
      },
    ];
    for (const environment of invalidEnvironments) {
      expect(() => auditCipherFromEnvironment(environment)).toThrow(AiAuditEncryptionError);
    }
  });
});
