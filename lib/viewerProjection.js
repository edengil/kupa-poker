/* ============================================================================
   הקרנת הצופה האחת — גל 7, פריט 7.3.

   עד הגל חיו במערכת שתי רשימות הסרה נפרדות להקרנת הצופה: אחת בצד ה־JS
   (lib/publicShare.js) ואחת בצד ה־SQL (פונקציות ההקרנה במיגרציות).
   מעכשיו הרשימה מוגדרת כאן, במקום אחד, ושני הצדדים נבדקים מולה:
   בדיקת ההשוואה ב־test/wave7ViewerProjection.test.js מריצה את שרשרת
   המיגרציות המלאה ב־PGlite ומשווה את פלט ה־SQL לפלט ה־JS שדה־שדה.

   כלל potPaid האחיד והמוצהר: potPaid הוא נתון מנהל — הוא נשמר באחסון
   תמיד (סימון ציבורי לא מוחק אותו), ומוסר מכל הקרנת צופה, בנתונים
   וב־live, בשני הצדדים. לא קיים שום נתיב צופה שמחזיר potPaid.
   ============================================================================ */

/** מפתחות שמוסרים מכל ערב שמור בהקרנת צופה. */
export const VIEWER_SESSION_STRIP_KEYS = Object.freeze([
  "savingsPot",
  "savingsPotActual",
  "coupleFills",
]);

/** מפתחות שמוסרים מ־manualSettlement של ערב מוקרן. */
export const VIEWER_MANUAL_SETTLEMENT_STRIP_KEYS = Object.freeze([
  "frozenActual",
  "frozenReal",
  "frozenAuto",
]);

/** מפתחות שמוסרים משורש ה־data בהקרנת צופה (שני מצבי השיתוף). */
export const VIEWER_DATA_STRIP_KEYS = Object.freeze([
  "savingsPot",
  "savingsWithdrawals",
]);

/** מפתחות שמוסרים משורש ה־live בהקרנת צופה. */
export const VIEWER_LIVE_STRIP_KEYS = Object.freeze([
  "savingsPot",
  "savingsPotActual",
  "savingsWithdrawals",
  "potDraft",
  "frozenActual",
  "potPaid", // כלל potPaid האחיד: מוסר מה־live כמו מהנתונים
  "coupleFills",
  "applied",
]);

/**
 * הסרת מפתחות מרשימת־ההסרה מאובייקט — עזר טהור של ההקרנה.
 * מחזיר את אותו אובייקט כשאין מה להסיר (זהות הפניה נשמרת).
 */
export function stripKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return obj;
  let changed = false;
  const out = { ...obj };
  for (const k of keys) {
    if (k in out) {
      delete out[k];
      changed = true;
    }
  }
  return changed ? out : obj;
}
