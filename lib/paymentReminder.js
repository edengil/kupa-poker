import { paymentPlan } from "./paymentTracking";
import { withBotMark } from "./botMark";
import { settlementAppUrl } from "./settlementInvite";
import { latestSession } from "./lastSession";

/** שעת שליחה בכל בוקר שבו עדיין יש העברות פתוחות (שעון ישראל). */
export const PAYMENT_REMINDER_HOUR = 8;

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

/** האם עכשיו בדיוק 08:00 ישראל. cron רץ ב־05 וב־06 UTC, ורק השעה 8 עוברת. */
export function isPaymentReminderWindow(date = new Date(), { force = false } = {}) {
  if (force) return true;
  return jerusalemHour(date) === PAYMENT_REMINDER_HOUR;
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
 * מהבוקר שאחרי הערב, בכל בוקר, כל עוד נשארו העברות פתוחות.
 * שליחה שהצליחה היום לא נשלחת שוב באותו בוקר.
 */
export function paymentReminderDue(session, todayYmd, { force = false, alreadySent = {} } = {}) {
  if (!session?.id || !session?.iso) return { due: false, reason: "no session" };
  if (!force && alreadySent[session.id] === todayYmd) return { due: false, reason: "already sent" };
  const morningAfter = addDaysIso(session.iso, 1);
  if (!morningAfter) return { due: false, reason: "bad iso" };
  if (!force && todayYmd < morningAfter) return { due: false, reason: "not morning after" };
  const unpaid = unpaidTransfers(session);
  if (!unpaid.length) return { due: false, reason: "nothing open" };
  return { due: true, unpaid, morningAfter };
}

/**
 * תזכורת היום: הערב האחרון, וגם ערב שכבר נשלחה עליו תזכורת ועדיין פתוח.
 * ערבים ישנים בלי סדרה לא נכנסים — אין להם סימון «שולם», והקבוצה הייתה מקבלת מאות הודעות.
 */
export function sessionsDueForPaymentReminder(sessions, todayYmd, opts = {}) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const latestId = latestSession(list)?.id ?? null;
  const alreadySent = opts.alreadySent || {};
  return list
    .map((session) => ({ session, check: paymentReminderDue(session, todayYmd, opts) }))
    .filter((x) => x.check.due)
    .filter((x) => x.session.id === latestId || Boolean(alreadySent[x.session.id]));
}

/** טקסט לוואטסאפ — לינק לחלוקה אם עדיין לא כולם סימנו שולם. */
export function buildPaymentReminderText(session, unpaid, { siteUrl, slug } = {}) {
  const dateLabel =
    session?.d != null && session?.mo != null
      ? `${session.d}.${session.mo}`
      : String(session?.iso || "");
  const openCount = (unpaid || []).length;
  const url = settlementAppUrl({ siteUrl, slug, sessionId: session?.id });
  return withBotMark(
    [
      `בוקר טוב — חלוקת ערב ${dateLabel}`,
      "",
      openCount
        ? `לא כולם עדיין העבירו (${openCount} פתוחות). נא לאשר בלינק:`
        : "נראה שהכול סומן — כדאי לוודא באפליקציה:",
      url || "(לינק לא מוגדר)",
      "",
      "בלינק רואים מי כבר העביר ומי עדיין ממתין.",
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
