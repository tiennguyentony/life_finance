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

  it("permits HTTP only for a local Supabase development stack", () => {
    expect(
      publicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
      }),
    ).toMatchObject({ url: "http://127.0.0.1:54321" });
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
