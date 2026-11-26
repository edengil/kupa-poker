"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/** לקוח Supabase לדפדפן. הסשן נשמר בעוגייה כדי שגם השרת יראה אותו. */
export function getSupabase() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      // המפתח הציבורי החדש (sb_publishable_) — היחיד הנתמך מאז רוטציית המפתחות
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }
  return client;
}
