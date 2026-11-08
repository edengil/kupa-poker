/* ============================================================================
   מד מכסת Whapi — לוגיקה טהורה, בלי תלויות שרת (גם BotToggle משתמש).

   גל 5, פריט 5.6 (ממצא 20): עד היום גילו את קיר ה־Sandbox רק כששליחה
   נכשלה עליו (402). עכשיו כל שליחה שמדווחת ל־recordWaSend עם יעד
   נספרת ב־config.waQuota של הקבוצה (דרך אותו CAS של 5.7), והבעלים
   רואה את המד בבריאות הבוט לפני הקיר. מגבלות ה־Sandbox החינמי:
   150 הודעות ביום, 5 שיחות בחודש, 1,000 בקשות בחודש.
   הספירה היא מד־הערכה מקומי (שליחות שהבוט רשם), לא חיוב — Whapi
   סופר גם בקשות אחרות על הערוץ.
   ============================================================================ */

export const WHAPI_LIMITS = {
  sendsPerDay: 150,
  conversationsPerMonth: 5,
  requestsPerMonth: 1000,
};

/** מתחת לשארית הזו נדנודים לא־חיוניים מדלגים — שומרים מכסה לכסף. */
export const NUDGE_RESERVE_SENDS = 30;
const WARN_FRACTION = 0.8;
const REQUEST_RESERVE = 50;

function jerusalemDayMonth(now) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(now));
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    return { day, month: day.slice(0, 7) };
  } catch {
    const d = new Date(now);
    const day = d.toISOString().slice(0, 10);
    return { day, month: day.slice(0, 7) };
  }
}

export function emptyWaQuota() {
  return { day: null, sends: 0, month: null, requests: 0, chats: [] };
}

/**
 * מקפל שליחה אחת לתוך המד. chat = מפתח יעד סמלי ("group" / "dm" /
 * "chat") לספירת שיחות החודש. בקשה נספרת תמיד; הודעה — רק בהצלחה.
 */
export function applyQuotaSend(prev, { now = Date.now(), chat = null, ok = true } = {}) {
  const { day, month } = jerusalemDayMonth(now);
  const base = { ...emptyWaQuota(), ...(prev || {}) };
  const sameDay = base.day === day;
  const sameMonth = base.month === month;
  let chats = sameMonth && Array.isArray(base.chats) ? base.chats : [];
  if (chat && !chats.includes(chat)) chats = [...chats, chat].slice(0, 50);
  return {
    day,
    sends: (sameDay ? Number(base.sends) || 0 : 0) + (ok ? 1 : 0),
    month,
    requests: (sameMonth ? Number(base.requests) || 0 : 0) + 1,
    chats,
  };
}

/** תצוגת המד לבעלים + החלטת דילוג על נדנודים. */
export function waQuotaView(quota, now = Date.now()) {
  const { day, month } = jerusalemDayMonth(now);
  const q = { ...emptyWaQuota(), ...(quota || {}) };
  const sendsToday = q.day === day ? Number(q.sends) || 0 : 0;
  const requestsMonth = q.month === month ? Number(q.requests) || 0 : 0;
  const conversationsMonth =
    q.month === month && Array.isArray(q.chats) ? q.chats.length : 0;
  const full =
    sendsToday >= WHAPI_LIMITS.sendsPerDay ||
    requestsMonth >= WHAPI_LIMITS.requestsPerMonth ||
    conversationsMonth >= WHAPI_LIMITS.conversationsPerMonth;
  const near =
    full ||
    sendsToday >= WHAPI_LIMITS.sendsPerDay * WARN_FRACTION ||
    requestsMonth >= WHAPI_LIMITS.requestsPerMonth * WARN_FRACTION ||
    conversationsMonth >= WHAPI_LIMITS.conversationsPerMonth * WARN_FRACTION;
  return {
    sendsToday,
    sendsLimit: WHAPI_LIMITS.sendsPerDay,
    requestsMonth,
    requestsLimit: WHAPI_LIMITS.requestsPerMonth,
    conversationsMonth,
    conversationsLimit: WHAPI_LIMITS.conversationsPerMonth,
    level: full ? "full" : near ? "near" : "ok",
    /* נדנוד לא־חיוני מדלג כשהמכסה היומית קרובה לקיר (רזרבה לתזכורות
       כסף), כששיחות החודש נגמרו, או כשמרווח הבקשות האחרון נשמר. */
    nudgesBlocked:
      sendsToday >= WHAPI_LIMITS.sendsPerDay - NUDGE_RESERVE_SENDS ||
      conversationsMonth >= WHAPI_LIMITS.conversationsPerMonth ||
      requestsMonth >= WHAPI_LIMITS.requestsPerMonth - REQUEST_RESERVE,
  };
}

/** האם לדלג על נדנוד לא־חיוני לפי המד הנוכחי. */
export function shouldSkipNudge(quota, now = Date.now()) {
  return waQuotaView(quota, now).nudgesBlocked;
}
