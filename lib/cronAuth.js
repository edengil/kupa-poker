/* ============================================================================
   אימות קריאות cron ושערי ניהול לנתיבי API — הפרדת סודות לפי תפקיד
   (גל 4ב, ממצא ביקורת 23). עד הגל, סוד ה־webhook שימש שלושה תפקידים:
   גם שער ל־webhook עצמו, גם אישור לקריאות cron, וגם שער לנתיבי הניהול —
   לצד מעקף בלי סוד בכלל (כותרת x-vercel-cron שהתקבלה תמיד).

   התפקידים מעכשיו:
   - webhook: ‏WHATSAPP_WEBHOOK_SECRET — רק app/api/whatsapp (שם, לא כאן).
   - קרונים: ‏CRON_SECRET בכותרת Bearer — ‏Vercel Cron שולח אותו אוטומטית
     כשהוא מוגדר בפרויקט.
   - ניהול: ‏ADMIN_SECRET — ‏/api/health ו־/api/whapi-setup בלבד.

   נפילות מבוקרות (תאימות־אחורה עד להשלמת הרוטציה ב־Vercel; צעדי הרוטציה
   מתועדים בדיווח הגל, והסרת הנפילות היא שורת־מחיקה אחת בכל אתר):
   - קרון עם ?secret=<סוד־ה־webhook> עדיין מתקבל: קריאות ידניות ומפעילים
     חיצוניים ישנים השתמשו בסוד המשותף. [LEGACY-FALLBACK: cron←webhook]
   - כותרת x-vercel-cron מתקבלת רק כש־CRON_SECRET לא מוגדר כלל (מצב
     ההקמה הישן שבו הדוחות נחסמו ב־403 כל בוקר). מהרגע ש־CRON_SECRET
     מוגדר, הכותרת לבדה לא מספיקה — היא ניתנת לזיוף בידי כל אחד, ו־Vercel
     שולח אז גם את ה־Bearer. [LEGACY-FALLBACK: vercel-cron-header]
   - שער ניהול בלי ADMIN_SECRET נופל לסוד ה־webhook; מהרגע ש־ADMIN_SECRET
     מוגדר, רק הוא פותח את השערים. [LEGACY-FALLBACK: admin←webhook]
   ============================================================================ */

import { envValue } from "./env.js";

/** אימות קריאת cron (Vercel Cron / מפעיל חיצוני / הרצה ידנית). */
export function authorizedCron(request) {
  const url = new URL(request.url);
  const qs = url.searchParams.get("secret");
  const header = request.headers.get("authorization") || "";
  const vercelCron = request.headers.get("x-vercel-cron") === "1";

  const cronSecret = envValue("CRON_SECRET");
  if (cronSecret && header === `Bearer ${cronSecret}`) {
    return true;
  }
  /* [LEGACY-FALLBACK: cron←webhook] הסוד המשותף הישן כקרון */
  const legacy = envValue("WHATSAPP_WEBHOOK_SECRET");
  if (legacy && qs === legacy) {
    return true;
  }
  /* [LEGACY-FALLBACK: vercel-cron-header] רק במצב הקמה בלי CRON_SECRET */
  if (!cronSecret && vercelCron) return true;
  return false;
}

/** אימות שער ניהול (?secret=) — ADMIN_SECRET, עם נפילה לסוד ה־webhook. */
export function authorizedAdmin(request) {
  const given = new URL(request.url).searchParams.get("secret");
  /* [LEGACY-FALLBACK: admin←webhook] */
  const secret = envValue("ADMIN_SECRET") || envValue("WHATSAPP_WEBHOOK_SECRET");
  return Boolean(secret) && given === secret;
}
