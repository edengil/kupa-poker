import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   לקוח צד-שרת עם מפתח סודי.

   ה-webhook של וואטסאפ רץ בלי משתמש מחובר, ולכן RLS היה חוסם אותו. המפתח
   הסודי עוקף את RLS — ובדיוק לכן הוא חייב להישאר כאן בלבד. שם המשתנה בלי
   NEXT_PUBLIC_ הוא לא סגנון: זה מה שמונע מ-Next להכניס אותו לחבילת הדפדפן.
   ============================================================================ */

export function getAdminSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY חסר");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
    // Next.js patches global fetch with a Data Cache that otherwise serves stale
    // PostgREST GETs across serverless invocations. The WhatsApp webhook and the
    // daily report cron must always read the live row (game state, sentReports),
    // so opt every admin request out of the cache.
    global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" }) },
  });
}

/** ניסיון לעדכן צופים מיידית. הסקר בצד הצופה מכסה גם אם זה נכשל. */
export async function pingViewers(slug) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: `group:${slug}`, event: "update", payload: { at: Date.now() } }],
      }),
    });
  } catch (e) {
    console.warn("broadcast failed, viewers will poll:", e.message);
  }
}
