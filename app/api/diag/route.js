/* ============================================================================
   נתיב אבחון זמני — בילד לכידת שגיאות (fix/diag-capture).

   מקבל דיווחים מהלקוח — שגיאות (window.onerror / unhandledrejection /
   console.error / Error Boundary) ומשואות מחזור־חיים (mount, פאזות,
   remount-ים, אירועי store) — ושומר כל אחד כשורה ב־public.diag_events,
   כי לוגי Vercel אינם נגישים (403 ב־observability). console.error עם
   קידומת DIAG:: נשמר כגיבוי.

   לקוח השרת הוא getAdminSupabase (SUPABASE_SECRET_KEY) — אותו דפוס כמו
   שאר נתיבי ה־API. כשל בהכנסה לעולם לא מפיל את הנתיב: תמיד 204.
   בלי auth, אבל גוף מוגבל ל־8KB וכל שדה נחתך.
   ============================================================================ */

import { getAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const MAX_STACK = 2 * 1024;

export async function POST(req) {
  let entry = null;
  try {
    const declared = Number(req.headers.get("content-length") || 0);
    const raw = declared > MAX_BODY ? "" : await req.text();
    if (!raw) {
      console.error(`DIAG::oversized-or-empty body dropped (declared ${declared} bytes)`);
    } else {
      let d = {};
      try {
        d = JSON.parse(raw);
      } catch {
        d = { kind: "unparsable", message: raw.slice(0, 200) };
      }
      const phaseNum = Number(d.phase);
      entry = {
        kind: String(d.kind || "error").slice(0, 40),
        message: String(d.message || "").slice(0, 1000),
        stack: String(d.stack || "").slice(0, MAX_STACK),
        componentStack: String(d.componentStack || "").slice(0, 1000),
        detail: String(d.detail || "").slice(0, 500),
        url: String(d.url || "").slice(0, 300),
        ua: String(d.ua || "").slice(0, 300),
        ts: String(d.ts || ""),
        phase: Number.isFinite(phaseNum) && phaseNum > 0 ? Math.floor(phaseNum) : null,
      };
      console.error("DIAG::" + JSON.stringify(entry));
    }
  } catch (e) {
    console.error("DIAG::route error", e?.message || e);
  }

  if (entry) {
    try {
      const supabase = getAdminSupabase();
      const { error } = await supabase.from("diag_events").insert({
        kind: entry.kind,
        message: entry.message || null,
        stack: entry.stack || null,
        url: entry.url || null,
        ua: entry.ua || null,
        phase: entry.phase,
        payload: entry,
      });
      if (error) console.error("DIAG::insert failed:", error.message);
    } catch (e) {
      console.error("DIAG::insert failed:", e?.message || e);
    }
  }

  return new Response(null, { status: 204 });
}
