/* --------------------------- עזרי הודעה נכנסת --------------------------- */
const digits = (v) => String(v || "").replace(/\D/g, "");

/* חותמת Whapi מגיעה בשניות (ולפעמים כבר במילישניות) — מנרמלים למילישניות. */
function tsMillis(raw) {
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return undefined;
  return ts < 1e12 ? ts * 1000 : ts;
}

/* מזהה יציב להודעה בלי מזהה משלה (ממצא 21): Whapi מנסה מסירה שוב עם
   אותו payload בדיוק, ובלי מזהה שום דבר לא מזהה את הניסיון החוזר — כל
   ניסיון מעובד כהודעה חדשה והכסף נספר שוב. המזהה המלאכותי נגזר מתוכן
   המסירה עצמה (צ'אט + שולח + חותמת זמן + גוף), כך שניסיון חוזר מקבל
   את אותו מזהה ונקלט ביומן הביטולים, והודעה שונה מקבלת מזהה אחר.
   בלי חותמת זמן אין מזהה מלאכותי — טוב פחות, אבל לא גרוע מהמצב הקודם. */
function syntheticId(m, text, tsMs) {
  if (!tsMs) return undefined;
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `syn:${m.chat_id || m.chatId || ""}:${digits(m.from)}:${tsMs}:${h.toString(36)}`;
}

export function extractMessage(body) {
  const list = Array.isArray(body?.messages) ? body.messages : [];
  for (const m of list) {
    const text = m?.text?.body ?? (typeof m?.text === "string" ? m.text : null);
    if (!text) continue;
    const timestamp = tsMillis(m?.timestamp);
    return {
      text,
      chatId: m.chat_id || m.chatId || "",
      from: digits(m.from),
      fromMe: m.from_me === true || m.fromMe === true,
      id: m.id || syntheticId(m, text, timestamp),
      timestamp,
    };
  }
  return null;
}

/* מי רשאי לפקד.
   בחרתי רשימה מפורשת ולא "מנהלי הקבוצה" משתי סיבות: משיכת רשימת המנהלים
   מ-Whapi עולה בקשה בכל הודעה ותאכל את המכסה, ומנהל בקבוצה הוא לא בהכרח מי
   שאתה רוצה שיזיז לך כסף. להוספה — WHATSAPP_ALLOWED ב-Vercel, מספרים
   מופרדים בפסיק. */
export function isAllowed(msg, ownerPhone, allowedList = "") {
  if (msg.fromMe) return true;
  const numbers = [ownerPhone, ...String(allowedList).split(",")]
    .map(digits)
    .filter((n) => n.length >= 9);
  return numbers.some((n) => msg.from.endsWith(n.slice(-9)));
}

// שם ישן, נשמר כדי לא לשבור קוד קיים
export const isOwner = isAllowed;
