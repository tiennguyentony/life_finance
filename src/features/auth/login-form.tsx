"use client";

import { useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function publicAuthMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 240);
  }
  return "Authentication could not be completed. Please try again.";
}

export function LoginForm({ initialMessage }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/complete`,
        },
      });
      if (error) throw error;
      setSent(true);
      setMessage("Check your email and open the secure sign-in link.");
    } catch (error) {
      setMessage(publicAuthMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <p className="auth-eyebrow">Persistent save</p>
      <h1 id="login-title">Sign in to your financial life</h1>
      <p>
        Your game auto-saves after every decision. Use the same email to
        continue on another browser or device.
      </p>
      {!sent ? (
        <form className="auth-form" onSubmit={requestLink}>
          <label htmlFor="login-email">Email address</label>
          <input
            autoComplete="email"
            id="login-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      ) : (
        <div className="auth-form">
          <p>
            We sent a secure link to <strong>{email.trim()}</strong>. Open it in
            this browser to finish signing in.
          </p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setSent(false);
            }}
            type="button"
          >
            Use another email or resend
          </button>
        </div>
      )}
      {message ? <p className="auth-message" role="status">{message}</p> : null}
    </section>
  );
}
