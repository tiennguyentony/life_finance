import { describe, expect, it } from "vitest";

import { publicSupabaseConfig } from "../config";

describe("publicSupabaseConfig", () => {
  it("accepts only complete HTTPS public configuration", () => {
    expect(
      publicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/path",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("rejects missing or insecure configuration", () => {
    expect(() => publicSupabaseConfig({})).toThrow(/required/);
    expect(() =>
      publicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrow(/HTTPS/);
  });
});
