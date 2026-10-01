/* ============================================================================
   שכבת קריאה אחת למשתני סביבה של השרת.

   הקובץ הזה לא מחזיק ערכים ולא מדפיס אותם. הוא רק מרכז את שמות המשתנים,
   מוודא שלא קוראים שם לא מוכר, ומחזיר מחרוזת ריקה כשמשתנה לא הוגדר — בדיוק
   כמו קריאה רגילה ל־process.env, אבל בלי לפזר את השמות בכל המערכת.
   ============================================================================ */

const ENV_DEFAULTS = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_SITE_URL: "",
  WHATSAPP_WEBHOOK_SECRET: "",
  WHAPI_TOKEN: "",
  WHAPI_GROUP_ID: "",
  WHATSAPP_OWNER: "",
  WHATSAPP_ALLOWED: "",
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
  VERCEL_PROJECT_PRODUCTION_URL: "",
});

export const ENV_NAMES = Object.freeze(Object.keys(ENV_DEFAULTS));

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

/** גישה נוחה לפי שם קריא, בלי לשמור ערכים בזיכרון מעבר לקריאה עצמה. */
export const serverEnv = Object.freeze({
  get supabaseUrl() {
    return envValue("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get siteUrl() {
    return serverSiteUrl();
  },
  get whatsappWebhookSecret() {
    return envValue("WHATSAPP_WEBHOOK_SECRET");
  },
  get whapiToken() {
    return envValue("WHAPI_TOKEN");
  },
  get whapiGroupId() {
    return envValue("WHAPI_GROUP_ID");
  },
  get whatsappOwner() {
    return envValue("WHATSAPP_OWNER");
  },
  get whatsappAllowed() {
    return envValue("WHATSAPP_ALLOWED");
  },
  get groupSlug() {
    return envValue("KUPA_GROUP_SLUG");
  },
  get supabaseSecretKey() {
    return envValue("SUPABASE_SECRET_KEY");
  },
  get vapidPublicKey() {
    return envValue("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  },
  get vapidPrivateKey() {
    return envValue("VAPID_PRIVATE_KEY");
  },
  get cronSecret() {
    return envValue("CRON_SECRET");
  },
  get errorAlertWebhook() {
    return envValue("ERROR_ALERT_WEBHOOK");
  },
});
