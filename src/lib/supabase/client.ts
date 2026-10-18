"use client";

// Browser Supabase client (singleton). Returns null when Supabase is not
// configured so callers can fall back to local-only mode.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
