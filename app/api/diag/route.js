/* ============================================================================
   נתיב אבחון — בילד לכידת שגיאות (fix/diag-capture).

   מקבל דיווחים מהלקוח — שגיאות (window.onerror / unhandledrejection /
   console.error / Error Boundary) ומשואות מחזור־חיים (mount, פאזות,
   remount-ים, אירועי store) — ושומר כל אחד כשורה ב־public.diag_events,
   כי לוגי Vercel אינם נגישים (403 ב־observability). console.error עם
   קידומת DIAG:: נשמר כגיבוי.

   לקוח השרת הוא getAdminSupabase (SUPABASE_SECRET_KEY) — אותו דפוס כמו
   שאר נתיבי ה־API. כשל בהכנסה לעולם לא מפיל את הנתיב: תמיד 204.

   אבטחה (גל 2, פריט 2.3 — lib/diagGuard.js): עד הגל הנתיב היה פתוח
   לגמרי וכל אחד יכל להזריק שורות מפוברקות בלי הגבלה. מעכשיו: גוף
   מעל 8KB נדחה ב־413; בקשה בלי סוד ניהול חייבת לשאת את מזהה־הלקוח
   של האפליקציה (cid) ועוברת במסלול מצומצם (kind מתבנית קבועה, בלי
   השדות החופשיים); והכול תחת מגבלת קצב פר־IP + תקרה יומית.
   ============================================================================ */

import { getAdminSupabase } from "@/lib/supabaseAdmin";
import {
  DIAG_MAX_BODY,
  DIAG_CLIENT_ID_PATTERN,
  DIAG_KIND_PATTERN,
  diagRateCheck,
  isDiagAdmin,
  sanitizeDiagEntry,
} from "@/lib/diagGuard";

export const dynamic = "force-dynamic";

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req) {
  const admin = isDiagAdmin(req);

  /* שכבת גודל: ההצהרה קודם (זול), והאורך בפועל אחרי הקריאה (ההצהרה
     יכולה לשקר בשני הכיוונים). חלה גם על מסלול המנהל. */
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > DIAG_MAX_BODY) {
    console.error(`DIAG::oversized body rejected (declared ${declared} bytes)`);
    return jsonError(413, "payload too large");
  }

  /* שכבת קצב: רק למסלול הלקוח — מנהל מאומת לא נחסם בחקירת תקלה. */
  if (!admin && !diagRateCheck(req)) {
    return jsonError(429, "rate limited");
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return jsonError(400, "unreadable body");
  }
  if (new TextEncoder().encode(raw).length > DIAG_MAX_BODY) {
    console.error("DIAG::oversized body rejected (actual size over cap)");
    return jsonError(413, "payload too large");
  }
  if (!raw) return jsonError(400, "empty body");

  let d = null;
  try {
    d = JSON.parse(raw);
  } catch {
    d = null;
  }
  if (!d || typeof d !== "object") {
    /* במסלול המנהל נשמרת ההתנהגות הישנה (שורת unparsable); במסלול
       הלקוח גוף שאינו JSON הוא בדיוק ה־payload החופשי שנסגר. */
    if (!admin) return jsonError(400, "invalid json");
    d = { kind: "unparsable", message: raw.slice(0, 200) };
  }

  if (!admin) {
    /* שכבת זיהוי: מזהה־הלקוח של האפליקציה + kind מתבנית אוצר־המילים */
    const cid = typeof d.cid === "string" ? d.cid : "";
    if (!DIAG_CLIENT_ID_PATTERN.test(cid)) return jsonError(403, "missing client id");
    if (d.kind != null && String(d.kind) !== "" && !DIAG_KIND_PATTERN.test(String(d.kind))) {
      return jsonError(400, "bad kind");
    }
  }

  const entry = sanitizeDiagEntry(d, { admin });
  console.error("DIAG::" + JSON.stringify(entry));

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

  return new Response(null, { status: 204 });
}
