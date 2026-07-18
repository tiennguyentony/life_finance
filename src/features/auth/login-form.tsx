"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function publicAuthMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 240);
  }
  return "Authentication could not be completed. Please try again.";
}

type AuthMode = "sign_in" | "sign_up";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign_up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function authenticate() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const credentials = { email: email.trim(), password };
      const { data, error } =
        mode === "sign_up"
          ? await supabase.auth.signUp(credentials)
          : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (!data.session) {
        throw new Error(
          mode === "sign_up"
            ? "The account was created, but automatic sign-in is unavailable. Ask the demo administrator to enable email auto-confirm."
            : "Sign-in succeeded without creating a session. Please try again.",
        );
      }
      const claimResponse = await fetch("/api/session/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!claimResponse.ok) {
        throw new Error("Signed in, but the saved game could not be restored.");
      }
      router.replace("/start");
      router.refresh();
    } catch (error) {
      setMessage(publicAuthMessage(error));
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <p className="auth-eyebrow">Persistent save</p>
      <h1 id="login-title">Sign in to your financial life</h1>
      <p>
        Create an account once, then use the same email and password to resume
        your auto-saved game on another browser or device.
      </p>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void authenticate();
        }}
      >
        <label htmlFor="login-email">Email address</label>
        <input
          autoComplete="email"
          id="login-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="login-password">Password</label>
        <input
          autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
          id="login-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <button
          className="button button-primary"
          disabled={busy}
          type="submit"
        >
          {busy
            ? mode === "sign_up"
              ? "Creating account…"
              : "Signing in…"
            : mode === "sign_up"
              ? "Create account"
              : "Sign in"}
        </button>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            setMode((current) =>
              current === "sign_up" ? "sign_in" : "sign_up",
            );
            setMessage(null);
          }}
          type="button"
        >
          {mode === "sign_up"
            ? "Already have an account? Sign in"
            : "Need an account? Create one"}
        </button>
      </form>
      {message ? <p className="auth-message" role="status">{message}</p> : null}
    </section>
  );
}
