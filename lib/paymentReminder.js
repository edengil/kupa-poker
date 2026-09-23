import { paymentPlan } from "./paymentTracking";
import { withBotMark } from "./botMark";

/** שעת שליחה ליום שאחרי המשחק (שעון ישראל). */
export const PAYMENT_REMINDER_HOUR = 10;

/** תאריך YYYY-MM-DD לפי שעון ישראל. */
export function jerusalemYmd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** שעה 0–23 לפי שעון ישראל. */
export function jerusalemHour(date = new Date()) {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    hour12: false,
  }).format(date);
  const hour = Number(String(raw).replace(/\D/g, "").slice(0, 2));
  return Number.isFinite(hour) ? hour % 24 : NaN;
}

/** האם עכשיו חלון השליחה (~10:00 ישראל). 9–11 בגלל DST + cron יומי ב־07 UTC. */
export function isPaymentReminderWindow(date = new Date(), { force = false } = {}) {
  if (force) return true;
  const h = jerusalemHour(date);
  return h >= 9 && h <= 11;
}

/** חיבור ימים לתאריך ISO (לוח גרגוריאני, בלי אזור זמן). */
export function addDaysIso(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** העברות שעדיין לא סומנו כשולמו. */
export function unpaidTransfers(session) {
  const { transfers, paid } = paymentPlan(session);
  return transfers
    .map((t, i) => ({ ...t, index: i }))
    .filter((t) => !paid[t.index]);
}

/**
 * האם לשלוח תזכורת אישור העברות לערב הזה.
 * ברירת מחדל: בוקר למחרת (iso + 1) לפי שעון ישראל, ורק אם יש פתוחות.
 */
export function paymentReminderDue(session, todayYmd, { force = false, alreadySent = {} } = {}) {
  if (!session?.id || !session?.iso) return { due: false, reason: "no session" };
  if (!force && alreadySent[session.id]) return { due: false, reason: "already sent" };
  const morningAfter = addDaysIso(session.iso, 1);
  if (!morningAfter) return { due: false, reason: "bad iso" };
  if (!force && morningAfter !== todayYmd) return { due: false, reason: "not morning after" };
  const unpaid = unpaidTransfers(session);
  if (!unpaid.length) return { due: false, reason: "nothing open" };
  return { due: true, unpaid, morningAfter };
}

/** כל הערבים שמגיע להם תזכורת היום. */
export function sessionsDueForPaymentReminder(sessions, todayYmd, opts = {}) {
  return (Array.isArray(sessions) ? sessions : [])
    .map((session) => ({ session, check: paymentReminderDue(session, todayYmd, opts) }))
    .filter((x) => x.check.due);
}

/** טקסט לוואטסאפ — לינק לאפליקציה לסימון שולם (בלי פירוט העברות). */
export function buildPaymentReminderText(session, unpaid, { siteUrl, slug } = {}) {
  const dateLabel =
    session?.d != null && session?.mo != null
      ? `${session.d}.${session.mo}`
      : String(session?.iso || "");
  const openCount = (unpaid || []).length;
  const base = (siteUrl || "").replace(/\/$/, "");
  const url = base && slug ? `${base}/g/${slug}` : null;
  return withBotMark(
    [
      `בוקר טוב — אישור העברות מערב ${dateLabel}`,
      "",
      openCount
        ? `עדיין פתוחות ${openCount} העברות.`
        : "נראה שהכול סומן — כדאי לוודא באפליקציה.",
      "",
      "סמנו באפליקציה מי שילם (כולם רואים את הסטטוס):",
      url || "(לינק לא מוגדר)",
    ].join("\n")
  );
}

export function siteUrlFromEnv() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null)
  );
}
