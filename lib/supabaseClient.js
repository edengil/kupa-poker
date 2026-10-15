"use client";
import { createBrowserClient } from "@supabase/ssr";

let client = null;

/** לקוח Supabase לדפדפן. הסשן נשמר בעוגייה כדי שגם השרת יראה אותו. */
export function getSupabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      // המפתח החדש (sb_publishable_) מועדף; נפילה ל־anon הישן כל עוד לא הוגדר
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
