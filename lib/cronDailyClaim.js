/* ============================================================================
   פריט 9 (גל C, חלופה מינימלית A) — תביעת ריצה יומית לקרון היומי.

   הבעיה: הקרון היומי נורה פעמיים ביום מ־Vercel (05:00 ו־06:00 UTC, כדי
   ש־08:00 ישראל ייתפס גם בקיץ וגם בחורף). שער השעה מסנן אחת מהן, אבל
   ירי כפול אמיתי (retry של Vercel, קריאה ידנית חוזרת, חפיפת שתי ריצות)
   היה מריץ את כל הרצים שוב — ההגנה היחידה הייתה חותמות פרטניות בתוך
   כל רץ. כאן נוספת שכבת תביעה ברמת הרץ, מעל החותמות הקיימות (לא במקומן):

   - מפתח התביעה הוא התאריך בירושלים (YYYY-MM-DD, Asia/Jerusalem) —
     לא תאריך UTC: שני היריים של אותו בוקר ישראלי חולקים מפתח אחד.
   - התביעה היא פר־רץ: רץ שהושלם בלי לזרוק נתבע לאותו יום; רץ שזרק
     לא נתבע, וירי חוזר יריץ רק אותו (בידוד כשל + שחזור מקריסה).
   - המצב חי בשדה סטטוס קיים — groups.config.cronDailyClaims דרך
     updateGroupCas (אותו מנגנון CAS של כל חותמות הרצים). אין טבלה חדשה.
   - המודול טהור לגמרי: אין מצב מודולרי משותף, כל פונקציה מחזירה
     אובייקט חדש ולא משנה את הקלט — אין דליפת מצב בין ריצות.

   פורמט המצב: { "2026-11-26": { reports: "<iso>", payments: "<iso>", … } }
   נשמרים לכל היותר שבעת המפתחות האחרונים (גיזום דטרמיניסטי לפי תאריך).
   ============================================================================ */

/** שמות הרצים של הקרון היומי, בסדר הריצה בנתיב. */
export const CRON_DAILY_RUNNERS = ["reports", "payments", "notices", "pushes", "backups"];

/** כמה ימי תביעה נשמרים במצב (השאר נגזם, מהישן לחדש). */
export const CRON_CLAIMS_KEEP_DAYS = 7;

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  hour: "numeric",
  hour12: false,
});

/** תאריך YYYY-MM-DD בשעון ירושלים — זהה ל־jerusalemYmd של paymentReminder. */
export function cronDailyClaimKey(date = new Date()) {
  return ymdFmt.format(date);
}

/** שעה 0–23 בשעון ירושלים — זהה ל־jerusalemHour של paymentReminder. */
export function cronDailyJerusalemHour(date = new Date()) {
  const raw = hourFmt.format(date);
  const hour = Number(String(raw).replace(/\D/g, "").slice(0, 2));
  return Number.isFinite(hour) ? hour % 24 : NaN;
}

/** רשימת הרצים שכבר נתבעו למפתח, מתוך מצב גולמי (כל קלט חריג → ריק). */
export function claimedRunnersFor(claims, key) {
  const day = claims && typeof claims === "object" ? claims[key] : null;
  if (!day || typeof day !== "object") return [];
  return CRON_DAILY_RUNNERS.filter((name) => typeof day[name] === "string" && day[name]);
}

/**
 * תוכנית ריצה: אילו רצים ממתינים (לא נתבעו) ואילו כבר נתבעו למפתח של
 * התאריך. טהור — לא משנה את claims.
 */
export function planCronDailyRun(claims, date = new Date()) {
  const key = cronDailyClaimKey(date);
  const claimed = claimedRunnersFor(claims, key);
  const pending = CRON_DAILY_RUNNERS.filter((name) => !claimed.includes(name));
  return { key, claimed, pending };
}

/**
 * סימון רץ כנתבע למפתח — מחזיר אובייקט מצב חדש (הקלט לא משתנה),
 * עם גיזום לשבעת המפתחות האחרונים.
 */
export function markRunnerClaimed(claims, key, runner, atIso) {
  const base = claims && typeof claims === "object" ? claims : {};
  const next = { ...base, [key]: { ...(base[key] || {}), [runner]: atIso } };
  const keys = Object.keys(next).sort();
  while (keys.length > CRON_CLAIMS_KEEP_DAYS) {
    delete next[keys.shift()];
  }
  return next;
}
