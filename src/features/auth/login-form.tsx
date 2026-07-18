"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginStep = "email" | "code";

function publicAuthMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 240);
  }
  return "Authentication could not be completed. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("code");
      setMessage("Check your email for a six-digit sign-in code.");
    } catch (error) {
      setMessage(publicAuthMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      const claimResponse = await fetch("/api/session/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!claimResponse.ok) {
        throw new Error("Signed in, but the existing save could not be attached to this account.");
      }
      router.replace("/start");
      router.refresh();
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
      {step === "email" ? (
        <form className="auth-form" onSubmit={requestCode}>
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
            {busy ? "Sending…" : "Send sign-in code"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor="login-code">Six-digit code</label>
          <input
            autoComplete="one-time-code"
            id="login-code"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            pattern="[0-9]{6}"
            required
            value={code}
          />
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? "Checking…" : "Continue"}
          </button>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setCode("");
              setMessage(null);
              setStep("email");
            }}
            type="button"
          >
            Use another email
          </button>
        </form>
      )}
      {message ? <p className="auth-message" role="status">{message}</p> : null}
    </section>
  );
}
