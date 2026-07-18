"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const config = publicSupabaseConfig();
  return createBrowserClient(config.url, config.publishableKey);
}
