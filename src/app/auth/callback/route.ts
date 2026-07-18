import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicSupabaseConfig } from "@/lib/supabase/config";
import { safeAuthRedirectPath } from "@/server/auth/auth-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const destination = new URL(
    safeAuthRedirectPath(requestUrl.searchParams.get("next")),
    requestUrl.origin,
  );
  let response = NextResponse.redirect(destination);
  const config = publicSupabaseConfig();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.redirect(destination);
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin));
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=expired_link", requestUrl.origin));
  }
  return response;
}
