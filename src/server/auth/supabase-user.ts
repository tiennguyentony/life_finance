import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicSupabaseConfig } from "@/lib/supabase/config";

export type AuthenticatedUser = Readonly<{
  userId: string;
}>;

export async function createSupabaseServerClient() {
  const config = publicSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // auth cookies before protected routes reach application code.
        }
      },
    },
  });
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string" || subject.length === 0) return null;
  return Object.freeze({ userId: subject });
}
