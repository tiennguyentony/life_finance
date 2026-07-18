export type PublicSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export function publicSupabaseConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublicSupabaseConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required",
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS");
  }
  return Object.freeze({ url: parsed.origin, publishableKey });
}
