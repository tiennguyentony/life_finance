import { describe, expect, it } from "vitest";

import {
  AiAuditAccessError,
  AiAuditAdminAuthorizer,
  auditAdminAuthorizerFromEnvironment,
} from "./audit-repository";

const token = `lf_audit_${Buffer.alloc(32, 7).toString("base64url")}`;

describe("AI audit administrator authorization", () => {
  it("accepts only the exact strict bearer token", () => {
    const authorizer = new AiAuditAdminAuthorizer(token);
    expect(() => authorizer.assertAuthorized(`Bearer ${token}`)).not.toThrow();
    for (const header of [
      null,
      token,
      `bearer ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token} trailing`,
      `Bearer lf_audit_${Buffer.alloc(32, 8).toString("base64url")}`,
    ]) {
      expect(() => authorizer.assertAuthorized(header)).toThrow(AiAuditAccessError);
    }
  });

  it("requires a full-entropy environment token", () => {
    expect(
      auditAdminAuthorizerFromEnvironment({ AI_AUDIT_ADMIN_TOKEN: token }),
    ).toBeInstanceOf(AiAuditAdminAuthorizer);
    expect(() => auditAdminAuthorizerFromEnvironment({})).toThrow(
      "AI_AUDIT_ADMIN_TOKEN is required",
    );
    expect(() => new AiAuditAdminAuthorizer("lf_audit_short")).toThrow(
      "256 bits",
    );
  });
});
