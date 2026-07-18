"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthCompletePage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetch("/api/session/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("claim failed");
        router.replace("/start");
        router.refresh();
      })
      .catch(() => {
        setError("Signed in, but your saved game could not be restored.");
      });
  }, [router]);

  return (
    <div className="screen auth-screen">
      <section className="auth-card" aria-labelledby="auth-complete-title">
        <p className="auth-eyebrow">Persistent save</p>
        <h1 id="auth-complete-title">Finishing sign-in…</h1>
        <p>{error ?? "Securely restoring your saved financial life."}</p>
        {error ? (
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try again
          </button>
        ) : null}
      </section>
    </div>
  );
}
