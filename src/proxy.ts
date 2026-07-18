import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  // Local Instant Demo is deliberately capability-based and in-memory. It must
  // remain usable without Supabase credentials so contributors can test the
  // complete game loop before configuring persistent infrastructure.
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next({ request });
  }
  const config = publicSupabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
