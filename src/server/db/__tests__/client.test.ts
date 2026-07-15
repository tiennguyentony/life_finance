import { describe, expect, it } from "vitest";

import {
  createDatabaseConnection,
  databaseConnectionFromEnvironment,
} from "../client";

describe("database configuration", () => {
  it("rejects missing and non-PostgreSQL URLs without exposing credentials", () => {
    expect(() => databaseConnectionFromEnvironment({})).toThrow(/DATABASE_URL/);
    expect(() => createDatabaseConnection("https://user:secret@example.com/db")).toThrow(
      /PostgreSQL/,
    );
    try {
      createDatabaseConnection("not a url with secret-value");
    } catch (error) {
      expect(String(error)).not.toContain("secret-value");
    }
  });
});
