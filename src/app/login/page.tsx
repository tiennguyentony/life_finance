import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAuthenticatedUser()) redirect("/start");
  const error = (await searchParams).error;
  const initialMessage = error
    ? "That sign-in link is invalid or expired. Request a new link and try again."
    : undefined;
  return (
    <div className="screen auth-screen">
      <LoginForm initialMessage={initialMessage} />
    </div>
  );
}
