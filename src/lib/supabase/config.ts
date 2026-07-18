export type PublicSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export function publicSupabaseConfig(
  environment?: Readonly<Record<string, string | undefined>>,
): PublicSupabaseConfig {
  // These direct references are required for Next.js to inline NEXT_PUBLIC_*
  // values into the browser bundle. Passing process.env through an object
  // indirection works on the server but produces an empty object in browsers.
  const url = (
    environment?.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  const publishableKey = (
    environment?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required",
    );
  }
  const parsed = new URL(url);
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS except on loopback");
  }
  return Object.freeze({ url: parsed.origin, publishableKey });
}
