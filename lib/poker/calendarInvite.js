/* ============================================================================
   זימון ביומן גוגל — בניית URL ליצירת אירוע עם השחקנים כאורחים.

   אין צורך ב-OAuth או בטוקנים: הכפתור פותח את טופס יצירת האירוע של גוגל
   כשהכותרת, התאריכים, המיקום ורשימת האורחים כבר מלאים. כשהבעלים לוחץ
   "שמור" ביומן, גוגל שולחת אוטומטית זימון לכל האורחים.
   ============================================================================ */

const CAL_BASE = "https://calendar.google.com/calendar/render";

/* משך ברירת מחדל לערב פוקר בשעות — לאירוע היומן בלבד. */
export const CAL_EVENT_HOURS = 4;

/**
 * ממיר תאריך ISO (YYYY-MM-DD) ושעה (HH:MM) למחרוזת גוגל-קלנדר מקומית.
 * @returns {string|null} למשל "20261006T200000", או null אם הקלט לא תקין.
 */
export function toCalDateTime(iso, time) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time || "") ? time : "20:00";
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0);
  if (Number.isNaN(start.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (dt) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  const end = new Date(start.getTime() + CAL_EVENT_HOURS * 3600 * 1000);
  return `${fmt(start)}/${fmt(end)}`;
}

/**
 * בונה URL ליצירת אירוע יומן גוגל.
 * @param {object} plan — { iso, time, location, note }
 * @param {string[]} emails — כתובות האורחים
 * @returns {string|null} ה-URL המלא, או null אם אין תאריך/אין אורחים.
 */
export function buildGoogleCalendarUrl(plan, emails) {
  const list = (emails || []).filter(Boolean);
  if (!plan?.iso || !list.length) return null;
  const dates = toCalDateTime(plan.iso, plan.time);
  if (!dates) return null;
  const d = new Date(`${plan.iso}T12:00:00`);
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const dateStr = `${d.getDate()} ב${["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"][d.getMonth()]} ${d.getFullYear()}`;
  const detailsLines = ["🃏♠️♥️ ערב פוקר ♣️♦️🃏", ""];
  if (plan.location) detailsLines.push(`📍 ${plan.location}`, "");
  detailsLines.push(`🕐 יום ${weekday} · ${dateStr}${plan.time ? ` · בשעה ${plan.time}` : ""}`, "");
  if (plan.note) detailsLines.push(`📝 ${plan.note}`, "");
  detailsLines.push("יאללה בואו לשחק! 🎰", "מי שלא בא יא חלייה 😂", "אשרו הגעה כאן ביומן או באתר: https://kupa-poker.vercel.app", "נשלח מקופת הפוקר 🃏");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `🃏 ערב פוקר ♠️♥️ — יום ${weekday}`,
    dates,
    details: detailsLines.join("\n"),
    add: list.join(","),
  });
  if (plan.location) params.set("location", plan.location);
  return `${CAL_BASE}?${params.toString()}`;
}
