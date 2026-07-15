import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const RUN_SECRET_HASH_VERSION = 1 as const;
export const RUN_SECRET_ENTROPY_BYTES = 32 as const;

export type RunCredential = Readonly<{
  secret: string;
  secretHash: string;
  secretHashVersion: typeof RUN_SECRET_HASH_VERSION;
}>;

export class RunSecretError extends Error {
  readonly code:
    | "INVALID_PEPPER"
    | "INVALID_AUTHORIZATION"
    | "INVALID_SECRET_FORMAT";

  constructor(code: RunSecretError["code"], message: string) {
    super(message);
    this.name = "RunSecretError";
    this.code = code;
  }
}

const SECRET_PATTERN = /^lf_run_[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

export class RunSecretCodec {
  readonly #pepper: Buffer;

  constructor(pepper: Uint8Array) {
    const normalized = Buffer.from(pepper);
    if (normalized.byteLength < 32) {
      throw new RunSecretError(
        "INVALID_PEPPER",
        "run-secret pepper must contain at least 32 bytes",
      );
    }
    this.#pepper = Buffer.from(normalized);
  }

  hash(secret: string): string {
    return createHmac("sha256", this.#pepper).update(secret, "utf8").digest("hex");
  }

  create(
    entropySource: (size: number) => Buffer = randomBytes,
  ): RunCredential {
    const entropy = entropySource(RUN_SECRET_ENTROPY_BYTES);
    if (entropy.byteLength !== RUN_SECRET_ENTROPY_BYTES) {
      throw new RunSecretError(
        "INVALID_SECRET_FORMAT",
        "entropy source returned an invalid byte count",
      );
    }
    const secret = `lf_run_${entropy.toString("base64url")}`;
    return Object.freeze({
      secret,
      secretHash: this.hash(secret),
      secretHashVersion: RUN_SECRET_HASH_VERSION,
    });
  }

  verify(secret: string, expectedHash: string): boolean {
    const candidateHash = this.hash(secret);
    const candidateBytes = Buffer.from(candidateHash, "hex");
    const expectedBytes = HASH_PATTERN.test(expectedHash)
      ? Buffer.from(expectedHash, "hex")
      : Buffer.alloc(32);
    const hashMatches = timingSafeEqual(candidateBytes, expectedBytes);
    return SECRET_PATTERN.test(secret) && HASH_PATTERN.test(expectedHash) && hashMatches;
  }
}

export function runSecretCodecFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RunSecretCodec {
  const encoded = environment.RUN_SECRET_PEPPER_BASE64URL;
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new RunSecretError(
      "INVALID_PEPPER",
      "RUN_SECRET_PEPPER_BASE64URL must be configured as base64url",
    );
  }
  const pepper = Buffer.from(encoded, "base64url");
  if (pepper.toString("base64url") !== encoded.replace(/=+$/, "")) {
    throw new RunSecretError(
      "INVALID_PEPPER",
      "RUN_SECRET_PEPPER_BASE64URL is not canonical base64url",
    );
  }
  return new RunSecretCodec(pepper);
}

export function extractRunSecret(authorizationHeader: string | null): string {
  const match = authorizationHeader?.match(BEARER_PATTERN);
  if (!match || !SECRET_PATTERN.test(match[1])) {
    throw new RunSecretError(
      "INVALID_AUTHORIZATION",
      "a valid run bearer credential is required",
    );
  }
  return match[1];
}

export function isRunSecret(value: string): boolean {
  return SECRET_PATTERN.test(value);
}
