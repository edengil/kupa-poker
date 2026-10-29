/* ============================================================================
   רישום אירועי שליחה של הבוט — צד שרת בלבד.

   שתי כתיבות על כל כשל (ובהתאוששות בלבד על הצלחה):
   1. שורה ב־diag_events (kind: ‏"wa-send-fail" / ‏"wa-channel-recovered") —
      אותו מבנה כמו נתיב /api/diag, כדי שהאבחון יראה גם כשלי ערוץ.
   2. config.botHealth על שורת הקבוצה — האינדיקטור שהמנהל רואה באפליקציה.

   הצלחות לא מציפות: כתיבת config על הצלחה קורה רק בהתאוששות (היה down)
   או אם חותמת ההצלחה האחרונה ישנה מ־OK_TOUCH_MS. הכשל תמיד נרשם.

   הפונקציות כאן לעולם לא זורקות — רישום בריאות לא ישבור שליחה או זרימת משחק.
   ============================================================================ */

import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { classifyWhapiSendFailure } from "@/lib/whapiErrors";
import { applyWaEvent, botHealthView } from "./health.js";

/** מרווח מינימלי בין כתיבות "הצלחה" ל־config — חוסך כתיבות מסד על כל הודעה. */
export const OK_TOUCH_MS = 10 * 60 * 1000;

function errText(error) {
  return error instanceof Error ? error.message : String(error ?? "");
}

async function insertDiag(supabase, kind, evt, extra) {
  try {
    await supabase.from("diag_events").insert({
      kind,
      message: (evt.message || "").slice(0, 1000) || null,
      stack: evt.error instanceof Error ? (evt.error.stack || "").slice(0, 2000) || null : null,
      url: null,
      ua: null,
      phase: null,
      payload: {
        kind,
        message: (evt.message || "").slice(0, 1000),
        detail: evt.where || "",
        ts: new Date(evt.now).toISOString(),
        ...(extra || {}),
      },
    });
  } catch {
    /* אבחון לעולם לא שובר — גם אם הטבלה חסרה/חסומה */
  }
}

/**
 * רושם תוצאת שליחה אחת. groupId = מזהה שורת הקבוצה (groups.id).
 * evt: { ok, error?, where? } — where מזהה את נתיב השליחה ("whatsapp/reply"…).
 * supabase מוזרק בבדיקות/נתיבים שכבר מחזיקים לקוח; אחרת נוצר לקוח אדמין.
 */
export async function recordWaSend({ supabase = null, groupId = null, ok, error = null, where = "" } = {}) {
  try {
    const now = Date.now();
    const sb = supabase || getAdminSupabase();
    const raw = ok ? "" : errText(error);
    const { code, hint } = ok ? { code: null, hint: null } : classifyWhapiSendFailure(raw);

    let prev = null;
    if (groupId) {
      try {
        const { data } = await sb
          .from("groups")
          .select("config")
          .eq("id", groupId)
          .single();
        prev = data?.config?.botHealth || null;
      } catch {
        prev = null;
      }
    }
    const prevState = botHealthView(prev).state;
    const next = applyWaEvent(prev, { ok, error, where, code, hint }, now);

    if (!ok) {
      await insertDiag(sb, "wa-send-fail", {
        error,
        where,
        now,
        message: `Whapi send failed${where ? ` · ${where}` : ""}: ${raw}`,
      }, { groupId, code });
    } else if (prevState === "down") {
      await insertDiag(sb, "wa-channel-recovered", {
        where,
        now,
        message: `Whapi channel recovered${where ? ` · ${where}` : ""}`,
      }, { groupId });
    }

    if (!groupId) return next;

    const shouldWrite =
      !ok ||
      prev == null ||
      prevState === "down" ||
      now - (prev.lastOkAt || 0) >= OK_TOUCH_MS;
    if (!shouldWrite) return next;

    try {
      /* קוראים config טרי לפני הכתיבה כדי לא לדרוס מפתחות שרת אחרים
         (אותו דפוס כמו pins/sentReports בנתיבי הבוט). */
      const { data: fresh } = await sb
        .from("groups")
        .select("config")
        .eq("id", groupId)
        .single();
      await sb
        .from("groups")
        .update({ config: { ...(fresh?.config || {}), botHealth: next } })
        .eq("id", groupId);
    } catch {
      /* הכתיבה היא בונוס ניטור — הכשל כבר תועד ב־diag_events */
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * עוטף שליחה: מריץ אותה, רושם הצלחה/כשל, ומחזיר את התוצאה.
 * על כשל — זורק מחדש את השגיאה המקורית, כדי שכל ה־catch הקיימים בנתיבים
 * ימשיכו להתנהג בדיוק כמקודם.
 */
export async function trackWaSend(opts, sendFn) {
  try {
    const out = await sendFn();
    await recordWaSend({ ...opts, ok: true });
    return out;
  } catch (e) {
    await recordWaSend({ ...opts, ok: false, error: e });
    throw e;
  }
}
