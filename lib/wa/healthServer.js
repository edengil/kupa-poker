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
import { updateGroupCas } from "@/lib/groupCas";
import { classifyWhapiSendFailure } from "@/lib/whapiErrors";
import { applyWaEvent, botHealthView } from "./health.js";
import { applyQuotaSend } from "./quota.js";

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
export async function recordWaSend({ supabase = null, groupId = null, ok, error = null, where = "", quotaChat = null } = {}) {
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
    const evt = { ok, error, where, code, hint };
    /* חישוב מקומי מהמצב שנקרא — משמש להחלטות (כתיבה/התאוששות) ולגיבוי
       אם כתיבת ה־CAS לא נחתה; הערך שנכתב בפועל מחושב בתוך ה־build. */
    const localNext = applyWaEvent(prev, evt, now);

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

    if (!groupId) return localNext;

    const shouldWrite =
      !ok ||
      prev == null ||
      prevState === "down" ||
      now - (prev.lastOkAt || 0) >= OK_TOUCH_MS;
    /* גל 5, פריט 5.6: כשמועבר יעד (quotaChat) השליחה נספרת במד המכסה —
       והמד חייב כל שליחה, לכן הכתיבה רצה גם כשה־throttle של הבריאות
       היה מדלג. בלי quotaChat ההתנהגות זהה לקודם. */
    if (!shouldWrite && quotaChat == null) return localNext;

    /* גל 5, פריט 5.7 (פסק שער 0.4): ה־next מחושב בתוך פונקציית ה־build של
       ה־CAS, על ה־botHealth הטרי של כל ניסיון — שתי כתיבות בריאות
       מקביליות (תזכורת־קרון ושליחת וובהוק באותה שנייה) כבר לא דורסות זו
       את אירוע זו, כי כל אחת מקפלת את האירוע שלה על המצב העדכני במקום
       על צילום ישן. ה־next הסופי נלכד ב־closure ומוחזר לקרוא.
       ‏retries עלה מ־2 ל־3, כמו ברירת המחדל של updateGroupCas.
       מד המכסה (5.6) מתקפל באותו build בדיוק, על ה־waQuota הטרי. */
    let next = localNext;
    try {
      /* כותבים על config טרי דרך CAS כדי לא לדרוס מפתחות שרת אחרים
         (אותו דפוס כמו pins/sentReports בנתיבי הבוט). */
      let captured = null;
      const res = await updateGroupCas(
        sb,
        groupId,
        (fresh) => {
          captured = applyWaEvent(fresh?.config?.botHealth || null, evt, now);
          const config = { ...(fresh?.config || {}), botHealth: captured };
          if (quotaChat != null) {
            config.waQuota = applyQuotaSend(fresh?.config?.waQuota, {
              now,
              chat: quotaChat,
              ok: evt.ok,
            });
          }
          return { config };
        },
        { columns: "id, config, updated_at", retries: 3 }
      );
      if (res?.ok && captured) next = captured;
    } catch {
      /* הכתיבה היא בונוס ניטור — הכשל כבר תועד ב־diag_events */
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * גל 5, פריט 5.5 (E9): רישום דריכה של שער המסירה המאוחרת.
 * כל דריכה → שורת diag_events ‏(kind: "wa-late-gate") עם סוגי הפקודות,
 * מזהה ההודעה והסיבה — בלי תוכן ההודעה. בליעת פקודת כסף → גם שורת
 * בריאות ב־config.botHealth ‏(lastGateAt/lastGateKinds/gateCount),
 * שהבעלים רואה במתג הבוט. הכתיבה דרך CAS עם חישוב בתוך ה־build
 * (אותו דפוס כמו 5.7). לעולם לא זורק.
 */
export async function recordGateSwallow({ supabase = null, groupId = null, gate = null } = {}) {
  try {
    if (!gate) return;
    const now = Date.now();
    const sb = supabase || getAdminSupabase();
    const kinds = Array.isArray(gate.kinds) ? gate.kinds.filter((k) => typeof k === "string") : [];
    await insertDiag(sb, "wa-late-gate", {
      now,
      where: "whatsapp/late-gate",
      message: `פקודה נבלעה בשער מסירה מאוחרת (${kinds.join(", ") || "?"})`,
    }, {
      groupId,
      kinds,
      money: Boolean(gate.money),
      msgId: gate.msgId ?? null,
      reason: gate.reason || "late-delivery",
    });
    if (!groupId || !gate.money) return;
    try {
      await updateGroupCas(
        sb,
        groupId,
        (fresh) => {
          const prevHealth = fresh?.config?.botHealth || {};
          return {
            config: {
              ...(fresh?.config || {}),
              botHealth: {
                ...prevHealth,
                lastGateAt: now,
                lastGateKinds: kinds,
                gateCount: (Number(prevHealth.gateCount) || 0) + 1,
                updatedAt: now,
              },
            },
          };
        },
        { columns: "id, config, updated_at", retries: 3 }
      );
    } catch {
      /* שורת הבריאות היא בונוס — המשואה ב־diag כבר נכתבה */
    }
  } catch {
    /* רישום לעולם לא שובר את נתיב הוובהוק */
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
