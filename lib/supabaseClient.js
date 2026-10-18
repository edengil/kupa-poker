"use client";
import { createBrowserClient } from "@supabase/ssr";

let client = null;

/** לקוח Supabase לדפדפן. הסשן נשמר בעוגייה כדי שגם השרת יראה אותו. */
export function getSupabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      // המפתח הציבורי החדש (sb_publishable_) — היחיד הנתמך מאז רוטציית המפתחות
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }
  return client;
}
