/* ============================================================================
   שכבת קריאה אחת למשתני סביבה של השרת.

   הקובץ הזה לא מחזיק ערכים ולא מדפיס אותם. הוא רק מרכז את שמות המשתנים,
   מוודא שלא קוראים שם לא מוכר, ומחזיר מחרוזת ריקה כשמשתנה לא הוגדר — בדיוק
   כמו קריאה רגילה ל־process.env, אבל בלי לפזר את השמות בכל המערכת.
   ============================================================================ */

const ENV_DEFAULTS = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: "",
  // המפתח הציבורי היחיד שהקוד קורא (sb_publishable_...). שם ה־anon הישן
  // (NEXT_PUBLIC_SUPABASE_ANON_KEY) הוסר מהרישום בגל 4ב — אף נתיב לא קרא
  // אותו, והמסמכים שהורו להגדיר אותו יצרו הקמה בלי מפתח (ממצא 16).
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SITE_URL: "",
  WHATSAPP_WEBHOOK_SECRET: "",
  // סוד שערי הניהול בלבד (/api/health, /api/whapi-setup) — גל 4ב, ממצא 23.
  // כשלא מוגדר, השערים נופלים לסוד ה־webhook (הסוד המשותף הישן) עד
  // שהרוטציה תושלם; ראו lib/cronAuth.js.
  ADMIN_SECRET: "",
  WHAPI_TOKEN: "",
  WHAPI_GROUP_ID: "",
  WHATSAPP_OWNER: "",
  WHATSAPP_ALLOWED: "",
  WA_REMINDERS_TOKEN: "",
  KUPA_GROUP_SLUG: "",
  SUPABASE_SECRET_KEY: "",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  CRON_SECRET: "",
  ERROR_ALERT_WEBHOOK: "",
  GMAIL_USER: "",
  RSVP_TOKEN_SECRET: "",
  GMAIL_APP_PASSWORD: "",
  ALERT_EMAIL_TO: "",
  ALLOW_PREVIEW: "",
  GOOGLE_CALENDAR_CLIENT_ID: "",
  GOOGLE_CALENDAR_CLIENT_SECRET: "",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "",
  VERCEL_PROJECT_PRODUCTION_URL: "",
});

function assertKnownEnvName(name) {
  if (!Object.prototype.hasOwnProperty.call(ENV_DEFAULTS, name)) {
    throw new TypeError(`Unknown environment variable: ${String(name)}`);
  }
}

/** קורא משתנה מוכר. ברירת המחדל היא המחרוזת מהטבלה למעלה, בדרך כלל ריקה. */
export function envValue(name, fallback = ENV_DEFAULTS[name]) {
  assertKnownEnvName(name);
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

/** האם המשתנה הוגדר לערך לא ריק. לא מחזיר את הערך עצמו. */
export function hasEnv(name) {
  assertKnownEnvName(name);
  return Boolean(process.env[name]);
}

/** אותה כתובת אתר שהנתיבים השתמשו בה עד היום, כולל נפילה לכתובת Vercel. */
export function serverSiteUrl() {
  const configured = envValue("NEXT_PUBLIC_SITE_URL");
  if (configured) return configured;
  const vercelHost = envValue("VERCEL_PROJECT_PRODUCTION_URL");
  return vercelHost ? `https://${vercelHost}` : null;
}
