"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LifeFinanceClient } from "@/lib/api-client/client";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="nav-pill"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await Promise.allSettled([
            createSupabaseBrowserClient().auth.signOut(),
            new LifeFinanceClient().deleteSession(),
          ]);
          router.replace("/");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      type="button"
    >
      {busy ? "Exiting…" : "Exit"}
    </button>
  );
}
