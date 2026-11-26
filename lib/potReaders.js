/* ============================================================================
   קוראי־הקופה הטהורים של ערב שמור — מוצו מ־lib/nightShare.js (גל B, מנה 5.1,
   מיצוי־בלבד, אפס שינוי התנהגות). כל הפונקציות כאן רק קוראות שדות מה־session
   ומחזירות סכום/דגל; שום חישוב חלוקה ושום כתיבה. nightShare מייצא את כולן
   הלאה (re-export), כך שאף יבואן לא השתנה.
   sessionHasBuyinChips עבר לכאן כי הוא התלות הפנימית היחידה של
   potRecordedFor — העברתו מונעת ייבוא מעגלי וחזרה על הלוגיקה.
   ============================================================================ */

import { r2, potForBuyin } from "./poker/helpers.js";

/** האם לרשומות יש buyin/chips (לייב) או רק נטו (הזנה ידנית). */
export function sessionHasBuyinChips(session) {
  const entries = session?.entries || [];
  return entries.some((e) => e.buyin != null || e.chips != null);
}

/**
 * קופת החיסכון (חיסכון 5% מהג'יטונים) התחילה בערב 10.10.2026 — רק מערב
 * זה ואילך. בערבים קודמים אין קופה: עודף ברישום מתחלק כרגיל בין החייבים,
 * כמו שהיה בפועל כשאותם ערבים נסגרו (תיקון מעדן, 2026-10-13).
 */
const POT_START_ISO = "2026-10-10";

export function sessionHasPot(session) {
  const iso = String(session?.iso || "");
  return iso !== "" && iso >= POT_START_ISO;
}

/** סכום הקופה הרשום לערב: השדה המתועד; אם חסר והמתג דלק — 5% מהקניות. */
export function potRecordedFor(session) {
  if (!sessionHasPot(session)) return 0;
  const raw = session?.savingsPot;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw))) return r2(Number(raw));
  if (session?.savings5 && sessionHasBuyinChips(session)) {
    // נוסחת הקופה האחת (גל 4, ממצא 14): סכום potForBuyin על כל רשומת
    // קנייה — אותו חישוב בדיוק כמו צבירת הלייב, לא נוסחת־סכום נפרדת.
    // (העיגול לשקלים שלמים קורה רק בנקודת בניית התוכנית.)
    return r2((session.entries || []).reduce((s, e) => s + potForBuyin(+e.buyin || 0), 0));
  }
  return 0;
}

/** סכום הקופה בפועל לערב: שדה savingsPotActual אם הוגדר, אחרת הרשום. */
export function potActualFor(session) {
  const raw = session?.savingsPotActual;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
    return r2(Number(raw));
  }
  return potRecordedFor(session);
}

/**
 * סכום הקופה בתוכנית החלוקה (הכרעת עדן, 25.10 — R3): אם נערך "בפועל"
 * (savingsPotActual) — ההעברה לקופה בתוכנית היא הבפועל; בלי שדה — הרשום.
 * זהו בדיוק potActualFor; השם הנפרד מסמן שהשימוש הוא בבניית התוכנית.
 * פנקס הקופה (רשום/בפועל/יתרות ב־potOverview) לא נגזר מכאן ולא משתנה.
 */
export function potPlanFor(session) {
  /* הקפאת Pot Boost (25.11.2026): מרגע שנכתבה הקפאה (frozenPot בתוך
     manualSettlement — בסימון ראשון או בשמירת עורך ראשונה), סכום הקופה
     בתוכנית הוא המוקפא, לא השדות החיים. עריכת "בפועל" אחרי ההקפאה מזיזה
     רק את תצוגת המנהל/יתרת המזומן, ועריכת "רשום" — רק את הפנקס. */
  const frozen = session?.manualSettlement?.frozenPot;
  if (frozen != null && frozen !== "" && Number.isFinite(Number(frozen))) {
    return r2(Number(frozen));
  }
  return potActualFor(session);
}

/**
 * הקופה של הערב — מעכשיו (25.10) זהו הסכום הרשום (ה־5%), לא פער הערב.
 * נשמר השם computedPot לתאימות קוראים; פער הערב (נטו + טיפים, כלל 11.11)
 * זמין דרך nightGap.
 */
export function computedPot(session) {
  return potRecordedFor(session);
}
