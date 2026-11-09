/* ============================================================================
   אובייקט התקופה הקנוני — גל 7, פריט 7.2 (ממצא ח-42).

   עד הגל חיו במערכת שני ייצוגי תקופה: של השרת (lib/summary.js — kinds
   קצרים "m"/"q"/"h"/"y", מפתח מרופד "m:2026-09", כותרות "סיכום ספטמבר
   2026") ושל האפליקציה (lib/poker/summaryPeriods.ts — kinds ארוכים,
   מפתח לא־מרופד "2026-9"). מעכשיו יש ייצוג אחד, והפורמט הקנוני הוא
   פורמט השרת — הוא זה שכתוב ב־config.sentReports בייצור:

     תקופה = { kind: "m"|"q"|"h"|"y", y, mo?/q?/h?, key, label }
     key:  m:YYYY-MM (מרופד) · q:YYYY-Qn · h:YYYY-Hn · y:YYYY
     label: כותרת הדוח של השרת (reportTitle) — היא גם תווית הכרטיסים
            בתוך מבנה התקופה; הטקסט שהמשתמש רואה בכרטיסי האפליקציה
            ממשיך להגיע מ־summaryPeriods כמו קודם.

   תאימות אחורה של חותמות sentReports: הקורא (isReportSent ובונה
   החותמות ב־runPeriodReports) מקבל את שני הפורמטים — הקנוני ומפתח
   האפליקציה הישן — אבל כותב רק את הקנוני. כך שום דוח לא נשלח פעמיים
   ולא מדולג במעבר, גם אם בנתונים יושבת חותמת בפורמט הישן.

   חישוב הסכומים: periodTotals ב־totals.js הוא המימוש היחיד. השרת
   (buildPeriodReport) קורא לו דרך periodTotalsForReport; ההתאמות
   המתועדות בין שני הצדדים מרוכזות ב־reportSessionsForTotals למטה.
   ============================================================================ */

import { AL } from "./helpers.js";

/** הסוגים הקנוניים (פורמט השרת). */
export const PERIOD_KINDS = ["m", "q", "h", "y"];

/* המרה מסוג האפליקציה ההיסטורי לסוג הקנוני (לקריאת חותמות ישנות). */
const APP_KIND_TO_CANONICAL = { month: "m", quarter: "q", half: "h", year: "y" };
const CANONICAL_TO_APP_KIND = { m: "month", q: "quarter", h: "half", y: "year" };

/** המפתח הקנוני של תקופה (פורמט השרת — מרופד). */
export function periodKey(period) {
  const { kind, y } = period;
  if (kind === "m") return `m:${y}-${String(period.mo).padStart(2, "0")}`;
  if (kind === "q") return `q:${y}-Q${period.q}`;
  if (kind === "h") return `h:${y}-H${period.h}`;
  return `y:${y}`;
}

/** כותרת התקופה הקנונית (זהה ל־reportTitle של השרת). */
export function periodLabel(period, months) {
  const { kind, y } = period;
  if (kind === "m") return `סיכום ${months[period.mo - 1]} ${y}`;
  if (kind === "q") return `סיכום רבעון ${period.q} · ${y}`;
  if (kind === "h")
    return period.h === 1
      ? `סיכום חצי שנה · ינואר–יוני ${y}`
      : `סיכום חצי שנה · יולי–דצמבר ${y}`;
  return `סיכום שנת ${y}`;
}

/** בונה אובייקט תקופה קנוני מלא (עם key ו־label) מחלקיו. */
export function makePeriod(parts, months) {
  const period = { ...parts };
  period.key = periodKey(period);
  period.label = periodLabel(period, months);
  return period;
}

/**
 * מפתח התקופה בפורמט האפליקציה הישן (לא־מרופד, בלי קידומת סוג) —
 * משמש רק את קורא החותמות לתאימות אחורה; שום כתיבה לא משתמשת בו.
 */
export function legacyAppKey(period) {
  const { kind, y } = period;
  if (kind === "m") return `${y}-${period.mo}`;
  if (kind === "q") return `${y}-Q${period.q}`;
  if (kind === "h") return `${y}-H${period.h}`;
  return `${y}`;
}

/** פירוק מפתח חותמת בכל אחד משני הפורמטים לאובייקט תקופה (בלי label).
    חודש מחוץ ל־1..12 אינו תקופה — מחזיר null. */
export function parseReportKey(key) {
  if (typeof key !== "string") return null;
  const month = (y, mo) => (mo >= 1 && mo <= 12 ? { kind: "m", y, mo } : null);
  let m = key.match(/^m:(\d{4})-(\d{2})$/);
  if (m) return month(+m[1], +m[2]);
  m = key.match(/^q:(\d{4})-Q([1-4])$/);
  if (m) return { kind: "q", y: +m[1], q: +m[2] };
  m = key.match(/^h:(\d{4})-H([12])$/);
  if (m) return { kind: "h", y: +m[1], h: +m[2] };
  m = key.match(/^y:(\d{4})$/);
  if (m) return { kind: "y", y: +m[1] };
  /* פורמט האפליקציה הישן */
  m = key.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return month(+m[1], +m[2]);
  m = key.match(/^(\d{4})-Q([1-4])$/);
  if (m) return { kind: "q", y: +m[1], q: +m[2] };
  m = key.match(/^(\d{4})-H([12])$/);
  if (m) return { kind: "h", y: +m[1], h: +m[2] };
  m = key.match(/^(\d{4})$/);
  if (m) return { kind: "y", y: +m[1] };
  return null;
}

/**
 * האם הדוח של התקופה כבר נשלח — לפי מפת החותמות, בשני הפורמטים.
 * זהו הקורא היחיד של sentReports; הכתיבה תמיד במפתח הקנוני.
 */
export function isReportSent(sentReports, period) {
  if (!sentReports || typeof sentReports !== "object") return false;
  if (sentReports[periodKey(period)]) return true;
  return Boolean(sentReports[legacyAppKey(period)]);
}

/** הסוג הקנוני מתוך סוג אפליקציה היסטורי (או להפך) — לגשרי תאימות. */
export function canonicalKind(appKind) {
  return APP_KIND_TO_CANONICAL[appKind] || appKind;
}
export function appKind(canonical) {
  return CANONICAL_TO_APP_KIND[canonical] || canonical;
}

/**
 * כינויי הדוח האפקטיביים — החליף את reportAliases הפרטי של summary.js.
 * נגזר מהמפה האחת (names.js) דרך helpers.AL, שהיא בדיוק אותה סמנטיקה
 * שהייתה ל־reportAliases: ברירת־המחדל קובעת ותוספות המשתמש נשמרות.
 * (deriveAliases של names.js בונה תת־מפה לפי רשימת מפתחות — לא אותו
 * חוזה; החוזה כאן הוא מיזוג מלא, ולכן המימוש הוא AL עצמו.)
 */
export function effectiveReportAliases(dataAliases) {
  return AL({ aliases: dataAliases || {} });
}

/* ------------------------------------------------------------------
   גשר חישוב הסכומים של דוח השרת מעל המימוש האחד.

   periodTotals מסנן ערבים לפי שדות y/mo מספריים בלבד, ואילו הדוח
   ההיסטורי סינן לפי sessionYm — שמסיק שנה/חודש גם מ־iso כש־y/mo
   חסרים או לא־מספריים. כדי שהסכומים יישארו זהים בדיוק, הערבים
   מועברים ל־reportTotalsAndNights (שמעל aggregate של totals.js)
   בצורה מנורמלת: y/mo מוחלפים בערכי sessionYm, וערב בלי חודש תקף
   בכלל לא מועבר. שלוש התאמות נוספות מתועדות ומכוונות:
   - שורת yearly רשמית: periodTotals מעדיף אותה לדוח שנתי, הדוח
     ההיסטורי סיכם ערבים בלבד — לכן הגשר מקבל ערבים בלבד, בלי yearly.
   - שם שחקן ריק/מרווחים: aggregate מדלג רק על undefined; הדוח
     דילג על שם ריק אחרי trim. מנרמלים שמות ב־trim ומסננים ריקים.
   - שחקן שהופיע רק עם amount חסר/לא־מספרי: הדוח כלל אותו בסכום 0,
     aggregate מדלג. לא מועברת שורת אפס — השם פשוט לא יופיע; זה
     הבדל תצוגה בשורת "0₪" של שחקן ללא תנועה כספית, שלא קיים
     בנתוני הייצור (לכל entry יש amount).
   ------------------------------------------------------------------ */
export function reportSessionsForTotals(sessions, sessionYmOf) {
  const out = [];
  for (const s of sessions || []) {
    const ym = sessionYmOf(s);
    if (ym == null) continue;
    const y = Math.floor(ym / 100);
    const mo = ym % 100;
    /* שמות מנורמלים ב־trim אבל לא מסוננים: שם ריק אחרי trim הוא
       שחקן לגיטימי של הדוח ההיסטורי ("" עם סכומו), ו־aggregate
       מקבל אותו כמות שהוא. סינון היה משנה את הטבלה. */
    const entries = (s.entries || []).map((e) => ({
      ...e,
      name: String(e?.name ?? "").trim(),
    }));
    out.push({ ...s, y, mo, entries });
  }
  return out;
}
