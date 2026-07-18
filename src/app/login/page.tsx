import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getAuthenticatedUser } from "@/server/auth/supabase-user";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getAuthenticatedUser()) redirect("/start");
  return (
    <div className="screen auth-screen">
      <LoginForm />
    </div>
  );
}
