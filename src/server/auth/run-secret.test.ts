import { describe, expect, it } from "vitest";

import {
  extractRunSecret,
  isRunSecret,
  RunSecretCodec,
  runSecretCodecFromEnvironment,
} from "./run-secret";

const pepper = Buffer.alloc(32, 0xa5);

describe("anonymous run credentials", () => {
  it("creates a 256-bit opaque secret and stores only its versioned HMAC", () => {
    const codec = new RunSecretCodec(pepper);
    const credential = codec.create((size) => Buffer.alloc(size, 0x11));

    expect(credential.secret).toBe(
      "lf_run_ERERERERERERERERERERERERERERERERERERERERERE",
    );
    expect(credential.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(credential.secretHash).not.toContain(credential.secret);
    expect(credential.secretHashVersion).toBe(1);
    expect(Object.isFrozen(credential)).toBe(true);
  });

  it("verifies in constant-length comparison space and rejects malformed values", () => {
    const codec = new RunSecretCodec(pepper);
    const credential = codec.create((size) => Buffer.alloc(size, 0x22));

    expect(codec.verify(credential.secret, credential.secretHash)).toBe(true);
    expect(codec.verify(`${credential.secret.slice(0, -1)}A`, credential.secretHash)).toBe(
      false,
    );
    expect(codec.verify("not-a-secret", credential.secretHash)).toBe(false);
    expect(codec.verify(credential.secret, "not-a-hash")).toBe(false);
  });

  it("binds hashes to the server-only pepper", () => {
    const first = new RunSecretCodec(Buffer.alloc(32, 1));
    const second = new RunSecretCodec(Buffer.alloc(32, 2));
    const credential = first.create((size) => Buffer.alloc(size, 3));

    expect(second.verify(credential.secret, credential.secretHash)).toBe(false);
  });

  it("accepts only one canonical Authorization bearer form", () => {
    const secret = new RunSecretCodec(pepper).create((size) => Buffer.alloc(size, 4)).secret;

    expect(extractRunSecret(`Bearer ${secret}`)).toBe(secret);
    expect(isRunSecret(secret)).toBe(true);
    for (const header of [
      null,
      secret,
      `bearer ${secret}`,
      `Bearer  ${secret}`,
      `Bearer ${secret} trailing`,
    ]) {
      expect(() => extractRunSecret(header)).toThrow(
        expect.objectContaining({ code: "INVALID_AUTHORIZATION" }),
      );
    }
  });

  it("rejects missing, malformed, and weak environment peppers", () => {
    expect(() => runSecretCodecFromEnvironment({})).toThrow(
      expect.objectContaining({ code: "INVALID_PEPPER" }),
    );
    expect(() =>
      runSecretCodecFromEnvironment({ RUN_SECRET_PEPPER_BASE64URL: "not+base64" }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PEPPER" }));
    expect(() =>
      runSecretCodecFromEnvironment({
        RUN_SECRET_PEPPER_BASE64URL: Buffer.alloc(16).toString("base64url"),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PEPPER" }));
    expect(
      runSecretCodecFromEnvironment({
        RUN_SECRET_PEPPER_BASE64URL: pepper.toString("base64url"),
      }),
    ).toBeInstanceOf(RunSecretCodec);
  });
});
